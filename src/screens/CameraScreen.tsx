import React, {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import {
  StyleSheet, View, LayoutChangeEvent, TouchableOpacity, Text, PanResponder,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import type { Frame } from 'react-native-vision-camera';
import { useRunOnJS, useSharedValue } from 'react-native-worklets-core';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { NitroModules } from 'react-native-nitro-modules';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import SpeedHUD from '../components/SpeedHUD';
import BBoxOverlay from '../components/BBoxOverlay';
import NoCameraView from '../components/NoCameraView';
import { getSettings } from '../store/settings';
import {
  getVehicleClass,
  CONFIDENCE_THRESHOLD,
} from '../utils/yoloDetector';
import type { RawDetection } from '../utils/yoloDetector';
import { IoUTracker } from '../utils/tracker';
import { computeHomography } from '../utils/homography';
import type { HomographyResult } from '../utils/homography';
import { AutoCalibrator, buildTestHomography } from '../utils/autoCalibrate';
import { logVehicleExit, ensureViolationsDir } from '../utils/violationLogger';
import type { DetectedVehicle, DetectorModel } from '../types';
import type { RootTabParamList } from '../navigation/RootNavigator';

// Static asset table — Metro requires literal require() calls. Empty stubs for
// 8s/8m ship by default; users replace them with real .tflite models.
const MODEL_ASSETS: Record<DetectorModel, number> = {
  yolov8n: require('../../assets/models/yolov8n.tflite'),
  yolov8s: require('../../assets/models/yolov8s.tflite'),
  yolov8m: require('../../assets/models/yolov8m.tflite'),
};

type CalState = 'CAL' | 'TEST-CAL' | 'NO-CAL' | `AUTO(${number})`;

const INFERENCE_EVERY_N_FRAMES = 5;
// Minimum box size as fraction of frame (filters out tiny false positives)
const MIN_BOX_FRAC = 0.04;
const MAX_BOX_W_FRAC = 0.85; // vehicles can be wide
const MAX_BOX_H_FRAC = 0.70; // vehicles shouldn't be taller than 70% of frame
// Cars/trucks are wider than tall or roughly square — never extremely thin columns
const MAX_ASPECT_RATIO = 2.5;

function loadHomography(): HomographyResult | null {
  const s = getSettings();
  if (!s.calibrationData) return null;
  try {
    return computeHomography(
      s.calibrationData.point1,
      s.calibrationData.point2,
      s.calibrationData.realWorldDistance,
    );
  } catch {
    return null;
  }
}

export default function CameraScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const settings = getSettings();

  // Detector model is user-selectable; Camera screen reloads the model when
  // the focused setting changes. Re-reading on focus keeps it cheap.
  const [modelKey, setModelKey] = useState<DetectorModel>(settings.detectorModel);

  // Load TFLite model on CPU — GPU delegate crashes on many Android devices.
  // Hook reloads when the asset reference changes (user swaps model).
  const model = useTensorflowModel(MODEL_ASSETS[modelKey], []);
  const { resize } = useResizePlugin();

  const [vehicles, setVehicles]             = useState<DetectedVehicle[]>([]);
  const [violationCount, setViolationCount] = useState(0);
  const [overlaySize, setOverlaySize]       = useState({ width: 0, height: 0 });
  const [frameSize, setFrameSize]           = useState({ width: 1, height: 1 });
  const [testMode, setTestMode]             = useState(false);
  const [debugLine, setDebugLine]           = useState('loading model...');
  const [calState, setCalState]             = useState<CalState>('NO-CAL');

  // Detection zone (ROI) — normalized 0-1 fractions of the overlay.
  // Default: center strip covering typical road lane area.
  const [roi, setRoi] = useState({ x: 0.05, y: 0.25, w: 0.90, h: 0.55 });

  // Shared values readable from worklet thread without bridge crossing.
  const testModeShared = useSharedValue(false);
  const roiShared = useSharedValue({ x: 0.05, y: 0.25, w: 0.90, h: 0.55 });
  // Bbox-coord scale: yolov8n.tflite (legacy export) emits pixel coords 0..320.
  // yolov8s/m.tflite (onnx2tf export) emit normalized coords 0..1. Scale used
  // to bring everything to normalized space inside the parser.
  const coordScaleShared = useSharedValue(modelKey === 'yolov8n' ? 320 : 1);

  useEffect(() => {
    coordScaleShared.value = modelKey === 'yolov8n' ? 320 : 1;
  }, [modelKey, coordScaleShared]);

  const frameCountRef     = useRef(0);
  const trackerRef        = useRef(new IoUTracker());
  const homographyRef     = useRef<HomographyResult | null>(loadHomography());
  const autoCalibratorRef = useRef(new AutoCalibrator());
  const inferenceBusyRef  = useRef(false);
  const prevTrackIdsRef   = useRef(new Set<string>());

  // Box the HybridObject so worklets-core can carry it across JSI runtimes.
  // (worklets-core does not support jsi::NativeState directly)
  const boxedModel = useMemo(
    () => (model.model != null ? NitroModules.box(model.model) : null),
    [model.model],
  );

  useEffect(() => {
    if (model.state === 'loaded') {
      ensureViolationsDir();
      setDebugLine('model ready');
    } else {
      setDebugLine(`model: ${model.state}`);
    }
  }, [model.state]);

  const toggleTestMode = useCallback(() => {
    setTestMode((prev) => {
      const next = !prev;
      testModeShared.value = next;
      return next;
    });
    setVehicles([]);
    setViolationCount(0);
    trackerRef.current = new IoUTracker();
    autoCalibratorRef.current.reset();
  }, [testModeShared]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.headerBtn, testMode && styles.headerBtnActive]}
            onPress={toggleTestMode}
          >
            <Text style={[styles.headerBtnText, testMode && styles.headerBtnTextActive]}>
              TEST
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('LogStack')}
          >
            <Text style={styles.headerBtnText}>Logs</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, testMode, toggleTestMode]);

  useFocusEffect(
    useCallback(() => {
      const s = getSettings();
      homographyRef.current = loadHomography();
      setModelKey(s.detectorModel);
    }, []),
  );

  /**
   * Called from the worklet with the parsed detection results.
   * Runs on the JS thread — safe to call setState, refs, etc.
   */
  const onDetections = useRunOnJS(
    (
      detections: RawDetection[],
      fw: number,
      fh: number,
      fc: number,
      isTestMode: boolean,
    ) => {
      if (inferenceBusyRef.current) return;
      inferenceBusyRef.current = true;

      try {
        setFrameSize({ width: fw, height: fh });

        if (!isTestMode) {
          for (const det of detections) {
            const cls = getVehicleClass(det.classId);
            if (cls) autoCalibratorRef.current.addDetection(det.bbox, cls);
          }
        }

        const liveSettings = getSettings();
        let activeHomography = homographyRef.current;
        if (!activeHomography) {
          activeHomography = isTestMode
            ? buildTestHomography(fh, liveSettings.testSceneMetresPerPixel)
            : autoCalibratorRef.current.getHomography();
        }

        const calibSrc = homographyRef.current
          ? 'CAL'
          : activeHomography
            ? (isTestMode ? 'TEST-CAL' : `AUTO(${autoCalibratorRef.current.sampleCount()})`)
            : 'NO-CAL';

        setCalState(calibSrc as CalState);
        setDebugLine(`fc:${fc} det:${detections.length} ${isTestMode ? 'TEST' : 'ROAD'} ${calibSrc}`);

        // Test mode: floor at 0 so slow toy-car motion isn't masked. Production: keep 3 km/h floor.
        const minSpeedKmh = isTestMode ? 0 : undefined;
        const tracked = trackerRef.current.update(detections, activeHomography, fh, minSpeedKmh);

        // Detect vehicles that left the frame
        const currentIds = new Set(tracked.map((v) => v.trackId));
        const exited: DetectedVehicle[] = [];
        for (const id of prevTrackIdsRef.current) {
          if (!currentIds.has(id)) {
            const t = trackerRef.current.getTrack(id);
            if (t) exited.push(t.vehicle);
          }
        }
        prevTrackIdsRef.current = currentIds;
        setVehicles([...tracked]);

        if (!isTestMode) {
          const s = getSettings();
          for (const v of exited) {
            logVehicleExit(v, null, fw, fh, s).catch(() => {});
            if (v.speed !== null && v.speed > s.speedLimit) {
              setViolationCount((c) => c + 1);
            }
          }
        }
      } catch (e: unknown) {
        setDebugLine(`ERR: ${e instanceof Error ? e.message.slice(0, 60) : 'unknown'}`);
      } finally {
        inferenceBusyRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const dbg = useRunOnJS((msg: string) => {
    console.log('[DBG]', msg);
    setDebugLine(msg);
  }, []);

  const frameProcessor = useFrameProcessor(
    (frame: Frame) => {
      'worklet';

      frameCountRef.current += 1;
      const fc = frameCountRef.current;
      if (fc % INFERENCE_EVERY_N_FRAMES !== 0) return;

      if (!boxedModel) {
        if (fc % 30 === 0) dbg(`fc:${fc} boxedModel=null`);
        return;
      }

      // Unbox the model inside the worklet to get the native TFLite handle.
      const tflite = boxedModel.unbox();

      const isTestMode = testModeShared.value;
      const threshold  = isTestMode ? 0.10 : CONFIDENCE_THRESHOLD;

      // Resize frame to model input size (640×640), normalized float32 RGB.
      // Passing the typed array directly (not .buffer) avoids byteOffset issues.
      // Model is 320×320 (outLen 176400 / 84 = 2100 anchors)
      const resized = resize(frame, {
        scale:       { width: 320, height: 320 },
        pixelFormat: 'rgb',
        dataType:    'float32',
        rotation:    '0deg',
      });

      // Slice to get only the typed array's own bytes (avoids byteOffset issues).
      const inputBuffer = resized.buffer.slice(
        resized.byteOffset,
        resized.byteOffset + resized.byteLength,
      ) as ArrayBuffer;
      const outputs = tflite.runSync([inputBuffer]);
      const output  = new Float32Array(outputs[0]);

      // Debug on first inference only
      if (fc === 5) {
        const v = (idx: number) => output[idx].toFixed(3);
        // Print first 6 values and values at key offsets to identify layout
        dbg(`[0-5]: ${v(0)} ${v(1)} ${v(2)} ${v(3)} ${v(4)} ${v(5)}`);
        dbg(`[8400-8402]: ${v(8400)} ${v(8401)} ${v(8402)}`);
        dbg(`[2100-2102]: ${v(2100)} ${v(2101)} ${v(2102)}`);
        dbg(`outLen:${output.length} numAnchors:${output.length / 84}`);
      }

      // --- Inline YOLOv8 output parsing ---
      // Layout: transposed [84 × numAnchors] — confirmed by debug:
      //   output[0]    = cx[anchor_0] ≈ 7     (coordinate, row 0)
      //   output[2100] = cy[anchor_0] ≈ 10    (coordinate, row 1)
      //   output[8400] = class0[anchor_0] = 0 (class score 0-1, row 4)
      // Access: output[row * numAnchors + i], coords in absolute pixels (0-320)
      const numAnchors = output.length / 84;
      const fw = frame.width;
      const fh = frame.height;
      const raw: RawDetection[] = [];
      const coordScale = coordScaleShared.value;

      for (let i = 0; i < numAnchors; i++) {
        let maxConf = 0;
        let maxClassId = -1;
        for (let c = 0; c < 80; c++) {
          const conf = output[(4 + c) * numAnchors + i];
          if (conf > maxConf) { maxConf = conf; maxClassId = c; }
        }
        if (maxConf < threshold) continue;
        if (!isTestMode && maxClassId !== 2 && maxClassId !== 3 && maxClassId !== 5 && maxClassId !== 7) continue;

        const cx = output[0 * numAnchors + i] / coordScale;
        const cy = output[1 * numAnchors + i] / coordScale;
        const w  = output[2 * numAnchors + i] / coordScale;
        const h  = output[3 * numAnchors + i] / coordScale;

        // Filter out boxes that are too small, too large, or have extreme aspect ratios
        if (w < MIN_BOX_FRAC || h < MIN_BOX_FRAC) continue;
        if (w > MAX_BOX_W_FRAC || h > MAX_BOX_H_FRAC) continue;
        const aspect = w > h ? w / h : h / w;
        if (aspect > MAX_ASPECT_RATIO) continue;

        raw.push({
          bbox: {
            x: (cx - w / 2) * fw,
            y: (cy - h / 2) * fh,
            width:  w * fw,
            height: h * fh,
          },
          classId: maxClassId,
          confidence: maxConf,
        });
      }

      // ROI filter — only keep detections whose center falls inside the zone.
      // roiShared values are normalized 0-1 fractions of the frame.
      const zone = roiShared.value;
      const roiFiltered: RawDetection[] = [];
      for (let i = 0; i < raw.length; i++) {
        const b = raw[i].bbox;
        const cx2 = (b.x + b.width  / 2) / fw;
        const cy2 = (b.y + b.height / 2) / fh;
        if (cx2 >= zone.x && cx2 <= zone.x + zone.w &&
            cy2 >= zone.y && cy2 <= zone.y + zone.h) {
          roiFiltered.push(raw[i]);
        }
      }

      // NMS
      roiFiltered.sort((a, b) => b.confidence - a.confidence);
      const kept: RawDetection[] = [];
      const suppressed = new Uint8Array(roiFiltered.length);
      for (let i = 0; i < roiFiltered.length; i++) {
        if (suppressed[i]) continue;
        kept.push(roiFiltered[i]);
        const ai = roiFiltered[i].bbox;
        for (let j = i + 1; j < roiFiltered.length; j++) {
          if (suppressed[j]) continue;
          const aj = roiFiltered[j].bbox;
          const ix = Math.max(0, Math.min(ai.x + ai.width, aj.x + aj.width) - Math.max(ai.x, aj.x));
          const iy = Math.max(0, Math.min(ai.y + ai.height, aj.y + aj.height) - Math.max(ai.y, aj.y));
          const inter = ix * iy;
          if (inter > 0) {
            const iouVal = inter / (ai.width * ai.height + aj.width * aj.height - inter);
            if (iouVal > 0.45) suppressed[j] = 1;
          }
        }
      }

      onDetections(kept, frame.width, frame.height, fc, isTestMode);
    },
    [boxedModel, resize, onDetections, testModeShared, roiShared, coordScaleShared, dbg],
  );

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setOverlaySize({ width, height });
  }

  // Drag the ROI box by its center area.
  const roiDragStart = useRef({ x: 0, y: 0 });
  const roiPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      roiDragStart.current = { x: roi.x, y: roi.y };
    },
    onPanResponderMove: (_, gs) => {
      if (overlaySize.width === 0) return;
      const dx = gs.dx / overlaySize.width;
      const dy = gs.dy / overlaySize.height;
      const nx = Math.max(0, Math.min(1 - roi.w, roiDragStart.current.x + dx));
      const ny = Math.max(0, Math.min(1 - roi.h, roiDragStart.current.y + dy));
      const next = { ...roi, x: nx, y: ny };
      setRoi(next);
      roiShared.value = next;
    },
  }), [roi, overlaySize, roiShared]);

  if (!hasPermission) {
    return <NoCameraView reason="no-permission" onRequestPermission={requestPermission} />;
  }
  if (!device) {
    return <NoCameraView reason="no-device" />;
  }

  const topSpeed = vehicles.reduce<number | null>((max, v) => {
    if (v.speed === null) return max;
    return max === null || v.speed > max ? v.speed : max;
  }, null);
  const violatingVehicle = vehicles.find(
    (v) => v.speed !== null && v.speed > settings.speedLimit,
  );
  const topPlate = (violatingVehicle ?? vehicles.find((v) => v.plate))?.plate ?? null;

  return (
    <View style={styles.container} onLayout={onLayout}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        frameProcessor={frameProcessor}
      />

      {testMode && (
        <View style={styles.testModeBanner}>
          <Text style={styles.testModeBannerText}>TEST MODE — All Objects</Text>
        </View>
      )}

      <View style={styles.debugBadge}>
        <Text style={styles.debugText}>{debugLine}</Text>
      </View>

      {/* Calibration-state chip — tap to calibrate when missing. */}
      <TouchableOpacity
        style={[
          styles.calChip,
          calState === 'CAL' && styles.calChipOk,
          calState === 'NO-CAL' && styles.calChipMissing,
          calState.startsWith('AUTO') && styles.calChipPending,
          calState === 'TEST-CAL' && styles.calChipTest,
        ]}
        onPress={() => {
          if (calState === 'NO-CAL' || calState.startsWith('AUTO')) {
            // Tab → nested stack navigation. Cast through unknown to bypass
            // strict tab navigator typings.
            (navigation.navigate as unknown as (name: string, params: unknown) => void)(
              'SettingsStack',
              { screen: 'Calibration' },
            );
          }
        }}
      >
        <Text style={styles.calChipText}>{calState}</Text>
      </TouchableOpacity>

      {/* Detection zone — drag to reposition, only objects inside are detected */}
      {overlaySize.width > 0 && (
        <View
          {...roiPan.panHandlers}
          style={[
            styles.roiBox,
            {
              left:   roi.x * overlaySize.width,
              top:    roi.y * overlaySize.height,
              width:  roi.w * overlaySize.width,
              height: roi.h * overlaySize.height,
            },
          ]}
        >
          <Text style={styles.roiLabel}>Detection Zone — drag to move</Text>
        </View>
      )}

      <BBoxOverlay
        vehicles={vehicles}
        overlayWidth={overlaySize.width}
        overlayHeight={overlaySize.height}
        frameWidth={frameSize.width}
        frameHeight={frameSize.height}
      />

      <SpeedHUD
        speed={topSpeed}
        speedLimit={settings.speedLimit}
        plate={topPlate}
        vehicleCount={vehicles.length}
        violationCount={violationCount}
        cameraId={settings.cameraId}
        isRecording={model.state === 'loaded'}
        needsCalibration={calState === 'NO-CAL'}
      />

      {/* Model load overlay — covers the screen while a new model is loading
          or if it errored. Triggered by user swapping detector model in Settings. */}
      {model.state !== 'loaded' && (
        <View style={styles.modelOverlay} pointerEvents="auto">
          {model.state === 'loading' ? (
            <>
              <ActivityIndicator size="large" color="#3498db" />
              <Text style={styles.modelOverlayTitle}>
                Loading {modelLabelFor(modelKey)}…
              </Text>
              <Text style={styles.modelOverlaySub}>
                Detection paused while the model loads.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.modelOverlayError}>⚠</Text>
              <Text style={styles.modelOverlayTitle}>
                Couldn't load {modelLabelFor(modelKey)}
              </Text>
              <Text style={styles.modelOverlaySub}>
                Drop a real .tflite at assets/models/{modelKey}.tflite, or pick
                a different model in Settings.
              </Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function modelLabelFor(key: DetectorModel): string {
  switch (key) {
    case 'yolov8n': return 'YOLOv8n';
    case 'yolov8s': return 'YOLOv8s';
    case 'yolov8m': return 'YOLOv8m';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  headerButtons: { flexDirection: 'row', gap: 8, marginRight: 8 },
  headerBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 6, borderWidth: 1, borderColor: '#444',
  },
  headerBtnActive:     { backgroundColor: '#ffb300', borderColor: '#ffb300' },
  headerBtnText:       { color: '#ccc', fontSize: 12, fontWeight: '600' },
  headerBtnTextActive: { color: '#000' },
  testModeBanner: {
    position: 'absolute', top: 8, alignSelf: 'center',
    backgroundColor: 'rgba(255,179,0,0.85)', borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  testModeBannerText: { color: '#000', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  debugBadge: {
    position: 'absolute', top: 110, left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 4,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  debugText: { color: '#0f0', fontSize: 10, fontFamily: 'monospace' },
  calChip: {
    position: 'absolute', top: 110, right: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.6)', borderColor: '#444',
  },
  calChipOk:      { borderColor: '#27ae60', backgroundColor: 'rgba(39,174,96,0.25)' },
  calChipMissing: { borderColor: '#e67e22', backgroundColor: 'rgba(230,126,34,0.30)' },
  calChipPending: { borderColor: '#f1c40f', backgroundColor: 'rgba(241,196,15,0.20)' },
  calChipTest:    { borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.25)' },
  calChipText:    { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  modelOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modelOverlayTitle: {
    color: '#fff', fontSize: 18, fontWeight: '700',
    marginTop: 16, textAlign: 'center',
  },
  modelOverlaySub: {
    color: '#bbb', fontSize: 13, marginTop: 8,
    textAlign: 'center', lineHeight: 18,
  },
  modelOverlayError: { color: '#e67e22', fontSize: 56 },
  roiBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#ffb300',
    borderStyle: 'dashed',
    borderRadius: 4,
  },
  roiLabel: {
    position: 'absolute',
    bottom: 4,
    alignSelf: 'center',
    color: '#ffb300',
    fontSize: 10,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
