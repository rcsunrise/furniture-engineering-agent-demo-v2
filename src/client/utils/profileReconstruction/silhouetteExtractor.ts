import { ProfilePoint2D, extractRawSilhouette, computeConvexHull2D } from "../../../shared/profileReconstruction.js";

/**
 * Extracts raw 2D outer silhouette contour from projected 2D points.
 */
export function extractSilhouetteContour(
  points: ProfilePoint2D[],
  options?: { numSectors?: number }
): ProfilePoint2D[] {
  return extractRawSilhouette(points, options?.numSectors || 180);
}
