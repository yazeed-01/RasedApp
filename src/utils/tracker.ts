import type { BoundingBox, DetectedVehicle } from '../types';
import type { RawDetection } from './yoloDetector';
import { toDetectedVehicle } from './yoloDetector';
import { SpeedEstimator } from './speedCalculator';
import type { HomographyResult } from './homography';

const IOU_MATCH_THRESHOLD = 0.3;
const MAX_MISSED_FRAMES = 10;

let nextId = 1;

export interface Track {
  vehicle: DetectedVehicle;
  missedFrames: number;
  speedEstimator: SpeedEstimator;
}

export class IoUTracker {
  private tracks: Map<string, Track> = new Map();

  /**
   * @param detections    Current-frame detections
   * @param homography    Calibration result (null = skip speed calc)
   * @param frameHeight   Pixel height of the camera frame
   * @param minSpeedKmh   Speed floor (below → reported as 0). Pass 0 in test mode.
   */
  update(
    detections: RawDetection[],
    homography: HomographyResult | null,
    frameHeight: number,
    minSpeedKmh?: number,
  ): DetectedVehicle[] {
    const now = Date.now();
    const unmatched = new Set(this.tracks.keys());
    const matchedDets = new Set<number>();

    for (const [id, track] of this.tracks) {
      let bestIou = IOU_MATCH_THRESHOLD;
      let bestDetIdx = -1;

      detections.forEach((det, idx) => {
        if (matchedDets.has(idx)) return;
        const score = iou(track.vehicle.bbox, det.bbox);
        if (score > bestIou) {
          bestIou = score;
          bestDetIdx = idx;
        }
      });

      if (bestDetIdx >= 0) {
        matchedDets.add(bestDetIdx);
        unmatched.delete(id);
        const det = detections[bestDetIdx];

        // Feed position sample for speed
        track.speedEstimator.addSample(det.bbox, now);
        const speed = homography
          ? track.speedEstimator.getSpeed(homography, frameHeight, minSpeedKmh)
          : null;

        track.vehicle = {
          ...track.vehicle,
          bbox: det.bbox,
          speed,
          confidence: det.confidence,
          lastSeen: now,
        };
        track.missedFrames = 0;
      } else {
        track.missedFrames++;
      }
    }

    // Drop stale tracks
    for (const id of unmatched) {
      if (this.tracks.get(id)!.missedFrames >= MAX_MISSED_FRAMES) {
        this.tracks.delete(id);
      }
    }

    // Spawn new tracks for unmatched detections
    detections.forEach((det, idx) => {
      if (matchedDets.has(idx)) return;
      const id = String(nextId++);
      const estimator = new SpeedEstimator();
      estimator.addSample(det.bbox, now);
      this.tracks.set(id, {
        vehicle: toDetectedVehicle(det, id),
        missedFrames: 0,
        speedEstimator: estimator,
      });
    });

    return Array.from(this.tracks.values()).map((t) => t.vehicle);
  }

  getTrack(id: string): Track | undefined {
    return this.tracks.get(id);
  }

  clear() {
    this.tracks.clear();
  }
}

function iou(a: BoundingBox, b: BoundingBox): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = ix * iy;
  if (inter === 0) return 0;

  return inter / (a.width * a.height + b.width * b.height - inter);
}
