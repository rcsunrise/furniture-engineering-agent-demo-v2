import * as THREE from "three";
import { MeshVertex3D, ProfilePoint2D, projectVerticesToView } from "../../../shared/profileReconstruction.js";
import { ProjectionView, CANONICAL_PROJECTION_AXES } from "../../../shared/geometryEvaluation.js";

/**
 * Extracts 3D vertices from a Three.js BufferGeometry or Object3D.
 */
export function extractVerticesFromThreeGeometry(
  objectOrGeometry: THREE.Object3D | THREE.BufferGeometry,
  maxSamplePoints = 2000
): MeshVertex3D[] {
  const vertices: MeshVertex3D[] = [];

  const processGeometry = (geom: THREE.BufferGeometry, worldMatrix?: THREE.Matrix4) => {
    const posAttr = geom.attributes.position;
    if (!posAttr) return;

    const stride = Math.max(1, Math.floor(posAttr.count / maxSamplePoints));
    for (let i = 0; i < posAttr.count; i += stride) {
      const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
      if (worldMatrix) {
        v.applyMatrix4(worldMatrix);
      }
      vertices.push({ x: v.x, y: v.y, z: v.z });
    }
  };

  if (objectOrGeometry instanceof THREE.BufferGeometry) {
    processGeometry(objectOrGeometry);
  } else {
    objectOrGeometry.updateMatrixWorld(true);
    objectOrGeometry.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        processGeometry(child.geometry, child.matrixWorld);
      }
    });
  }

  return vertices;
}

/**
 * Projects Three.js geometry or raw 3D vertices onto FRONT, SIDE, or TOP orthographic plane.
 */
export function projectMeshToOrthographicPlane(
  source: THREE.Object3D | THREE.BufferGeometry | MeshVertex3D[],
  view: ProjectionView,
  alignmentMatrix?: THREE.Matrix4 | number[]
): ProfilePoint2D[] {
  let matrixArray: number[] | undefined;
  if (alignmentMatrix instanceof THREE.Matrix4) {
    matrixArray = alignmentMatrix.elements;
  } else if (Array.isArray(alignmentMatrix)) {
    matrixArray = alignmentMatrix;
  }

  const vertices = Array.isArray(source)
    ? source
    : extractVerticesFromThreeGeometry(source);

  return projectVerticesToView(vertices, view, matrixArray);
}
