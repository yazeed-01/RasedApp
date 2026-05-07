import type { BoundingBox } from '../types';
import type { HomographyResult } from './homography';
import { pixelDisplacementToMetres } from './homography';

const SMOOTHING_WINDOW = 5; // frames to average over
export const DEFAULT_MIN_SPEED_KMH = 3; // production: filter parked cars

export interface PositionSample {
  x: number; // bottom-centre pixel X
  y: number; // bottom-centre pixel Y
  ts: number; // timestamp ms
}

export class SpeedEstimator {
  private history: PositionSample[] = [];
  private smoothed: number[] = [];

  addSample(bbox: BoundingBox, ts: number) {
    const x = bbox.x + bbox.width / 2;
    const y = bbox.y + bbox.height;      // bottom-centre — closest to ground plane
    this.history.push({ x, y, ts });
    if (this.history.length > SMOOTHING_WINDOW + 1) {
      this.history.shift();
    }
  }

  /**
   * Returns speed in km/h, or null if not enough samples yet.
   * `minSpeedKmh` floors small motion to 0 (parked-car filter); pass 0 in test
   * mode so slow toy-car motion isn't masked.
   */
  getSpeed(
    homography: HomographyResult,
    frameHeight: number,
    minSpeedKmh: number = DEFAULT_MIN_SPEED_KMH,
  ): number | null {
    if (this.history.length < 2) return null;

    const old = this.history[0];
    const now = this.history[this.history.length - 1];
    const dtSeconds = (now.ts - old.ts) / 1000;
    if (dtSeconds < 0.05) return null; // too little time

    const metres = pixelDisplacementToMetres(
      now.x - old.x,
      now.y - old.y,
      (old.y + now.y) / 2,
      homography,
      frameHeight,
    );

    const mps = metres / dtSeconds;
    const kmh = mps * 3.6;

    // Smooth with moving average
    this.smoothed.push(kmh);
    if (this.smoothed.length > SMOOTHING_WINDOW) this.smoothed.shift();
    const avg = this.smoothed.reduce((s, v) => s + v, 0) / this.smoothed.length;

    return avg < minSpeedKmh ? 0 : avg;
  }

  reset() {
    this.history = [];
    this.smoothed = [];
  }
}
