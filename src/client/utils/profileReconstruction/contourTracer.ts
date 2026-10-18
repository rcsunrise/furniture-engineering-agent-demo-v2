import {
  ProfilePoint2D,
  computeSignedPolygonArea,
  enforceCCWWinding,
} from "../../../shared/profileReconstruction.js";

/**
 * Ensures deterministic point ordering around the perimeter with CCW winding.
 */
export function orderContourPoints(
  contour: ProfilePoint2D[]
): {
  ordered: ProfilePoint2D[];
  winding: "CCW" | "CW";
  area: number;
} {
  const { points: ordered, winding } = enforceCCWWinding(contour);
  const area = Math.abs(computeSignedPolygonArea(ordered));
  return { ordered, winding, area };
}
