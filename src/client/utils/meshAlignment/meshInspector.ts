import * as THREE from "three";
import { MeshBounds } from "../../../shared/meshAlignment";

/**
 * Inspects a Three.js Object3D without mutating it.
 * Computes bounding box, center, size, sphere radius, mesh count, vertex count, and triangle count.
 */
export function inspectMesh(object: THREE.Object3D): MeshBounds {
  // Ensure matrices are updated for accurate local/world bounding box calculation
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object);

  // If object has no geometry or empty box, fallback to zero box
  if (box.isEmpty()) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
      center: { x: 0, y: 0, z: 0 },
      size: { x: 0, y: 0, z: 0 },
      boundingRadius: 0,
      meshCount: 0,
      vertexCount: 0,
      triangleCount: 0,
    };
  }

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);

  let meshCount = 0;
  let vertexCount = 0;
  let triangleCount = 0;

  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      meshCount++;
      const mesh = child as THREE.Mesh;
      const geom = mesh.geometry;
      if (geom) {
        if (geom.index) {
          triangleCount += Math.floor(geom.index.count / 3);
        } else if (geom.attributes.position) {
          triangleCount += Math.floor(geom.attributes.position.count / 3);
        }

        if (geom.attributes.position) {
          vertexCount += geom.attributes.position.count;
        }
      }
    }
  });

  return {
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
    center: { x: center.x, y: center.y, z: center.z },
    size: { x: size.x, y: size.y, z: size.z },
    boundingRadius: sphere.radius,
    meshCount,
    vertexCount,
    triangleCount,
  };
}
