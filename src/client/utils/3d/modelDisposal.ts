import * as THREE from "three";

/**
 * Ensures complete disposal of Three.js objects, geometries, materials, and textures
 * to prevent GPU and WebGL memory leaks.
 */
export function disposeHierarchy(root: THREE.Object3D): void {
  if (!root) return;

  const texturesToDispose = new Set<THREE.Texture>();
  const materialsToDispose = new Set<THREE.Material>();
  const geometriesToDispose = new Set<THREE.BufferGeometry>();

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      if (mesh.geometry) {
        geometriesToDispose.add(mesh.geometry);
      }

      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mat) => {
          if (mat) {
            materialsToDispose.add(mat);

            // Collect all textures attached to this material
            for (const key of Object.keys(mat)) {
              const value = (mat as any)[key];
              if (value && value.isTexture) {
                texturesToDispose.add(value);
              }
            }
          }
        });
      }
    }
  });

  // Dispose textures first
  texturesToDispose.forEach((texture) => {
    try {
      texture.dispose();
    } catch {
      // Ignore cleanup error
    }
  });

  // Dispose materials
  materialsToDispose.forEach((material) => {
    try {
      material.dispose();
    } catch {
      // Ignore cleanup error
    }
  });

  // Dispose geometries
  geometriesToDispose.forEach((geometry) => {
    try {
      geometry.dispose();
    } catch {
      // Ignore cleanup error
    }
  });

  // Remove from parent
  if (root.parent) {
    root.parent.remove(root);
  }

  // Clear children array
  while (root.children.length > 0) {
    const child = root.children[0];
    root.remove(child);
  }
}
