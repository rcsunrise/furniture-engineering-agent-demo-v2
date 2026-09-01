import { Point2D, EngineeringProfile2D } from "./engineeringProfileProvider.js";
import { ProjectedSilhouette2D } from "./meshProjector.js";

export interface SilhouetteComparisonResult {
  silhouetteIoU: number; // 0.0 to 1.0
  areaResidualPercent: number; // percentage (-100% to +inf%)
  aiAreaMm2: number;
  engineeringAreaMm2: number;
  intersectionAreaMm2: number;
  unionAreaMm2: number;
}

export function computeSilhouetteComparison(
  aiSilhouette: ProjectedSilhouette2D,
  engProfile: EngineeringProfile2D
): SilhouetteComparisonResult {
  const bAI = aiSilhouette.bounds2D;
  const bENG = engProfile.bounds2D;

  const areaAI = (bAI.maxX - bAI.minX) * (bAI.maxY - bAI.minY);
  const areaENG = (bENG.maxX - bENG.minX) * (bENG.maxY - bENG.minY);

  const interMinX = Math.max(bAI.minX, bENG.minX);
  const interMaxX = Math.min(bAI.maxX, bENG.maxX);
  const interMinY = Math.max(bAI.minY, bENG.minY);
  const interMaxY = Math.min(bAI.maxY, bENG.maxY);

  const interWidth = Math.max(0, interMaxX - interMinX);
  const interHeight = Math.max(0, interMaxY - interMinY);
  const intersectionArea = interWidth * interHeight;

  const unionArea = areaAI + areaENG - intersectionArea;

  let silhouetteIoU = 0;
  if (unionArea > 0) {
    silhouetteIoU = Math.min(1.0, Math.max(0.0, intersectionArea / unionArea));
  }

  let areaResidualPercent = 0;
  if (areaENG > 0) {
    areaResidualPercent = ((areaAI - areaENG) / areaENG) * 100;
  }

  return {
    silhouetteIoU,
    areaResidualPercent,
    aiAreaMm2: areaAI,
    engineeringAreaMm2: areaENG,
    intersectionAreaMm2: intersectionArea,
    unionAreaMm2: unionArea,
  };
}
