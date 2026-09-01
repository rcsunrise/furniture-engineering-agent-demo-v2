import * as THREE from "three";
import {
  MeshBounds,
  Vector3D,
  MeshScaleMode,
  DistortionLevel,
  MeshDimensionAlignmentStatus,
  MeshDimensionAlignment,
  MeshDimensionAlignmentSchema,
} from "../../../shared/meshAlignment.js";

export interface ComputeDimensionAlignmentParams {
  artifactId: string;
  partId?: string;
  componentId?: string;
  rawOrNormalizedBounds: MeshBounds;
  targetSize?: Vector3D;
  scaleMode: MeshScaleMode;
  normalizationMatrix?: THREE.Matrix4;
}

export interface DimensionAlignmentResult {
  status: MeshDimensionAlignmentStatus;
  alignment: MeshDimensionAlignment;
  matrix?: THREE.Matrix4;
}

/**
 * Deterministically computes the best-fit uniform scaling factor $s$ that minimizes
 * total relative squared dimension error across all three axes (X, Y, Z):
 *
 * E(s) = sum_{i in {x,y,z}} ( s * (source_i / target_i) - 1 )^2
 *
 * Setting dE/ds = 0 yields:
 * s = sum(source_i / target_i) / sum((source_i / target_i)^2)
 */
export function computeBestFitUniformScale(source: Vector3D, target: Vector3D): number {
  const rX = source.x / target.x;
  const rY = source.y / target.y;
  const rZ = source.z / target.z;

  const num = rX + rY + rZ;
  const den = rX * rX + rY * rY + rZ * rZ;

  if (den <= 0 || !Number.isFinite(num) || !Number.isFinite(den)) {
    return 1.0;
  }

  return num / den;
}

