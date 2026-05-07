# Rased — On-device Speed Camera

React Native app that detects vehicles via on-device YOLOv8 inference, estimates their speed in km/h, reads license plates, and logs violations. Targets Android + iOS via Expo prebuild.

## What it does

- **Live detection** — YOLOv8 (n / s / m) runs on every Nth camera frame via `react-native-fast-tflite`, on the worklet thread so the JS bridge isn't blocked.
- **Tracking** — IoU-based tracker assigns a stable ID to each vehicle while it stays in frame.
- **Speed estimation** — pixel displacement between frames is converted to metres via a per-pixel-scale homography (manual two-point calibration, vehicle-height auto-calibration, or a test-mode synthetic scale), then to km/h. Smoothed over 5 frames.
- **License plates** — ML Kit text recognition runs on the cropped vehicle on exit, with multi-frame voting for the final reading.
- **Violations** — over-limit exits write a row to SQLite with a snapshot of the frame, plate, and GPS.
- **Multi-camera** — section-style "average speed" enforcement across two cameras using a shared sync backend.

## Quick start

```bash
npm install
npx expo prebuild        # generates native projects
npm run android          # or: npm run ios
```

The app needs camera + storage permissions, which are requested on first launch.

If you swap or re-export model files, reset Metro's cache:

```bash
npx react-native start --reset-cache
```

## Project layout

```
src/
├── components/
│   ├── BBoxOverlay.tsx       Skia overlay drawing detection boxes + labels
│   ├── NoCameraView.tsx      Fallback UI when camera is unavailable
│   └── SpeedHUD.tsx          Centre speed readout, plate row, counters
├── db/                       SQLite init + schema for violations
├── hooks/                    useCameraPermission
├── navigation/               Tab + stack nav (Camera / Log / Avg Speed / Settings)
├── screens/
│   ├── CameraScreen.tsx      Frame processor + detection pipeline
│   ├── CalibrationScreen.tsx Two-point calibration wizard
│   ├── SettingsScreen.tsx    Model picker, test-scene scale, calibration entry
│   ├── LogScreen.tsx         Violation history
│   ├── AvgSpeedScreen.tsx    Section-violation across two cameras
│   └── ViolationDetailScreen.tsx
├── store/settings.ts         MMKV-backed settings
├── types/                    Shared TS types
└── utils/
    ├── yoloDetector.ts       YOLOv8 output decoding + class filtering
    ├── tracker.ts            IoU tracker, owns SpeedEstimator per track
    ├── speedCalculator.ts    Position samples → km/h with smoothing
    ├── homography.ts         Pixel ↔ ground-plane metric conversion
    ├── autoCalibrate.ts      Auto-cal from vehicle heights + test scale
    ├── plateOcr.ts           ML Kit OCR + Jordan plate validation
    ├── plateVoter.ts         Multi-frame plate consensus
    ├── violationLogger.ts    Persist a violation + snapshot
    ├── frameSnapshot.ts      Crop + save a frame
    └── csvExport.ts          CSV export of the violations log
```

## Detection pipeline

`CameraScreen.tsx` is the core. On every Nth frame (`INFERENCE_EVERY_N_FRAMES = 5`):

1. Resize the frame to **320×320 float32 RGB** via `vision-camera-resize-plugin`.
2. Run TFLite inference with the user-selected model (8n / 8s / 8m).
3. Decode the YOLOv8 output (`[1, 84, 2100]` — rows 0–3 are bbox `cx,cy,w,h`, rows 4–83 are per-class scores). Coords are normalized to 0–1 via a per-model `coordScale` (320 for the legacy `yolov8n` export, 1 for onnx2tf-exported `yolov8s` / `yolov8m`).
4. Filter to vehicle classes only (car / motorcycle / bus / truck) outside test mode, drop tiny / oversized / extreme-aspect boxes.
5. Apply ROI filter (only keep detections whose centre falls inside the draggable yellow detection zone).
6. Non-max suppression at IoU 0.45.
7. Hand the kept detections back to the JS thread for tracking + speed.

The whole pipeline up to step 6 runs in a worklet (no JS bridge crossings). Only step 7 onward is on the JS thread.

## Speed estimation

`speedCalculator.ts` keeps the last 6 bottom-centre positions of each tracked bbox. Per frame it:

1. Computes pixel displacement between the oldest and newest sample.
2. Converts to metres via `pixelDisplacementToMetres()` in `homography.ts`, which applies a perspective scale that grows linearly with frame Y (objects higher in the frame are farther → each pixel is more metres).
3. Divides by `dt` and converts to km/h.
4. Smooths with a 5-frame moving average.
5. Floors values below `minSpeedKmh` (default 3 km/h, 0 in test mode) to 0 to filter parked cars.

**Calibration** is required for any of this to produce a number. The HUD shows a colour-coded chip in the top-right:

- `CAL` (green) — manual two-point calibration loaded.
- `AUTO(n)` (yellow) — auto-cal collected `n / 3` vehicle samples.
- `TEST-CAL` (blue) — test-mode synthetic scale active.
- `NO-CAL` (orange) — speed cannot be measured. **Tap the chip to jump to the calibration wizard.**

The speed readout shows `—` when speed isn't measurable (no calibration / not enough samples) and a de-emphasised `0` when the vehicle was measured but is below the floor — these are visually distinct so the failure mode is observable.

