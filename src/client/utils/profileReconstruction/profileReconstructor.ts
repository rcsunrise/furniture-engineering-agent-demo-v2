import * as THREE from "three";
import {
  ProfileReconstructionInput,
  ProfileReconstructionOutput,
  reconstructComponentProfiles,
  MeshVertex3D,
} from "../../../shared/profileReconstruction.js";
import { extractVerticesFromThreeGeometry } from "./meshProjection.js";

/**
 * Client-side orchestrator: takes Three.js geometry or mesh, extracts vertices,
 * and runs the deterministic profile reconstruction pipeline.
 */
export function reconstructProfilesFromThreeMesh(
  meshOrObject: THREE.Object3D | THREE.BufferGeometry,
  params: Omit<ProfileReconstructionInput, "meshVertices">
): ProfileReconstructionOutput {
  const meshVertices: MeshVertex3D[] = extractVerticesFromThreeGeometry(meshOrObject);
  return reconstructComponentProfiles({
    ...params,
    meshVertices,
  });
}

export { reconstructComponentProfiles };
