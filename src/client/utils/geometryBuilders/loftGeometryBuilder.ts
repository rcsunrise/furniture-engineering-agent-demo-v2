import * as THREE from "three";
import type { LoftSection, CadProfileCommand } from "../../../shared/fes.js";
import { resampleClosedProfile } from "./profileResampler.js";
import { mirrorBufferGeometryX } from "./profileMirror.ts";

export interface LoftSectionRuntime {
  sectionT: number;
  widthScale: number;
  heightScale: number;
  innerScale?: number;
  outerScale?: number;
  innerOffset?: number;
  outerOffset?: number;
  topOffset?: number;
  bottomOffset?: number;
  sectionRotation?: number;
  bulge?: number;
}

/**
 * Builds continuous Asymmetric Loft Shell 3D Geometry for Armrests.
 * Resamples all section profiles to 64 vertices per section, applies asymmetric inner/outer scale,
 * and builds smooth continuous quad mesh with computeVertexNormals().
 */
export function buildAsymmetricLoftGeometry(
  width: number,
  height: number,
  depth: number,
  sections: LoftSection[] = [],
  componentId: string = "ARM-L-OUT"
): THREE.BufferGeometry {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const d = Math.max(1, depth);

  const isRightArm =
    componentId.toUpperCase().endsWith("-R") ||
    componentId.toUpperCase().includes("RIGHT") ||
    componentId.toUpperCase().includes("ARM-R");

  // Filter sections for this group or build default 5-stage sections
  let runtimeSections: LoftSectionRuntime[] = [];

  if (sections.length >= 2) {
    runtimeSections = sections.map((s) => ({
      sectionT: s.sectionT,
      widthScale: s.widthScale,
      heightScale: s.heightScale,
      innerScale: (s as any).innerScale,
      outerScale: (s as any).outerScale,
      innerOffset: (s as any).innerOffset,
      outerOffset: (s as any).outerOffset,
      topOffset: (s as any).topOffset,
      bottomOffset: (s as any).bottomOffset,
      sectionRotation: s.sectionRotation,
      bulge: s.bulge,
    }));
  } else {
    // Default 5-stage section profile along arm depth (t from 0 to 1)
    const tValues = [0.0, 0.25, 0.5, 0.75, 1.0];
    runtimeSections = tValues.map((t) => {
      const centerInfluence = Math.sin(Math.PI * t);
      return {
        sectionT: t,
        widthScale: 0.85 + 0.25 * centerInfluence,
        heightScale: 0.88 + 0.18 * centerInfluence,
        innerScale: THREE.MathUtils.lerp(0.90, 0.78, centerInfluence),
        outerScale: THREE.MathUtils.lerp(0.96, 1.10, centerInfluence),
        bulge: 0.08 * centerInfluence,
      };
    });
  }

  // Generate base 2D profile (64 resampled vertices)
  const baseProfile2D: THREE.Vector2[] = [];
  const numVertsPerSection = 64;
  for (let i = 0; i < numVertsPerSection; i++) {
    const angle = (i / numVertsPerSection) * Math.PI * 2;
    baseProfile2D.push(new THREE.Vector2(0.5 * Math.cos(angle), 0.5 * Math.sin(angle)));
  }

  const resampledBase = resampleClosedProfile(baseProfile2D, numVertsPerSection);

  const positions: number[] = [];
  const indices: number[] = [];

  // Generate 3D vertex rings for each section along depth Y axis
  for (let sIdx = 0; sIdx < runtimeSections.length; sIdx++) {
    const sec = runtimeSections[sIdx];
    const yPos = (sec.sectionT - 0.5) * d;

    const centerInfluence = Math.sin(Math.PI * sec.sectionT);
    const innerScale = sec.innerScale ?? THREE.MathUtils.lerp(0.90, 0.78, centerInfluence);
    const outerScale = sec.outerScale ?? THREE.MathUtils.lerp(0.96, 1.10, centerInfluence);

    for (let vIdx = 0; vIdx < numVertsPerSection; vIdx++) {
      const p = resampledBase[vIdx];

      // Asymmetric X scaling (outer vs inner)
      const isOuter = p.x < 0;
      const xFactor = isOuter ? outerScale : innerScale;

      let x = p.x * w * sec.widthScale * xFactor;
      let z = p.y * h * sec.heightScale;

      if (sec.bulge) {
        x += Math.sign(x) * sec.bulge * w;
      }

      positions.push(x, yPos, z);
    }
  }

  // Build quad faces connecting consecutive section rings
  const numSections = runtimeSections.length;
  for (let s = 0; s < numSections - 1; s++) {
    const r1 = s * numVertsPerSection;
    const r2 = (s + 1) * numVertsPerSection;

    for (let i = 0; i < numVertsPerSection; i++) {
      const nextI = (i + 1) % numVertsPerSection;

      const a = r1 + i;
      const b = r1 + nextI;
      const c = r2 + nextI;
      const dIdx = r2 + i;

      indices.push(a, b, c);
      indices.push(a, c, dIdx);
    }
  }

  // Build Front and Back End Caps (Front cap at section 0, Back cap at section N-1)
  const buildCap = (secIndex: number, reverse: boolean) => {
    const baseIndex = secIndex * numVertsPerSection;
    const centerVertIdx = positions.length / 3;

    // Add center vertex for fan triangulation
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < numVertsPerSection; i++) {
      cx += positions[(baseIndex + i) * 3];
      cy += positions[(baseIndex + i) * 3 + 1];
      cz += positions[(baseIndex + i) * 3 + 2];
    }
    cx /= numVertsPerSection;
    cy /= numVertsPerSection;
    cz /= numVertsPerSection;

    positions.push(cx, cy, cz);

    for (let i = 0; i < numVertsPerSection; i++) {
      const nextI = (i + 1) % numVertsPerSection;
      const v1 = baseIndex + i;
      const v2 = baseIndex + nextI;

      if (reverse) {
        indices.push(centerVertIdx, v2, v1);
      } else {
        indices.push(centerVertIdx, v1, v2);
      }
    }
  };

  buildCap(0, false);
  buildCap(numSections - 1, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  if (isRightArm) {
    return mirrorBufferGeometryX(geometry);
  }

  return geometry;
}
