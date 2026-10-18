import {
  ProfilePoint2D,
  applyDimensionLock as sharedApplyDimensionLock,
} from "../../../shared/profileReconstruction.js";

/**
 * Constrains and dimension-locks extracted profile points to exact target engineering bounds.
 */
export function lockProfileDimensions(
  points: ProfilePoint2D[],
  targetSize1Mm: number,
  targetSize2Mm: number
) {
  return sharedApplyDimensionLock(points, targetSize1Mm, targetSize2Mm);
}
