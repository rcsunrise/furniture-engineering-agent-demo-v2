import * as THREE from "three";
import {
  SignedAxis,
  OriginMode,
  MeshBounds,
  MeshAxisMapping,
  MeshNormalizationTransform,
  MeshAlignmentDiagnostic,
  NormalizationStatus,
  Vector3D,
} from "../../../shared/meshAlignment";

/**
 * Converts signed axis string ("+X", "-X", "+Y", "-Y", "+Z", "-Z") into a THREE.Vector3 unit vector.
 */
export function parseSignedAxis(axis: SignedAxis): THREE.Vector3 {
  switch (axis) {
    case "+X":
      return new THREE.Vector3(1, 0, 0);
    case "-X":
      return new THREE.Vector3(-1, 0, 0);
    case "+Y":
      return new THREE.Vector3(0, 1, 0);
    case "-Y":
      return new THREE.Vector3(0, -1, 0);
    case "+Z":
      return new THREE.Vector3(0, 0, 1);
    case "-Z":
      return new THREE.Vector3(0, 0, -1);
  }
}

/**
 * Validates that meshUpAxis and meshFrontAxis are strictly orthogonal.
 */
export function validateAxisMapping(mapping: MeshAxisMapping): boolean {
  const vUp = parseSignedAxis(mapping.meshUpAxis);
  const vFront = parseSignedAxis(mapping.meshFrontAxis);
  const dot = Math.abs(vUp.dot(vFront));
  return dot < 1e-4;
}

/**
 * Computes the normalization transform mapping mesh coordinates into Canonical Engineering Space:
 * - Engineering X = LEFT / RIGHT (+X)
 * - Engineering Y = FRONT / BACK (+Y)
 * - Engineering Z = UP / DOWN (+Z)
 *
 * M_normalize = T_origin * R_axis
 */
