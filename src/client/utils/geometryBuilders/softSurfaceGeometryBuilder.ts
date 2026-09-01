import * as THREE from "three";
import type { SoftSurfaceParams } from "../../../shared/fes.js";
import { applySeamDisplacement } from "./seamGeometry.js";

/**
 * Builds Soft Surface 3D Geometries for Seats, Backrests, and Pillows with face-independent deformations.
 */
export function buildSoftSurfaceComponentGeometry(
  width: number,
  height: number,
  depth: number,
  componentId: string,
  params?: SoftSurfaceParams
): THREE.BufferGeometry {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const d = Math.max(1, depth);

  const compId = componentId.toUpperCase();

  // 1. SEAT CUSHIONS (SEAT-1 / SEAT-2 / SEAT-3)
  if (compId.startsWith("SEAT")) {
    const geometry = new THREE.BoxGeometry(w, h, d, 24, 16, 24);
    const posAttr = geometry.getAttribute("position");

    const frontNoseBulge = params?.crownX ?? 0.12; // 0.08 - 0.14
    const frontLowerTuck = 0.06;

    for (let i = 0; i < posAttr.count; i++) {
      let x = posAttr.getX(i);
      let y = posAttr.getY(i);
      let z = posAttr.getZ(i);

      const u = x / (w / 2); // -1 to 1
      const v = y / (h / 2); // -1 to 1
      const wZ = z / (d / 2); // -1 to 1

      // Top Surface Soft Crown
      if (v > 0.4) {
        const topCrownFactor = Math.pow(Math.max(0, 1 - u * u), 1.5) * Math.pow(Math.max(0, 1 - wZ * wZ), 1.5);
        y += h * 0.08 * topCrownFactor;
      }

      // Front Face Nose Bulge & Lower Tuck
      if (wZ > 0.4) {
        const frontBulgeFactor = Math.pow(Math.max(0, 1 - u * u), 1.5) * Math.pow(Math.max(0, 1 - v * v), 1.5);
        z += d * frontNoseBulge * frontBulgeFactor;

        if (v < -0.3) {
          z -= d * frontLowerTuck * Math.abs(v);
        }
      }

      // Side Compression & Corner Softening
      const corner = Math.max(0, Math.abs(u) - 0.7) / 0.3;
      if (corner > 0) {
        x -= Math.sign(x) * w * 0.05 * Math.pow(corner, 2);
      }

      posAttr.setXYZ(i, x, y, z);
    }

    posAttr.needsUpdate = true;
    applySeamDisplacement(geometry, 0.85, 4.0);
    geometry.computeVertexNormals();
    return geometry;
  }

  // 2. BACKREST CUSHIONS (BACK-1 / BACK-2 / BACK-3)
  if (compId.startsWith("BACK")) {
    const geometry = new THREE.BoxGeometry(w, h, d, 20, 24, 20);
    const posAttr = geometry.getAttribute("position");

    for (let i = 0; i < posAttr.count; i++) {
      let x = posAttr.getX(i);
      let y = posAttr.getY(i);
      let z = posAttr.getZ(i);

      const u = x / (w / 2); // -1 to 1
      const v = y / (h / 2); // -1 to 1
      const tY = (v + 1) / 2; // 0 at bottom, 1 at top

      // Thickness Gradient along Z: thickness = baseThickness * (0.88 + 0.12 * sin(PI * tY))
      const thicknessFactor = 0.88 + 0.12 * Math.sin(Math.PI * tY);
      z *= thicknessFactor;

      // Center Bulge
      const bulgeFactor = Math.pow(Math.max(0, 1 - u * u), 1.5) * Math.sin(Math.PI * tY);
      z += Math.sign(z || 1) * d * 0.09 * bulgeFactor;

      // Top Crown Wave
      if (v > 0.6) {
        y += h * 0.05 * Math.pow(Math.max(0, 1 - u * u), 1.5);
      }

      posAttr.setXYZ(i, x, y, z);
    }

    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  // 3. LUMBAR PILLOWS (PILLOW-1 / PILLOW-2)
  if (compId.startsWith("PILLOW")) {
    const geometry = new THREE.BoxGeometry(w, h, d, 24, 16, 16);
    const posAttr = geometry.getAttribute("position");

    for (let i = 0; i < posAttr.count; i++) {
      let x = posAttr.getX(i);
      let y = posAttr.getY(i);
      let z = posAttr.getZ(i);

      const u = x / (w / 2); // -1 to 1
      const v = y / (h / 2); // -1 to 1
      const wZ = z / (d / 2); // -1 to 1

      // Retain wide flat soft rectangular footprint (width / height > 3)
      const crownFactorU = Math.pow(Math.max(0, 1 - u * u), 1.5);
      const crownFactorV = Math.pow(Math.max(0, 1 - v * v), 1.5);

      // Soft front/back crown
      if (Math.abs(wZ) > 0.3) {
        z += Math.sign(z) * d * 0.12 * crownFactorU * crownFactorV;
      }

      // Soft edge rounding that preserves rectangular box aspect ratio
      const cornerU = Math.max(0, Math.abs(u) - 0.75) / 0.25;
      const cornerV = Math.max(0, Math.abs(v) - 0.75) / 0.25;

      if (cornerU > 0 || cornerV > 0) {
        x -= Math.sign(x) * w * 0.04 * cornerU * (cornerV + 1);
        y -= Math.sign(y) * h * 0.04 * cornerV * (cornerU + 1);
      }

      posAttr.setXYZ(i, x, y, z);
    }

    posAttr.needsUpdate = true;
    applySeamDisplacement(geometry, 0.5, 3.0);
    geometry.computeVertexNormals();
    return geometry;
  }

  // Default Box Fallback
  const fallbackGeom = new THREE.BoxGeometry(w, h, d, 8, 8, 8);
  fallbackGeom.computeVertexNormals();
  return fallbackGeom;
}
