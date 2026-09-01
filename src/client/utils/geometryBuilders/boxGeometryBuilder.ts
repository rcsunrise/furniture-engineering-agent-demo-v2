import * as THREE from "three";

/**
 * Creates standard BoxGeometry for structural components (frame, base, legs, feet).
 */
export function buildBoxComponentGeometry(
  width: number,
  height: number,
  depth: number,
  segments: { widthSegs?: number; heightSegs?: number; depthSegs?: number } = {}
): THREE.BufferGeometry {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const d = Math.max(1, depth);

  const geometry = new THREE.BoxGeometry(
    w,
    h,
    d,
    segments.widthSegs ?? 4,
    segments.heightSegs ?? 4,
    segments.depthSegs ?? 4
  );

  geometry.computeVertexNormals();
  return geometry;
}
