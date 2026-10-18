import {
  ProfilePoint2D,
  simplifyContour as sharedSimplifyContour,
} from "../../../shared/profileReconstruction.js";

/**
 * Simplifies 2D closed polygon using RDP while protecting extrema (min/max X & Y).
 */
export function simplifyProfileContour(
  contour: ProfilePoint2D[],
  options: { toleranceMm: number; protectExtrema?: boolean }
) {
  return sharedSimplifyContour(contour, options);
}
