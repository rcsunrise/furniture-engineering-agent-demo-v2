import * as THREE from "three";

/**
 * Deterministic X-axis mirror helper for right-side armrests (ARM-R).
 * Mirrors 2D/3D geometry along the X-axis while ensuring proper face winding & vertex normal calculation.
 */
export function mirrorProfileX(points: THREE.Vector2[]): THREE.Vector2[] {
  if (!points) return [];
  // Mirror X: x -> 1 - x (for normalized [0,1] domain)
  const mirrored = points.map((p) => new THREE.Vector2(1.0 - p.x, p.y));
  // Reverse array to maintain counter-clockwise face winding
  return mirrored.reverse();
}

/**
 * Mirrors a BufferGeometry along the X-axis in place and recomputes normals.
 */
export function mirrorBufferGeometryX(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.scale(-1, 1, 1);
  // Invert index buffer winding so backfaces don't become frontfaces
  const index = geometry.getIndex();
  if (index) {
    const array = index.array;
    for (let i = 0; i < array.length; i += 3) {
      const tmp = array[i + 1];
      array[i + 1] = array[i + 2];
      array[i + 2] = tmp;
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}
