import { Point2D } from "./engineeringProfileProvider.js";

export interface ContourDistanceMetrics {
  meanContourDistanceMm: number;
  meanSymmetricContourDistanceMm: number;
  p95ContourDistanceMm: number;
  maxContourDistanceMm: number;
  sampledDistancesMm: number[];
}

/**
 * Resamples a 2D closed polygon contour into N equidistant sample points around perimeter.
 */
export function resampleContour(contour: Point2D[], numSamples = 100): Point2D[] {
  if (contour.length === 0) return [];
  if (contour.length === 1) return Array(numSamples).fill(contour[0]);

  // Calculate perimeter segment lengths
  const pts = [...contour];
  // Ensure closed loop
  if (
    pts[0].x !== pts[pts.length - 1].x ||
    pts[0].y !== pts[pts.length - 1].y
  ) {
    pts.push({ ...pts[0] });
  }

  const lengths: number[] = [];
  let totalPerimeter = 0;

  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    lengths.push(segLen);
    totalPerimeter += segLen;
  }

  if (totalPerimeter === 0) {
    return Array(numSamples).fill(pts[0]);
  }

  const step = totalPerimeter / numSamples;
  const resampled: Point2D[] = [];

  let currentSegIdx = 0;
  let currentSegAccum = 0;

  for (let i = 0; i < numSamples; i++) {
    const targetDist = i * step;

    while (
      currentSegIdx < lengths.length - 1 &&
      currentSegAccum + lengths[currentSegIdx] < targetDist
    ) {
      currentSegAccum += lengths[currentSegIdx];
      currentSegIdx++;
    }

    const segLen = lengths[currentSegIdx] || 1e-6;
    const segT = Math.min(
      1.0,
      Math.max(0.0, (targetDist - currentSegAccum) / segLen)
    );

    const pA = pts[currentSegIdx];
    const pB = pts[currentSegIdx + 1] || pA;

    resampled.push({
      x: pA.x + segT * (pB.x - pA.x),
      y: pA.y + segT * (pB.y - pA.y),
    });
  }

  return resampled;
}

/**
 * Distance from point P to line segment AB.
 */
function distanceToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const px = p.x - a.x;
    const py = p.y - a.y;
    return Math.sqrt(px * px + py * py);
  }

  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq)
  );

  const projX = a.x + t * dx;
  const projY = a.y + t * dy;

  const resX = p.x - projX;
  const resY = p.y - projY;

  return Math.sqrt(resX * resX + resY * resY);
}

/**
 * Computes shortest distance from point P to a closed polygon contour Q.
 */
export function distanceToContour(p: Point2D, contour: Point2D[]): number {
  if (contour.length === 0) return 0;
  if (contour.length === 1) {
    const dx = p.x - contour[0].x;
    const dy = p.y - contour[0].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  let minDist = Infinity;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    const d = distanceToSegment(p, a, b);
    if (d < minDist) {
      minDist = d;
    }
  }

  return minDist;
}

/**
 * Calculates symmetric mean, P95, and max contour distances in millimeters by evaluating both
 * AI -> Engineering and Engineering -> AI nearest-point distance metrics.
 */
export function computeContourDistances(
  aiContour: Point2D[],
  engContour: Point2D[],
  numSamples = 100
): ContourDistanceMetrics {
  const sampledAi = resampleContour(aiContour, numSamples);
  const sampledEng = resampleContour(engContour, numSamples);

  // 1. AI -> Engineering direction
  const aiToEngDistances: number[] = [];
  for (const pt of sampledAi) {
    const d = distanceToContour(pt, engContour);
    aiToEngDistances.push(d);
  }

  // 2. Engineering -> AI direction
  const engToAiDistances: number[] = [];
  for (const pt of sampledEng) {
    const d = distanceToContour(pt, aiContour);
    engToAiDistances.push(d);
  }

  // Combine both sets of distances for symmetric evaluation
  const allDistances = [...aiToEngDistances, ...engToAiDistances];

  if (allDistances.length === 0) {
    return {
      meanContourDistanceMm: 0,
      meanSymmetricContourDistanceMm: 0,
      p95ContourDistanceMm: 0,
      maxContourDistanceMm: 0,
      sampledDistancesMm: [],
    };
  }

  const sum = allDistances.reduce((acc, v) => acc + v, 0);
  const meanSymmetric = sum / allDistances.length;
  const max = Math.max(...allDistances);

  const sorted = [...allDistances].sort((a, b) => a - b);
  const p95Idx = Math.min(
    sorted.length - 1,
    Math.floor(0.95 * sorted.length)
  );
  const p95 = sorted[p95Idx];

  const roundedMean = Number(meanSymmetric.toFixed(2));

  return {
    meanContourDistanceMm: roundedMean,
    meanSymmetricContourDistanceMm: roundedMean,
    p95ContourDistanceMm: Number(p95.toFixed(2)),
    maxContourDistanceMm: Number(max.toFixed(2)),
    sampledDistancesMm: allDistances,
  };
}
