import type { BoundingBox, VehicleClass } from '../types';
import type { HomographyResult } from './homography';

// Average real-world vertical extent of each vehicle class, in metres.
// Used to derive metres-per-pixel from the bbox height of a detection.
const REAL_HEIGHTS_M: Record<VehicleClass, number> = {
  car: 1.5,
  motorcycle: 1.2,
  bus: 3.0,
  truck: 2.8,
};

const MAX_SAMPLES = 30;
const MIN_SAMPLES = 3;
const MIN_BBOX_HEIGHT_PX = 20;

interface Sample {
  mPerPx: number;
  y: number;
}

export class AutoCalibrator {
  private samples: Sample[] = [];

  addDetection(bbox: BoundingBox, vehicleClass: VehicleClass) {
    const realH = REAL_HEIGHTS_M[vehicleClass];
    if (!realH || bbox.height < MIN_BBOX_HEIGHT_PX) return;
    this.samples.push({
      mPerPx: realH / bbox.height,
      y: bbox.y + bbox.height,
    });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  getHomography(): HomographyResult | null {
    if (this.samples.length < MIN_SAMPLES) return null;
    const sorted = [...this.samples].sort((a, b) => a.mPerPx - b.mPerPx);
    const med = sorted[Math.floor(sorted.length / 2)];
    return {
      metresPerPixelAtRef: med.mPerPx,
      refY: med.y,
      p1: { x: 0, y: med.y - 50 },
      p2: { x: 0, y: med.y + 50 },
      realWorldDistance: 100 * med.mPerPx,
    };
  }

  sampleCount(): number {
    return this.samples.length;
  }

  reset() {
    this.samples = [];
  }
}

// Synthetic homography for TEST mode so the speed pipeline runs even without
// a real calibration. Driven by the user's "test scene scale" setting so the
// same app works for a toy car on a desk (~0.0005 m/px) and a roadside test
// (~0.05 m/px). Was a hard-coded 0.01 before — wrong for desk scenes, which is
// why the toy car always read 0 km/h.
export function buildTestHomography(
  frameHeight: number,
  metresPerPixel: number,
): HomographyResult {
  const refY = frameHeight / 2;
  return {
    metresPerPixelAtRef: metresPerPixel,
    refY,
    p1: { x: 0, y: refY - 50 },
    p2: { x: 0, y: refY + 50 },
    realWorldDistance: 100 * metresPerPixel,
  };
}
