import {
  EvaluationStatus,
  GeometryResidualReport,
  GeometryResidualReportSchema,
  ProjectionResidual,
  EvaluatorWeights,
  getReferenceAdequacy,
} from "../../../shared/geometryEvaluation.js";
import { Vector3D } from "../../../shared/meshAlignment.js";
import {
  ComponentProfileInput,
  EngineeringProfile2D,
  getEngineeringProfile,
} from "./engineeringProfileProvider.js";
import {
  ProjectMeshOptions,
  ProjectedSilhouette2D,
  projectMeshToView,
  computeProjectionSanity,
} from "./meshProjector.js";
import { computeSilhouetteComparison } from "./silhouetteComparator.js";
import { computeContourDistances } from "./contourDistance.js";
import { LandmarkDefinition, computeLandmarkResiduals } from "./landmarkResidual.js";
import { computeGeometryScore } from "./geometryScore.js";

export interface EvaluateGeometryParams {
  artifactId: string;
  component?: {
    id: string;
    size: Vector3D;
    workbookProfile?: any[];
    workbookLoftGroup?: string;
    cadContour?: any[];
  };
  meshOptions?: ProjectMeshOptions;
  landmarks?: LandmarkDefinition[];
  weights?: EvaluatorWeights;
}

export interface EvaluateGeometryResult {
  status: EvaluationStatus;
  report: GeometryResidualReport;
  contours: {
    front: { ai: ProjectedSilhouette2D; eng: EngineeringProfile2D };
    side: { ai: ProjectedSilhouette2D; eng: EngineeringProfile2D };
    top: { ai: ProjectedSilhouette2D; eng: EngineeringProfile2D };
  };
  errorMessage?: string;
}

/**
 * Runs deterministic G4-4D / G4-4D-R1 Geometry Residual Evaluation.
 */
export function evaluateGeometryResidual(
  params: EvaluateGeometryParams
): EvaluateGeometryResult {
  const { artifactId, component, meshOptions, landmarks, weights } = params;

  // 1. Validation
  if (!component) {
    const emptyReport: GeometryResidualReport = {
      componentId: "NOT_FOUND",
      artifactId,
      geometrySource: "proxy_fallback",
      referenceAdequacy: "MISSING",
      gateEligible: false,
      crossViewConsistency: 0,
      views: [],
      landmarks: [],
      overallScore: 0,
      qualityLevel: "REFERENCE_UNUSABLE",
      status: "PROFILE_MISSING",
      errorMessage: "Target FES component not provided or profile missing",
      productionTruth: false,
    };
    return {
      status: "PROFILE_MISSING",
      report: emptyReport,
      contours: null as any,
      errorMessage: "Target FES component not provided or profile missing",
    };
  }

  try {
    const compInput: ComponentProfileInput = {
      id: component.id,
      size: component.size,
      workbookProfile: component.workbookProfile,
      workbookLoftGroup: component.workbookLoftGroup,
      cadContour: component.cadContour,
    };

    const views: ("front" | "side" | "top")[] = ["front", "side", "top"];
    const viewResiduals: ProjectionResidual[] = [];

    const contoursResult: any = {};
    let resolvedGeometrySource: any = "proxy_fallback";

    for (const view of views) {
      // 2. Fetch Engineering Reference Profile
      const engProfile = getEngineeringProfile(compInput, view);
      resolvedGeometrySource = engProfile.geometrySource;

      // 3. Project AI Mesh
      const aiSilhouette = projectMeshToView(meshOptions || {}, view);

      // 4. Projection Sanity Check
      const sanity = computeProjectionSanity(
        engProfile.widthMm,
        engProfile.heightMm,
        aiSilhouette.widthMm,
        aiSilhouette.heightMm
      );

      // 5. Compare Silhouettes (IoU & Area Residual)
      const silComp = computeSilhouetteComparison(aiSilhouette, engProfile);

      // 6. Symmetric Contour Distances (Mean, P95, Max mm)
      const contourDist = computeContourDistances(
        aiSilhouette.contour,
        engProfile.contour
      );

      const viewResidual: ProjectionResidual = {
        view,
        silhouetteIoU: Number(silComp.silhouetteIoU.toFixed(3)),
        areaResidualPercent: Number(silComp.areaResidualPercent.toFixed(1)),
        meanContourDistanceMm: contourDist.meanContourDistanceMm,
        meanSymmetricContourDistanceMm: contourDist.meanSymmetricContourDistanceMm,
        p95ContourDistanceMm: contourDist.p95ContourDistanceMm,
        maxContourDistanceMm: contourDist.maxContourDistanceMm,
        contourPointsCount: contourDist.sampledDistancesMm.length,
        sanity,
      };

      viewResiduals.push(viewResidual);
      contoursResult[view] = { ai: aiSilhouette, eng: engProfile };
    }

    // 7. Landmark Residuals
    const landmarkResiduals = computeLandmarkResiduals(landmarks);

    // 8. Overall Score & Quality Level
    const scoreResult = computeGeometryScore({
      views: viewResiduals,
      weights,
    });

    const referenceAdequacy = getReferenceAdequacy(resolvedGeometrySource);
    const isProxy = resolvedGeometrySource === "proxy_fallback";
    const gateEligible = !isProxy && referenceAdequacy !== "PROXY_ONLY";
    const status: EvaluationStatus = isProxy ? "REFERENCE_INSUFFICIENT" : "EVALUATED";

    const report: GeometryResidualReport = {
      componentId: component.id,
      artifactId,
      geometrySource: resolvedGeometrySource,
      referenceAdequacy,
      gateEligible,
      crossViewConsistency: scoreResult.crossViewConsistency,
      views: viewResiduals,
      landmarks: landmarkResiduals,
      overallScore: scoreResult.overallScore,
      qualityLevel: scoreResult.qualityLevel,
      status,
      errorMessage: isProxy
        ? "Proxy reference geometry is not eligible for engineering gate acceptance"
        : undefined,
      productionTruth: false,
    };

    // Schema validation
    GeometryResidualReportSchema.parse(report);

    return {
      status,
      report,
      contours: contoursResult,
      errorMessage: isProxy
        ? "Proxy reference geometry is not eligible for engineering gate acceptance"
        : undefined,
    };
  } catch (err: any) {
    const errorReport: GeometryResidualReport = {
      componentId: component.id,
      artifactId,
      geometrySource: "proxy_fallback",
      referenceAdequacy: "PROXY_ONLY",
      gateEligible: false,
      crossViewConsistency: 0,
      views: [],
      landmarks: [],
      overallScore: 0,
      qualityLevel: "REFERENCE_UNUSABLE",
      status: "EVALUATION_FAILED",
      errorMessage: err.message || "Failed to evaluate geometry residuals",
      productionTruth: false,
    };
    return {
      status: "EVALUATION_FAILED",
      report: errorReport,
      contours: null as any,
      errorMessage: err.message || "Failed to evaluate geometry residuals",
    };
  }
}
