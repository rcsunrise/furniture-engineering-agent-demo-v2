/**
 * G4-6D Canonical Editor Coordinate + Unit Contract
 *
 * Physical & Engineering Principles:
 * - Internal & Editor Unit: Strictly millimeters (mm).
 * - FES Engineering Coordinate System (CAD Truth):
 *   - X = Width (Left / Right)
 *   - Y = Depth (Front / Back, Ground Y plane)
 *   - Z = Height (Vertical Elevation, Ground at Z = 0)
 *
 * - Three.js WebGL Coordinate System (Renderer World):
 *   - X = Width (Left / Right)
 *   - Y = Height (Vertical Elevation, Ground Grid at Y = 0)
 *   - Z = Depth (Front / Back)
 *
 * Direct Transformation Relationship:
 *   - FES Width  (X) <===> Three.js X
 *   - FES Depth  (Y) <===> Three.js Z
 *   - FES Height (Z) <===> Three.js Y
 */

export const EDITOR_WORLD_UNIT = "mm" as const;

export type OriginPolicy = "bottom_center" | "geometric_center" | "source_origin";

export interface CanonicalCoordinateProvenance {
  sourceUnit: "mm" | "cm" | "m" | "inch";
  sourceUp: "Y_UP" | "Z_UP";
  editorUnit: "mm";
  scaleFactor: number;
  originPolicy: OriginPolicy;
  convertedAt: string;
}

export interface FesVec3 {
  x: number; // Width (mm)
  y: number; // Depth (mm)
  z: number; // Height (mm)
}

export interface ThreeVec3 {
  x: number; // X Width (mm)
  y: number; // Y Vertical Height (mm)
  z: number; // Z Horizontal Depth (mm)
}

/**
 * Converts Three.js measured bounding box size to FES Canonical dimensions.
 *
 * Three.js:
 *   size.x = Width
 *   size.y = Vertical Height
 *   size.z = Horizontal Depth
 *
 * FES Canonical:
 *   size.x = Width
 *   size.y = Depth
 *   size.z = Height
 */
export function threeToFesDimensions(threeSize: ThreeVec3): FesVec3 {
  return {
    x: Math.max(0, Number.isFinite(threeSize.x) ? threeSize.x : 0),
    y: Math.max(0, Number.isFinite(threeSize.z) ? threeSize.z : 0), // Three.js Z is Depth
    z: Math.max(0, Number.isFinite(threeSize.y) ? threeSize.y : 0), // Three.js Y is Height
  };
}

/**
 * Converts FES Canonical dimensions to Three.js world size.
 */
export function fesToThreeDimensions(fesSize: FesVec3): ThreeVec3 {
  return {
    x: Math.max(0, Number.isFinite(fesSize.x) ? fesSize.x : 0),
    y: Math.max(0, Number.isFinite(fesSize.z) ? fesSize.z : 0), // FES Z is Three.js Y (Height)
    z: Math.max(0, Number.isFinite(fesSize.y) ? fesSize.y : 0), // FES Y is Three.js Z (Depth)
  };
}

/**
 * Converts Three.js world position to FES Canonical position.
 * Ground elevation in Three.js is Y=0, in FES it is Z=0.
 */
export function threeToFesPosition(threePos: ThreeVec3): FesVec3 {
  return {
    x: Number.isFinite(threePos.x) ? threePos.x : 0,
    y: Number.isFinite(threePos.z) ? threePos.z : 0,
    z: Number.isFinite(threePos.y) ? threePos.y : 0,
  };
}

/**
 * Converts FES Canonical position to Three.js world position.
 */
export function fesToThreePosition(fesPos: FesVec3): ThreeVec3 {
  return {
    x: Number.isFinite(fesPos.x) ? fesPos.x : 0,
    y: Number.isFinite(fesPos.z) ? fesPos.z : 0,
    z: Number.isFinite(fesPos.y) ? fesPos.y : 0,
  };
}

/**
 * Normalizes Euler angles between Three.js (Y-up) and FES (Z-up) for comparison.
 */
export function threeToFesRotationDeg(threeEulerDeg: ThreeVec3): FesVec3 {
  return {
    x: threeEulerDeg.x,
    y: threeEulerDeg.z,
    z: threeEulerDeg.y,
  };
}
