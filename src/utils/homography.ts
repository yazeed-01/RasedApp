/**
 * Computes a 3×3 homography matrix (row-major, 9 elements) that maps
 * screen pixel coordinates to ground-plane metric coordinates (metres).
 *
 * The user taps two points on the road surface and enters the known real-world
 * distance between them. We produce a simplified 1-D scale + translation
 * homography along the vertical axis (sufficient for a fixed overhead/angled
 * camera where lateral displacement is approximately constant).
 *
 * For a full perspective transform you'd need four point correspondences;
 * for a roadside speed camera with known mounting angle, two points on a
 * lane marking (e.g. start and end of a 9 m stripe) is enough to get a
 * reliable per-pixel metre scale along the vehicle travel axis.
 */

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Returns a scale factor: metres per pixel along the image Y axis.
 * We also return the reference Y coordinates so we can interpolate
 * the scale at any vehicle position (perspective correction).
 */
export interface HomographyResult {
  metresPerPixelAtRef: number; // m/px at the reference distance (midpoint of the two taps)
  refY: number;                // Y pixel of the midpoint
  p1: ScreenPoint;
  p2: ScreenPoint;
  realWorldDistance: number;
}

export function computeHomography(
  p1: ScreenPoint,
  p2: ScreenPoint,
  realWorldDistance: number,
): HomographyResult {
  const dy = Math.abs(p2.y - p1.y);
  const dx = Math.abs(p2.x - p1.x);
  const pixelDist = Math.sqrt(dx * dx + dy * dy);

  if (pixelDist < 1) {
    throw new Error('Points are too close together');
  }

  const metresPerPixelAtRef = realWorldDistance / pixelDist;
  const refY = (p1.y + p2.y) / 2;

  return { metresPerPixelAtRef, refY, p1, p2, realWorldDistance };
}

/**
 * Convert a pixel displacement (dx, dy) into real-world metres.
 * Applies a simple perspective correction: objects higher in frame (smaller Y)
 * are farther away and therefore each pixel represents more metres.
 *
 * scaleFactor grows linearly from the reference point toward the top of frame.
 * This is a coarse model — adequate for 5-15 km/h accuracy after calibration.
 */
export function pixelDisplacementToMetres(
  dx: number,
  dy: number,
  atY: number,
  h: HomographyResult,
  frameHeight: number,
): number {
  // Perspective scale: farther (higher in frame = smaller Y) → more m/px
  const vanishingFraction = atY / frameHeight; // 1 = bottom (close), 0 = top (far)
  const perspectiveScale = vanishingFraction > 0.01
    ? h.metresPerPixelAtRef * (h.refY / frameHeight) / vanishingFraction
    : h.metresPerPixelAtRef;

  return Math.sqrt(dx * dx + dy * dy) * perspectiveScale;
}
