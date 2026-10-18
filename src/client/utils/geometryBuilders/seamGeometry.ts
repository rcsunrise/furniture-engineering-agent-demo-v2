import * as THREE from "three";

export interface SeamConstraint {
  inset: number;
  pull: number;
  depth: number;
}

/**
 * Applies a subtle seam/piping indentation on a BufferGeometry near specified seam plane parameters.
 */
export function applySeamDisplacement(
  geometry: THREE.BufferGeometry,
  seamYRatio: number = 0.85,
  pullMm: number = 4.0
): void {
  const posAttr = geometry.getAttribute("position");
  if (!posAttr) return;

  const bbox = geometry.boundingBox || new THREE.Box3().setFromBufferAttribute(posAttr as THREE.BufferAttribute);
  const sizeY = bbox.max.y - bbox.min.y || 1;
  const targetY = bbox.min.y + sizeY * seamYRatio;

  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const distY = Math.abs(y - targetY);

    if (distY < 18) {
      const influence = Math.pow(1 - distY / 18, 2);
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);

      // Pull inward slightly toward mesh center
      posAttr.setX(i, x * (1 - (pullMm / 200) * influence));
      posAttr.setZ(i, z * (1 - (pullMm / 200) * influence));
    }
  }

  posAttr.needsUpdate = true;
  geometry.computeVertexNormals();
}
