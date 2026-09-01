import * as THREE from "three";
import {
  Vector3D,
  MeshAnchorMode,
  MeshAnchorModeSchema,
  MeshPlacementStatus,
  MeshComponentPlacement,
  MeshComponentPlacementSchema,
  MeshEngineeringTransform,
  MeshEngineeringTransformSchema,
  MeshNormalizationTransform,
  MeshDimensionAlignment,
  MeshBounds,
} from "../../../shared/meshAlignment.js";

export interface ComputeComponentPlacementParams {
  artifactId: string;
  partId?: string;
  component?: {
    id: string;
    position: Vector3D; // mm
    rotation?: Vector3D; // deg { x, y, z }
    size: Vector3D; // mm { x, y, z }
    anchorMode?: MeshAnchorMode;
  };
  anchorMode?: MeshAnchorMode;
  normalizationTransform?: MeshNormalizationTransform;
  dimensionAlignment?: MeshDimensionAlignment;
  rawBounds?: MeshBounds;
}

export interface ComponentAnchorResult {
  anchorMode: MeshAnchorMode;
  offset: Vector3D;
}

export interface ComputeComponentPlacementResult {
  status: MeshPlacementStatus;
  placement: MeshComponentPlacement;
  engineeringTransform: MeshEngineeringTransform;
  matrix: THREE.Matrix4;
  errorMessage?: string;
}

/**
 * Resolves local anchor offset given component dimensions and requested anchor mode.
 * Default canonical anchor mode is "bottom_center".
 */
export function resolveComponentAnchor(
  component: { size: Vector3D; anchorMode?: MeshAnchorMode },
  requestedMode?: MeshAnchorMode
): ComponentAnchorResult {
  const anchorMode = requestedMode || component.anchorMode || "bottom_center";

  // Validate anchor mode enum
  const parseResult = MeshAnchorModeSchema.safeParse(anchorMode);
  if (!parseResult.success) {
    return {
      anchorMode: "bottom_center",
      offset: { x: 0, y: 0, z: 0 },
    };
  }

  const { x: W, y: D, z: H } = component.size;

  let offset: Vector3D = { x: 0, y: 0, z: 0 };

  switch (anchorMode) {
    case "bottom_center":
      // FES component position is at bottom-center of component
      offset = { x: 0, y: 0, z: 0 };
      break;
    case "center":
      // FES component position is at box center. AI mesh bottom-center must shift down by H/2
      offset = { x: 0, y: 0, z: -H / 2 };
      break;
    case "rear_bottom_center":
      // FES component position is at rear bottom-center
      offset = { x: 0, y: -D / 2, z: 0 };
      break;
    case "custom":
      offset = { x: 0, y: 0, z: 0 };
      break;
    default:
      offset = { x: 0, y: 0, z: 0 };
  }

  return { anchorMode, offset };
}

/**
 * Deterministically computes M_engineering = T_component * R_component * S_dimension * M_normalize
 */
