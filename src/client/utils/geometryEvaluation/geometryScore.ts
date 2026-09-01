import {
  EvaluatorWeights,
  EvaluatorWeightsSchema,
  GeometryQualityLevel,
  ProjectionResidual,
} from "../../../shared/geometryEvaluation.js";

export interface ComputeGeometryScoreParams {
  views: ProjectionResidual[];
  dimensionResidualPercent?: number; // e.g. average dimension scaling error %
  weights?: EvaluatorWeights;
}

export interface GeometryScoreResult {
  overallScore: number; // 0.0 to 100.0
  qualityLevel: GeometryQualityLevel;
  appliedWeights: EvaluatorWeights;
  crossViewConsistency: number; // 0.0 to 100.0
}

export const DEFAULT_EVALUATOR_WEIGHTS: EvaluatorWeights = {
  frontWeight: 0.4,
  sideWeight: 0.3,
  topWeight: 0.2,
  dimensionWeight: 0.1,
};

/**
 * Deterministically computes weighted reference geometry score (0-100) and maps to quality level.
 */
export function computeGeometryScore(
  params: ComputeGeometryScoreParams
): GeometryScoreResult {
  const weights = params.weights || DEFAULT_EVALUATOR_WEIGHTS;
  EvaluatorWeightsSchema.parse(weights);

  const frontView = params.views.find((v) => v.view === "front");
  const sideView = params.views.find((v) => v.view === "side");
  const topView = params.views.find((v) => v.view === "top");

  // Helper: Convert view residual (IoU & mean distance) to view score (0-100)
  const calculateViewScore = (view?: ProjectionResidual): number => {
    if (!view) return 0;
    // IoU score component (0 to 1 -> 0 to 100)
    const iouScore = view.silhouetteIoU * 100;

    // Mean contour distance penalty: 1mm error reduces score by 2 points (capped at 50mm error)
    const distPenalty = Math.min(50, view.meanContourDistanceMm) * 2;
    const distanceScore = Math.max(0, 100 - distPenalty);

    // Combined view score: 60% IoU + 40% distance accuracy
    return 0.6 * iouScore + 0.4 * distanceScore;
  };

  const frontScore = calculateViewScore(frontView);
  const sideScore = calculateViewScore(sideView);
  const topScore = calculateViewScore(topView);

  // Dimension accuracy score (0-100)
  const dimErr = Math.abs(params.dimensionResidualPercent || 0);
  const dimensionScore = Math.max(0, 100 - dimErr * 2); // 1% error = 2pt penalty

  const totalWeight =
    weights.frontWeight +
    weights.sideWeight +
    weights.topWeight +
    weights.dimensionWeight;

  const rawWeightedScore =
    (frontScore * weights.frontWeight +
      sideScore * weights.sideWeight +
      topScore * weights.topWeight +
      dimensionScore * weights.dimensionWeight) /
    (totalWeight || 1.0);

  // Cross-view consistency based on IoU range across views
  const iouList = [
    frontView?.silhouetteIoU ?? 0,
    sideView?.silhouetteIoU ?? 0,
    topView?.silhouetteIoU ?? 0,
  ];
  const maxIoU = Math.max(...iouList);
  const minIoU = Math.min(...iouList);
  const iouRange = maxIoU - minIoU;
  const crossViewConsistency = Number(
    Math.max(0, Math.min(100, (1 - iouRange) * 100)).toFixed(1)
  );

  const overallScore = Number(
    Math.min(100, Math.max(0, rawWeightedScore)).toFixed(1)
  );

  let qualityLevel: GeometryQualityLevel = "REFERENCE_UNUSABLE";
  if (overallScore >= 85) {
    qualityLevel = "REFERENCE_HIGH";
  } else if (overallScore >= 70) {
    qualityLevel = "REFERENCE_MEDIUM";
  } else if (overallScore >= 50) {
    qualityLevel = "REFERENCE_LOW";
  } else {
    qualityLevel = "REFERENCE_UNUSABLE";
  }

  return {
    overallScore,
    qualityLevel,
    appliedWeights: weights,
    crossViewConsistency,
  };
}