export function computeNormalizationTransform(params: {
  artifactId: string;
  partId?: string;
  rawBounds: MeshBounds;
  axisMapping: MeshAxisMapping;
  originMode?: OriginMode;
}): {
  status: NormalizationStatus;
  diagnostic: MeshAlignmentDiagnostic;
  matrix?: THREE.Matrix4;
} {
  const { artifactId, partId, rawBounds, axisMapping } = params;
  const originMode: OriginMode = params.originMode || "bottom_center";

  if (!validateAxisMapping(axisMapping)) {
    const diagnostic: MeshAlignmentDiagnostic = {
      artifactId,
      partId,
      status: "INVALID_AXIS_MAPPING",
      rawBounds,
      errorMessage: `Invalid axis mapping: Up axis (${axisMapping.meshUpAxis}) and Front axis (${axisMapping.meshFrontAxis}) must be orthogonal.`,
      productionTruth: false,
    };
    return { status: "INVALID_AXIS_MAPPING", diagnostic };
  }

  const vUp = parseSignedAxis(axisMapping.meshUpAxis);
  const vFront = parseSignedAxis(axisMapping.meshFrontAxis);

  // Deriving Engineering Right (+X) = Front (+Y) x Up (+Z)
  const vRight = new THREE.Vector3().crossVectors(vFront, vUp).normalize();

  // Rotation Matrix R_axis mapping (vRight -> +X, vFront -> +Y, vUp -> +Z)
  // R = [ vRight^T ; vFront^T ; vUp^T ]
  const rMat = new THREE.Matrix4();
  rMat.set(
    vRight.x, vRight.y, vRight.z, 0,
    vFront.x, vFront.y, vFront.z, 0,
    vUp.x,    vUp.y,    vUp.z,    0,
    0,        0,        0,        1
  );

  // Calculate rotated bounds of the 8 corners of raw bounds
  const minVec = new THREE.Vector3(rawBounds.min.x, rawBounds.min.y, rawBounds.min.z);
  const maxVec = new THREE.Vector3(rawBounds.max.x, rawBounds.max.y, rawBounds.max.z);

  const corners: THREE.Vector3[] = [
    new THREE.Vector3(minVec.x, minVec.y, minVec.z),
    new THREE.Vector3(minVec.x, minVec.y, maxVec.z),
    new THREE.Vector3(minVec.x, maxVec.y, minVec.z),
    new THREE.Vector3(minVec.x, maxVec.y, maxVec.z),
    new THREE.Vector3(maxVec.x, minVec.y, minVec.z),
    new THREE.Vector3(maxVec.x, minVec.y, maxVec.z),
    new THREE.Vector3(maxVec.x, maxVec.y, minVec.z),
    new THREE.Vector3(maxVec.x, maxVec.y, maxVec.z),
  ];

  const rotatedMin = new THREE.Vector3(Infinity, Infinity, Infinity);
  const rotatedMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  corners.forEach((c) => {
    c.applyMatrix4(rMat);
    rotatedMin.min(c);
    rotatedMax.max(c);
  });

  const rotatedCenter = new THREE.Vector3()
    .addVectors(rotatedMin, rotatedMax)
    .multiplyScalar(0.5);

  const rotatedSize = new THREE.Vector3().subVectors(rotatedMax, rotatedMin);

  // Calculate translation required for originMode
  const translation = new THREE.Vector3(0, 0, 0);
  if (originMode === "bottom_center") {
    translation.set(-rotatedCenter.x, -rotatedCenter.y, -rotatedMin.z);
  } else if (originMode === "center") {
    translation.set(-rotatedCenter.x, -rotatedCenter.y, -rotatedCenter.z);
  } else if (originMode === "raw") {
    translation.set(0, 0, 0);
  }

  // Construct full normalization matrix M_normalize = T * R
  const tMat = new THREE.Matrix4().makeTranslation(translation.x, translation.y, translation.z);
  const normalizationMatrix = new THREE.Matrix4().multiplyMatrices(tMat, rMat);

  // Extract Euler rotation in degrees (XYZ order)
  const euler = new THREE.Euler().setFromRotationMatrix(rMat, "XYZ");
  const rotationEulerDeg: Vector3D = {
    x: Math.round(THREE.MathUtils.radToDeg(euler.x) * 100) / 100,
    y: Math.round(THREE.MathUtils.radToDeg(euler.y) * 100) / 100,
    z: Math.round(THREE.MathUtils.radToDeg(euler.z) * 100) / 100,
  };

  // Normalized bounds after applying full normalizationMatrix
  const finalMin = new THREE.Vector3().addVectors(rotatedMin, translation);
  const finalMax = new THREE.Vector3().addVectors(rotatedMax, translation);
  const finalCenter = new THREE.Vector3().addVectors(rotatedCenter, translation);

  const normalizedBounds: MeshBounds = {
    min: { x: finalMin.x, y: finalMin.y, z: finalMin.z },
    max: { x: finalMax.x, y: finalMax.y, z: finalMax.z },
    center: { x: finalCenter.x, y: finalCenter.y, z: finalCenter.z },
    size: { x: rotatedSize.x, y: rotatedSize.y, z: rotatedSize.z },
    boundingRadius: rawBounds.boundingRadius,
    meshCount: rawBounds.meshCount,
    vertexCount: rawBounds.vertexCount,
    triangleCount: rawBounds.triangleCount,
  };

  const transform: MeshNormalizationTransform = {
    artifactId,
    partId,
    bounds: rawBounds,
    axisMapping,
    originMode,
    originTranslation: { x: translation.x, y: translation.y, z: translation.z },
    rotationEulerDeg,
    normalizationMatrix: normalizationMatrix.toArray(),
    confidence: 1.0,
    productionTruth: false,
  };

  const diagnostic: MeshAlignmentDiagnostic = {
    artifactId,
    partId,
    status: "NORMALIZED",
    rawBounds,
    normalizedBounds,
    transform,
    productionTruth: false,
  };

  return {
    status: "NORMALIZED",
    diagnostic,
    matrix: normalizationMatrix,
  };
}
