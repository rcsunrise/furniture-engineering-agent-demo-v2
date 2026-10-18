import * as THREE from "three";
import type { AssemblyComponent } from "../../../shared/assembly.js";
import {
  validateComponentEngineering,
  type ComponentEngineeringValidation,
  type EngineeringValidationTolerance,
  normalizeEngineeringId,
} from "../../../shared/meshEngineeringValidation.js";
import {
  threeToFesDimensions,
  threeToFesPosition,
  threeToFesRotationDeg,
} from "../../../shared/canonicalCoordinateContract.js";

export interface ObjectEngineeringMeasurements {
  size: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  worldPosition: { x: number; y: number; z: number };
  rotationDeg: { x: number; y: number; z: number };
}

function radToDeg(value: number): number {
  return value * 180 / Math.PI;
}

export function measureObjectForEngineering(object: THREE.Object3D): ObjectEngineeringMeasurements {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const worldPosition = object.getWorldPosition(new THREE.Vector3());
  const worldQuaternion = object.getWorldQuaternion(new THREE.Quaternion());
  const euler = new THREE.Euler().setFromQuaternion(worldQuaternion, "XYZ");

  return {
    size: { x: size.x, y: size.y, z: size.z },
    center: { x: center.x, y: center.y, z: center.z },
    worldPosition: { x: worldPosition.x, y: worldPosition.y, z: worldPosition.z },
    rotationDeg: { x: radToDeg(euler.x), y: radToDeg(euler.y), z: radToDeg(euler.z) },
  };
}

export function validateObjectAgainstComponent(
  object: THREE.Object3D,
  component: AssemblyComponent,
  tolerance?: EngineeringValidationTolerance,
): ComponentEngineeringValidation {
  const m = measureObjectForEngineering(object);

  // Check if object is already in FES Z-up space or standard Three.js Y-up world
  const isAlreadyFesUp = object.userData?.canonicalCoordinates?.targetUp === "FES" ||
    object.userData?.targetUp === "FES" ||
    object.name?.includes("CoordinateAdapter_");

  const fesDimensions = isAlreadyFesUp ? m.size : threeToFesDimensions(m.size);
  const fesPosition = isAlreadyFesUp ? m.worldPosition : threeToFesPosition(m.worldPosition);
  const fesRotation = isAlreadyFesUp ? m.rotationDeg : threeToFesRotationDeg(m.rotationDeg);

  return validateComponentEngineering({
    componentId: component.id,
    objectName: object.name || object.uuid,
    targetSize: component.size,
    actualSize: fesDimensions,
    targetPosition: component.position,
    actualPosition: fesPosition,
    targetRotationDeg: component.rotation || { x: 0, y: 0, z: 0 },
    actualRotationDeg: fesRotation,
    tolerance,
  });
}

export function findBestExactComponentMatch(object: THREE.Object3D, components: AssemblyComponent[]): AssemblyComponent | null {
  const candidates = [
    object.userData?.canonicalComponentId,
    object.userData?.partId,
    object.name,
  ].filter(Boolean).map((v) => normalizeEngineeringId(String(v)));

  if (candidates.length === 0) return null;

  for (const comp of components) {
    const compCandidates = [comp.id, comp.name].filter(Boolean).map((v) => normalizeEngineeringId(String(v)));
    if (candidates.some((candidate) => compCandidates.includes(candidate))) return comp;
  }
  return null;
}
