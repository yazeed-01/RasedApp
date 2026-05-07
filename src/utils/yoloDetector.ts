import type { BoundingBox, DetectedVehicle, VehicleClass } from '../types';

export const MODEL_INPUT_SIZE = 640;
export const CONFIDENCE_THRESHOLD = 0.30;
export const NMS_IOU_THRESHOLD = 0.45;
export const NUM_CLASSES = 80;

export const VEHICLE_CLASS_IDS: Record<number, VehicleClass> = {
  2: 'car',
  3: 'motorcycle',
  5: 'bus',
  7: 'truck',
};

export interface RawDetection {
  bbox: BoundingBox;
  classId: number;
  confidence: number;
}

export function getVehicleClass(classId: number): VehicleClass | null {
  return VEHICLE_CLASS_IDS[classId] ?? null;
}

export function toDetectedVehicle(det: RawDetection, trackId: string): DetectedVehicle {
  return {
    trackId,
    bbox: det.bbox,
    speed: null,
    plate: null,
    plateConfidence: 0,
    class: VEHICLE_CLASS_IDS[det.classId] ?? 'car',
    confidence: det.confidence,
    lastSeen: Date.now(),
  };
}

/**
 * Parse raw YOLOv8 output tensor into detections.
 * output layout: [cx, cy, w, h, class0..class79] × NUM_ANCHORS (column-major / transposed)
 * cx/cy/w/h are in absolute pixels relative to MODEL_INPUT_SIZE.
 * Returns bboxes scaled to (frameWidth × frameHeight).
 */
export function parseYoloOutput(
  output: Float32Array,
  frameWidth: number,
  frameHeight: number,
  confidenceThreshold: number,
  testMode: boolean,
): RawDetection[] {
  'worklet';
  const numAnchors = output.length / (4 + NUM_CLASSES);
  const raw: RawDetection[] = [];

  for (let i = 0; i < numAnchors; i++) {
    let maxConf = 0;
    let maxClassId = -1;
    for (let c = 0; c < NUM_CLASSES; c++) {
      const conf = output[(4 + c) * numAnchors + i];
      if (conf > maxConf) { maxConf = conf; maxClassId = c; }
    }
    if (maxConf < confidenceThreshold) continue;
    if (!testMode && !(maxClassId in VEHICLE_CLASS_IDS)) continue;

    const cx = output[0 * numAnchors + i] / MODEL_INPUT_SIZE;
    const cy = output[1 * numAnchors + i] / MODEL_INPUT_SIZE;
    const w  = output[2 * numAnchors + i] / MODEL_INPUT_SIZE;
    const h  = output[3 * numAnchors + i] / MODEL_INPUT_SIZE;

    raw.push({
      bbox: {
        x: (cx - w / 2) * frameWidth,
        y: (cy - h / 2) * frameHeight,
        width:  w * frameWidth,
        height: h * frameHeight,
      },
      classId: maxClassId,
      confidence: maxConf,
    });
  }

  // iou and nms are nested so the worklet Babel plugin captures them in the same closure.
  function iouFn(a: BoundingBox, b: BoundingBox): number {
    'worklet';
    const ix = Math.max(0, Math.min(a.x + a.width,  b.x + b.width)  - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const inter = ix * iy;
    if (inter === 0) return 0;
    return inter / (a.width * a.height + b.width * b.height - inter);
  }

  raw.sort((a, b) => b.confidence - a.confidence);
  const kept: RawDetection[] = [];
  const suppressed = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    if (suppressed[i]) continue;
    kept.push(raw[i]);
    for (let j = i + 1; j < raw.length; j++) {
      if (!suppressed[j] && iouFn(raw[i].bbox, raw[j].bbox) > NMS_IOU_THRESHOLD) {
        suppressed[j] = 1;
      }
    }
  }
  return kept;
}