export function computeDimensionAlignment(
  params: ComputeDimensionAlignmentParams
): DimensionAlignmentResult {
  const {
    artifactId,
    partId,
    componentId,
    rawOrNormalizedBounds,
    targetSize,
    scaleMode,
    normalizationMatrix,
  } = params;

  // 1. Check target size existence
  if (!targetSize) {
    const emptySize = { x: 0, y: 0, z: 0 };
    const alignment: MeshDimensionAlignment = {
      artifactId,
      partId,
      componentId: componentId || undefined,
      sourceSize: rawOrNormalizedBounds?.size || emptySize,
      targetSize: emptySize,
      candidateScale: emptySize,
      appliedScale: emptySize,
      scaleMode,
      alignedSize: emptySize,
      residualMm: emptySize,
      residualPercent: emptySize,
      aspectDistortion: 1.0,
      distortionRisk: false,
      distortionLevel: "LOW",
      confidence: 0,
      status: "TARGET_COMPONENT_NOT_FOUND",
      productionTruth: false,
    };
    return { status: "TARGET_COMPONENT_NOT_FOUND", alignment };
  }

  const sourceSize = rawOrNormalizedBounds.size;

  // 2. Validate source bounds
  if (
    !Number.isFinite(sourceSize.x) ||
    !Number.isFinite(sourceSize.y) ||
    !Number.isFinite(sourceSize.z) ||
    sourceSize.x <= 0 ||
    sourceSize.y <= 0 ||
    sourceSize.z <= 0
  ) {
    const emptySize = { x: 0, y: 0, z: 0 };
    const alignment: MeshDimensionAlignment = {
      artifactId,
      partId,
      componentId,
      sourceSize: sourceSize || emptySize,
      targetSize,
      candidateScale: emptySize,
      appliedScale: emptySize,
      scaleMode,
      alignedSize: emptySize,
      residualMm: emptySize,
      residualPercent: emptySize,
      aspectDistortion: 1.0,
      distortionRisk: false,
      distortionLevel: "LOW",
      confidence: 0,
      status: "INVALID_SOURCE_BOUNDS",
      productionTruth: false,
    };
    return { status: "INVALID_SOURCE_BOUNDS", alignment };
  }

  // 3. Validate target size
  if (
    !Number.isFinite(targetSize.x) ||
    !Number.isFinite(targetSize.y) ||
    !Number.isFinite(targetSize.z) ||
    targetSize.x <= 0 ||
    targetSize.y <= 0 ||
    targetSize.z <= 0
  ) {
    const emptySize = { x: 0, y: 0, z: 0 };
    const alignment: MeshDimensionAlignment = {
      artifactId,
      partId,
      componentId,
      sourceSize,
      targetSize,
      candidateScale: emptySize,
      appliedScale: emptySize,
      scaleMode,
      alignedSize: emptySize,
      residualMm: emptySize,
      residualPercent: emptySize,
      aspectDistortion: 1.0,
      distortionRisk: false,
      distortionLevel: "LOW",
      confidence: 0,
      status: "INVALID_TARGET_SIZE",
      productionTruth: false,
    };
    return { status: "INVALID_TARGET_SIZE", alignment };
  }

  // 4. Candidate Scales (per-axis)
  const candidateScale: Vector3D = {
    x: targetSize.x / sourceSize.x,
    y: targetSize.y / sourceSize.y,
    z: targetSize.z / sourceSize.z,
  };

  // 5. Applied Scale according to Scale Mode
  let appliedScale: Vector3D;
  if (scaleMode === "non_uniform_preview") {
    appliedScale = { ...candidateScale };
  } else {
    const uniformS = computeBestFitUniformScale(sourceSize, targetSize);
    appliedScale = { x: uniformS, y: uniformS, z: uniformS };
  }

  // 6. Aligned Size & Residuals
  const alignedSize: Vector3D = {
    x: sourceSize.x * appliedScale.x,
    y: sourceSize.y * appliedScale.y,
    z: sourceSize.z * appliedScale.z,
  };

  const residualMm: Vector3D = {
    x: targetSize.x - alignedSize.x,
    y: targetSize.y - alignedSize.y,
    z: targetSize.z - alignedSize.z,
  };

  const residualPercent: Vector3D = {
    x: (residualMm.x / targetSize.x) * 100,
    y: (residualMm.y / targetSize.y) * 100,
    z: (residualMm.z / targetSize.z) * 100,
  };

  // 7. Aspect Distortion Calculation
  const maxScale = Math.max(candidateScale.x, candidateScale.y, candidateScale.z);
  const minScale = Math.min(candidateScale.x, candidateScale.y, candidateScale.z);
  const aspectDistortion = minScale > 0 ? maxScale / minScale : 999.0;

  let distortionLevel: DistortionLevel = "LOW";
  if (aspectDistortion > 1.15) {
    distortionLevel = "HIGH";
  } else if (aspectDistortion > 1.05) {
    distortionLevel = "MEDIUM";
  }

  const distortionRisk = scaleMode === "non_uniform_preview" || aspectDistortion > 1.15;

  // 8. Compose Dimension Matrix (Transform Chain)
  // M_dimension = S_dimension * M_normalize
  const scaleMat = new THREE.Matrix4().makeScale(
    appliedScale.x,
    appliedScale.y,
    appliedScale.z
  );

  let finalMatrix: THREE.Matrix4;
  if (normalizationMatrix) {
    finalMatrix = new THREE.Matrix4().multiplyMatrices(scaleMat, normalizationMatrix);
  } else {
    finalMatrix = scaleMat;
  }

  const status: MeshDimensionAlignmentStatus = distortionRisk ? "DISTORTION_WARNING" : "ALIGNED";

  const alignment: MeshDimensionAlignment = {
    artifactId,
    partId,
    componentId,
    sourceSize,
    targetSize,
    candidateScale,
    appliedScale,
    scaleMode,
    alignedSize,
    residualMm,
    residualPercent,
    aspectDistortion: Number(aspectDistortion.toFixed(4)),
    distortionRisk,
    distortionLevel,
    confidence: 1.0,
    status,
    dimensionMatrix: Array.from(finalMatrix.elements),
    productionTruth: false,
  };

  // Validate with Zod
  MeshDimensionAlignmentSchema.parse(alignment);

  return {
    status,
    alignment,
    matrix: finalMatrix,
  };
}
