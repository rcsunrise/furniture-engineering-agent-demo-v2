import {
  EngineeringAlignmentSession,
  EngineeringAlignmentSessionSchema,
} from "../../../shared/alignmentSession.js";
import { FurnitureEngineeringData } from "../../../shared/fes.js";
import { MeshBounds, MeshAxisMapping } from "../../../shared/meshAlignment.js";
import { computeNormalizationTransform } from "../meshAlignment/axisNormalizer.js";
import { computeDimensionAlignment } from "../meshAlignment/dimensionAligner.js";
import { computeComponentPlacement } from "../meshAlignment/componentPlacer.js";
import { evaluateGeometryResidual } from "../geometryEvaluation/geometryEvaluator.js";

export interface RunAlignmentOrchestratorParams {
  session: EngineeringAlignmentSession;
  fes?: FurnitureEngineeringData | null;
  rawBounds?: MeshBounds;
  axisMapping?: MeshAxisMapping;
}

export function runAlignmentPipeline(
  params: RunAlignmentOrchestratorParams
): EngineeringAlignmentSession {
  const session: EngineeringAlignmentSession = JSON.parse(
    JSON.stringify(params.session)
  );

  // 1. Verify Engineering Data Requirement
  const fesComponents = params.fes?.components || (params.fes as any)?.assembly?.components;
  if (!params.fes || !Array.isArray(fesComponents) || fesComponents.length === 0) {
    session.status = "WAITING_FOR_ENGINEERING_DATA";
    session.errorMessage = "Active parsed FES document required for engineering alignment.";
    session.updatedAt = Date.now();
    return EngineeringAlignmentSessionSchema.parse(session);
  }

  // 2. Verify Component Mapping
  if (!session.componentId || session.componentId.trim() === "") {
    session.status = "WAITING_FOR_COMPONENT_MAPPING";
    session.errorMessage = "No FES component selected for mapping.";
    session.updatedAt = Date.now();
    return EngineeringAlignmentSessionSchema.parse(session);
  }

  const componentsList = params.fes.components || (params.fes as any).assembly?.components || [];
  const targetComponent = componentsList.find(
    (c: any) => c.id === session.componentId
  );

  if (!targetComponent) {
    session.status = "WAITING_FOR_COMPONENT_MAPPING";
    session.errorMessage = `Target FES component '${session.componentId}' not found in document.`;
    session.updatedAt = Date.now();
    return EngineeringAlignmentSessionSchema.parse(session);
  }

  try {
    session.status = "READY";

    // Standard default raw bounds if none provided (e.g. 200 x 200 x 200 mm default box)
    const rawBounds: MeshBounds = params.rawBounds || {
      min: { x: -100, y: -100, z: -100 },
      max: { x: 100, y: 100, z: 100 },
      center: { x: 0, y: 0, z: 0 },
      size: { x: 200, y: 200, z: 200 },
      boundingRadius: 173.2,
      meshCount: 1,
      vertexCount: 1000,
      triangleCount: 500,
    };

    const axisMapping: MeshAxisMapping = params.axisMapping || {
      meshUpAxis: "+Z",
      meshFrontAxis: "+Y",
    };

    // STAGE 1: G4-4A Coordinate Normalization
    session.status = "NORMALIZING";
    const normResult = computeNormalizationTransform({
      artifactId: session.artifactId,
      partId: session.partId,
      rawBounds,
      axisMapping,
      originMode: "bottom_center",
    });

    if (normResult.status !== "NORMALIZED" || !normResult.diagnostic) {
      session.status = "FAILED";
      session.errorMessage = normResult.diagnostic?.errorMessage || "Normalization failed";
      session.updatedAt = Date.now();
      return EngineeringAlignmentSessionSchema.parse(session);
    }
    session.normalization = normResult.diagnostic;

    // STAGE 2: G4-4B Dimension Alignment
    session.status = "DIMENSION_ALIGNING";
    const dimResult = computeDimensionAlignment({
      artifactId: session.artifactId,
      partId: session.partId,
      componentId: session.componentId,
      rawOrNormalizedBounds: normResult.diagnostic.normalizedBounds || rawBounds,
      targetSize: targetComponent.size,
      scaleMode: "uniform",
      normalizationMatrix: normResult.matrix,
    });

    if (dimResult.status === "INVALID_SOURCE_BOUNDS" || dimResult.status === "INVALID_TARGET_SIZE") {
      session.status = "FAILED";
      session.errorMessage = `Dimension alignment failed with status: ${dimResult.status}`;
      session.updatedAt = Date.now();
      return EngineeringAlignmentSessionSchema.parse(session);
    }
    session.dimensionAlignment = dimResult.alignment;

    // STAGE 3: G4-4C Component Placement
    session.status = "PLACING";
    const placeResult = computeComponentPlacement({
      artifactId: session.artifactId,
      partId: session.partId,
      component: targetComponent,
      anchorMode: "bottom_center",
      normalizationTransform: normResult.diagnostic.transform,
      dimensionAlignment: dimResult.alignment,
      rawBounds,
    });

    if (placeResult.status !== "PLACED" && placeResult.status !== "PLACEMENT_WARNING") {
      session.status = "FAILED";
      session.errorMessage = placeResult.errorMessage || `Placement failed with status: ${placeResult.status}`;
      session.updatedAt = Date.now();
      return EngineeringAlignmentSessionSchema.parse(session);
    }
    session.placement = placeResult.placement;
    session.engineeringTransform = placeResult.engineeringTransform;

    // STAGE 4: G4-4D-R1 Geometry Evaluation
    session.status = "EVALUATING";
    const evalResult = evaluateGeometryResidual({
      artifactId: session.artifactId,
      component: targetComponent,
      meshOptions: {
        bounds: normResult.diagnostic.normalizedBounds || rawBounds,
        engineeringMatrix: placeResult.matrix,
      },
    });

    session.evaluation = evalResult.report;
    session.geometrySource = evalResult.report.geometrySource;

    // Pipeline Complete
    session.status = "COMPLETED";
    session.updatedAt = Date.now();
    session.productionTruth = false;

    return EngineeringAlignmentSessionSchema.parse(session);
  } catch (err: any) {
    session.status = "FAILED";
    session.errorMessage = err?.message || String(err);
    session.updatedAt = Date.now();
    return EngineeringAlignmentSessionSchema.parse(session);
  }
}
