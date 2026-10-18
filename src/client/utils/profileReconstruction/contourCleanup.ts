import {
  ProfilePoint2D,
  cleanupContour as sharedCleanupContour,
  ContourCleanupOptions,
} from "../../../shared/profileReconstruction.js";

/**
 * Removes duplicates, needle spikes, outliers, and small oscillations from raw contours.
 */
export function cleanProfileContour(
  contour: ProfilePoint2D[],
  options: ContourCleanupOptions
) {
  return sharedCleanupContour(contour, options);
}