## Detection model picker

Three models can be selected in **Settings → Detection model**:

| Model | Size | Use when |
|---|---|---|
| YOLOv8n | 13 MB | Default. Fastest. Low-end devices. |
| YOLOv8s | 43 MB | Balanced. Better small-object recall. |
| YOLOv8m | 99 MB | Most accurate. Heavy — only if your phone keeps up. |

All three live in `assets/models/` and use the same input layout (`[1,320,320,3]` float32) and output layout (`[1,84,2100]` float32), so the parser works for all of them. **Important:** the `yolov8n.tflite` shipped with the repo emits bbox coords in pixel space (0–320), while the `yolov8s` / `yolov8m` exports from `onnx2tf` emit normalized 0–1 coords. The pipeline handles this with a per-model `coordScale` value. If you replace `yolov8n.tflite` with a re-export, expect to flip the scale (or just remove the legacy mapping in `CameraScreen.tsx`).

The model swap is automatic: change the setting → return to the Camera tab → a full-screen "Loading YOLOv8s…" overlay appears while the new model loads → detection resumes when ready. No app restart.

### Re-exporting models

The repo includes `yolov8n.pt` at the project root. You can rebuild any TFLite model with:

```bash
yolo export model=yolov8s.pt format=tflite imgsz=320 simplify=True
cp yolov8s_saved_model/yolov8s_float32.tflite assets/models/yolov8s.tflite
rm -rf yolov8s_saved_model yolov8s.onnx calibration_image_sample_data_*.npy*
```

Use **`_float32.tflite`**, not `_float16.tflite` — TFLite's CPU Conv2D op only accepts `float32` / `uint8` / `int8` at the I/O boundary, so float16 builds fail to allocate at load time.

The export needs `onnx`, `onnxslim`, `onnxruntime`, `onnx2tf`, `tensorflow`, `tf-keras`, `tflite_support`. On Debian / Ubuntu Python 3.12 you may need `pip install --user --break-system-packages …` due to PEP 668.

## Test mode

Toggle the **TEST** button in the camera header to:

- Detect *all* COCO classes (not just vehicles) so you can point the camera at random objects.
- Lower the detection confidence threshold from 0.30 to 0.10.
- Use the synthetic homography from **Settings → Test-mode scene scale** (Desk / Tabletop / Roadside presets, or a custom m/px value) so speed works even without manual calibration.
- Drop the speed floor from 3 km/h → 0 km/h so slow toy-car motion isn't masked.

For the toy-car-on-desk scenario in development, pick the **Desk** preset (0.0005 m/px). For a roadside test without doing the calibration wizard, pick **Roadside**.

## Settings persistence

All settings live in MMKV under the `rased-settings` storage ID. Schema:

```ts
interface CameraSettings {
  cameraId: string;
  speedLimit: number;
  gpsLat: number;
  gpsLng: number;
  calibrationData: CalibrationData | null;   // manual two-point cal
  detectorModel: 'yolov8n' | 'yolov8s' | 'yolov8m';
  testSceneMetresPerPixel: number;            // test-mode synthetic scale
}
```

Adding new keys: extend `types/index.ts`, then bump `DEFAULTS` in `store/settings.ts`. Existing storage merges with defaults on read so old installs don't lose data.

## Known limitations / planned improvements

These are documented in `speed_camera_build_plan.md` and the planning doc, and are deferred:

- **Tracker** is plain IoU (single-pass). ByteTrack-style second-pass association on low-confidence detections (0.10–0.30) would materially improve track continuity through brief occlusions.
- **Calibration** is a coarse 1-D scale model. A proper vanishing-point + 4-point homography (per the literature: Revaud et al. ICCV 2021, Sci. Reports 2025) would be much more accurate for real-road use.
- **Smoothing** is a moving average. A 1D Kalman filter on position would handle missed inference frames more gracefully and remove the "needs ≥ 2 samples before any output" cliff.
- **Inference rate** is fixed (every 5th frame, ~6 inference FPS at 30 FPS camera). Could adapt to device capability and bump input size to 416² or 640² on capable phones.
- **GPS validation** — pairing predicted km/h with on-device GPS speed would let the app score its own accuracy.

## Troubleshooting

**"Failed to allocate memory for input/output tensors" on model load**
The model is using float16 I/O tensors, which TFLite's CPU Conv2D op rejects. Re-export with `_float32.tflite` (see *Re-exporting models* above).

**Boxes appear in the right place but speed always reads `0` or `—`**
Check the calibration chip. `NO-CAL` orange chip means tap it to run the wizard. `AUTO(0)` / `AUTO(1)` means the auto-calibrator hasn't collected its 3-sample minimum yet — drive a few vehicles past, or do a manual cal.

**Toy car detected but speed is `0`**
You're probably not in test mode, or the scene scale is wrong. Toggle TEST in the header, and pick the **Desk** preset under Settings → Test-mode scene scale.

**Boxes drawn at the wrong size or wrong place after swapping models**
The new model probably emits a different coord space. Check `coordScaleShared` in `CameraScreen.tsx` — flip between `320` and `1` to find what produces sensible boxes.

**Model swap stuck on "Loading…" overlay**
The model file is missing or invalid. Empty `.tflite` placeholders fail to load with the `⚠` error message. Drop a real export at `assets/models/<modelKey>.tflite`.

## License

TBD.
