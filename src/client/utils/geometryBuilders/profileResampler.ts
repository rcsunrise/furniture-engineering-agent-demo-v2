import * as THREE from "three";

/**
 * Resamples a 2D closed polygon profile into exactly targetCount points (default 64)
 * evenly spaced by arc-length, maintaining consistent vertex ordering & winding.
 */
export function resampleClosedProfile(
  points: THREE.Vector2[],
  targetCount = 64
): THREE.Vector2[] {
  if (!points || points.length === 0) {
    // Generate default ellipse profile if empty
    const defaultPts: THREE.Vector2[] = [];
    for (let i = 0; i < targetCount; i++) {
      const angle = (i / targetCount) * Math.PI * 2;
      defaultPts.push(new THREE.Vector2(0.5 + 0.5 * Math.cos(angle), 0.5 + 0.5 * Math.sin(angle)));
    }
    return defaultPts;
  }

  const n = points.length;
  const closedPts = [...points];

  // Ensure closure
  if (points[0].distanceToSquared(points[n - 1]) > 1e-6) {
    closedPts.push(points[0].clone());
  }

  // Calculate cumulative arc lengths
  const cumLengths: number[] = [0];
  let totalLength = 0;

  for (let i = 0; i < closedPts.length - 1; i++) {
    const dist = closedPts[i].distanceTo(closedPts[i + 1]);
    totalLength += dist;
    cumLengths.push(totalLength);
  }

  if (totalLength === 0) {
    return Array.from({ length: targetCount }, () => new THREE.Vector2(0.5, 0.5));
  }

  const resampled: THREE.Vector2[] = [];
  const step = totalLength / targetCount;

  let currentSegment = 0;
  for (let i = 0; i < targetCount; i++) {
    const targetDist = i * step;

    while (
      currentSegment < cumLengths.length - 2 &&
      cumLengths[currentSegment + 1] < targetDist
    ) {
      currentSegment++;
    }

    const segStartDist = cumLengths[currentSegment];
    const segEndDist = cumLengths[currentSegment + 1];
    const segLength = segEndDist - segStartDist;

    const t = segLength > 1e-6 ? (targetDist - segStartDist) / segLength : 0;
    const p1 = closedPts[currentSegment];
    const p2 = closedPts[currentSegment + 1];

    resampled.push(new THREE.Vector2().lerpVectors(p1, p2, t));
  }

  return resampled;
}