export function computeComponentPlacement(
  params: ComputeComponentPlacementParams
): ComputeComponentPlacementResult {
  const {
    artifactId,
    partId,
    component,
    anchorMode: requestedAnchorMode,
    normalizationTransform,
    dimensionAlignment,
  } = params;

  // 1. Validate Target Component Existence
  if (!component) {
    const identityMat = new THREE.Matrix4().identity().toArray();
    const emptyPlacement: MeshComponentPlacement = {
      artifactId,
      partId,
      componentId: "NOT_FOUND",
      anchorMode: "bottom_center",
      targetPosition: { x: 0, y: 0, z: 0 },
      targetRotation: { x: 0, y: 0, z: 0 },
      appliedPosition: { x: 0, y: 0, z: 0 },
      appliedRotation: { x: 0, y: 0, z: 0 },
      anchorOffset: { x: 0, y: 0, z: 0 },
      status: "TARGET_COMPONENT_NOT_FOUND",
      confidence: 0,
      engineeringMatrix: identityMat,
      productionTruth: false,
    };
    const emptyTransform: MeshEngineeringTransform = {
      artifactId,
      componentId: "NOT_FOUND",
      normalizationMatrix: identityMat,
      dimensionMatrix: identityMat,
      placementMatrix: identityMat,
      finalEngineeringMatrix: identityMat,
      productionTruth: false,
    };
    return {
      status: "TARGET_COMPONENT_NOT_FOUND",
      placement: emptyPlacement,
      engineeringTransform: emptyTransform,
      matrix: new THREE.Matrix4(),
      errorMessage: "Target FES component not provided or not found",
    };
  }

  // 2. Validate Component Values (numeric, non-NaN, non-infinite, positive size)
  const pos = component.position;
  const rot = component.rotation || { x: 0, y: 0, z: 0 };
  const size = component.size;

  const isInvalidNum = (v: Vector3D) =>
    !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z);

  if (isInvalidNum(pos) || isInvalidNum(rot) || isInvalidNum(size) || size.x <= 0 || size.y <= 0 || size.z <= 0) {
    const identityMat = new THREE.Matrix4().identity().toArray();
    return {
      status: "INVALID_TRANSFORM",
      placement: {
        artifactId,
        partId,
        componentId: component.id,
        anchorMode: "bottom_center",
        targetPosition: { x: 0, y: 0, z: 0 },
        targetRotation: { x: 0, y: 0, z: 0 },
        appliedPosition: { x: 0, y: 0, z: 0 },
        appliedRotation: { x: 0, y: 0, z: 0 },
        anchorOffset: { x: 0, y: 0, z: 0 },
        status: "INVALID_TRANSFORM",
        confidence: 0,
        engineeringMatrix: identityMat,
        productionTruth: false,
      },
      engineeringTransform: {
        artifactId,
        componentId: component.id,
        normalizationMatrix: identityMat,
        dimensionMatrix: identityMat,
        placementMatrix: identityMat,
        finalEngineeringMatrix: identityMat,
        productionTruth: false,
      },
      matrix: new THREE.Matrix4(),
      errorMessage: "Invalid component transform or size dimensions",
    };
  }

  // 3. Resolve Anchor Mode
  const modeToUse = requestedAnchorMode || component.anchorMode || "bottom_center";
  const anchorParse = MeshAnchorModeSchema.safeParse(modeToUse);
  if (!anchorParse.success) {
    const identityMat = new THREE.Matrix4().identity().toArray();
    return {
      status: "INVALID_ANCHOR",
      placement: {
        artifactId,
        partId,
        componentId: component.id,
        anchorMode: "bottom_center",
        targetPosition: pos,
        targetRotation: rot,
        appliedPosition: pos,
        appliedRotation: rot,
        anchorOffset: { x: 0, y: 0, z: 0 },
        status: "INVALID_ANCHOR",
        confidence: 0,
        engineeringMatrix: identityMat,
        productionTruth: false,
      },
      engineeringTransform: {
        artifactId,
        componentId: component.id,
        normalizationMatrix: identityMat,
        dimensionMatrix: identityMat,
        placementMatrix: identityMat,
        finalEngineeringMatrix: identityMat,
        productionTruth: false,
      },
      matrix: new THREE.Matrix4(),
      errorMessage: `Invalid anchor mode: ${modeToUse}`,
    };
  }

  // 4. Determine Actual Aligned Target Dimensions
  const alignedSize = dimensionAlignment ? dimensionAlignment.alignedSize : size;
  const anchorRes = resolveComponentAnchor({ size: alignedSize }, anchorParse.data);

  // 5. Build Component Rotation & Position Matrices
  // Convert rotation angles from degrees to radians
  const rotRad = {
    x: (rot.x * Math.PI) / 180,
    y: (rot.y * Math.PI) / 180,
    z: (rot.z * Math.PI) / 180,
  };

  const eulerRot = new THREE.Euler(rotRad.x, rotRad.y, rotRad.z, "XYZ");
  const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(eulerRot);

  // Offset vector rotated by component rotation
  const rotatedOffset = new THREE.Vector3(
    anchorRes.offset.x,
    anchorRes.offset.y,
    anchorRes.offset.z
  ).applyEuler(eulerRot);

  const appliedPos: Vector3D = {
    x: pos.x + rotatedOffset.x,
    y: pos.y + rotatedOffset.y,
    z: pos.z + rotatedOffset.z,
  };

  const posMatrix = new THREE.Matrix4().makeTranslation(
    appliedPos.x,
    appliedPos.y,
    appliedPos.z
  );

  // M_placement = T_component * R_component
  const placementMatrix = posMatrix.clone().multiply(rotMatrix);

  // 6. Build S_dimension Matrix
  let dimensionMatrix = new THREE.Matrix4().identity();
  if (dimensionAlignment?.dimensionMatrix) {
    dimensionMatrix = new THREE.Matrix4().fromArray(dimensionAlignment.dimensionMatrix);
  } else if (dimensionAlignment?.appliedScale) {
    dimensionMatrix.makeScale(
      dimensionAlignment.appliedScale.x,
      dimensionAlignment.appliedScale.y,
      dimensionAlignment.appliedScale.z
    );
  }

  // 7. Build M_normalize Matrix
  let normalizationMatrix = new THREE.Matrix4().identity();
  if (normalizationTransform?.normalizationMatrix) {
    normalizationMatrix = new THREE.Matrix4().fromArray(
      normalizationTransform.normalizationMatrix
    );
  }

  // 8. Compose M_engineering = T_comp * R_comp * S_dim * M_norm
  const finalEngineeringMatrix = placementMatrix
    .clone()
    .multiply(dimensionMatrix)
    .multiply(normalizationMatrix);

  const placement: MeshComponentPlacement = {
    artifactId,
    partId,
    componentId: component.id,
    anchorMode: anchorRes.anchorMode,
    targetPosition: pos,
    targetRotation: rot,
    appliedPosition: appliedPos,
    appliedRotation: rot,
    anchorOffset: anchorRes.offset,
    status: "PLACED",
    confidence: 1.0,
    engineeringMatrix: finalEngineeringMatrix.toArray(),
    productionTruth: false,
  };

  const engineeringTransform: MeshEngineeringTransform = {
    artifactId,
    componentId: component.id,
    normalizationMatrix: normalizationMatrix.toArray(),
    dimensionMatrix: dimensionMatrix.toArray(),
    placementMatrix: placementMatrix.toArray(),
    finalEngineeringMatrix: finalEngineeringMatrix.toArray(),
    productionTruth: false,
  };

  // Validate schemas
  MeshComponentPlacementSchema.parse(placement);
  MeshEngineeringTransformSchema.parse(engineeringTransform);

  return {
    status: "PLACED",
    placement,
    engineeringTransform,
    matrix: finalEngineeringMatrix,
  };
}
