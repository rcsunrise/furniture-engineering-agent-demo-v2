import { LandmarkResidual } from "../../../shared/geometryEvaluation.js";
import { Point2D } from "./engineeringProfileProvider.js";

export interface LandmarkDefinition {
  name: string;
  targetLocation: Point2D; // mm
  aiLocation?: Point2D; // mm
}

/**
 * Calculates 2D projected residual distance in millimeters for optional geometric landmarks.
 * Does not fabricate missing landmarks.
 */
export function computeLandmarkResiduals(
  landmarks?: LandmarkDefinition[]
): LandmarkResidual[] {
  if (!landmarks || landmarks.length === 0) {
    return [];
  }

  const residuals: LandmarkResidual[] = [];

  for (const lm of landmarks) {
    if (!lm.aiLocation) {
      continue; // Skip landmarks that do not exist on the AI mesh
    }

    const deltaX = lm.aiLocation.x - lm.targetLocation.x;
    const deltaY = lm.aiLocation.y - lm.targetLocation.y;
    const projectedDistanceMm = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    residuals.push({
      landmarkName: lm.name,
      projectedDistanceMm: Number(projectedDistanceMm.toFixed(2)),
      deltaX: Number(deltaX.toFixed(2)),
      deltaY: Number(deltaY.toFixed(2)),
    });
  }

  return residuals;
}
