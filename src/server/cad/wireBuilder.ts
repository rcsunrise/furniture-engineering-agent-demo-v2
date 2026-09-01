import type { CadLineRole, PathCommand } from "../../shared/cad.js";
import { fitSmoothCurve, generateInsetPathPoints, type Point2D } from "./curveFitter.js";

export interface ComponentWirePath {
  role: CadLineRole;
  layer: string;
  commands: PathCommand[];
  matchedProfileId?: string;
  geometrySource?: string;
}

/**
 * Multi-layer wire generator for Armrests (ARM-L / ARM-R).
 * Generates: outer contour, derived inner contour, and continuous piping.
 */
export function buildArmrestWires(
  outerPoints: Point2D[],
  view: "front" | "side" | "top"
): ComponentWirePath[] {
  if (!outerPoints || outerPoints.length < 3) return [];

  const wires: ComponentWirePath[] = [];

  // 1. Outer Contour
  wires.push({
    role: "outer",
    layer: "COMPONENT_OUTLINE",
    commands: fitSmoothCurve(outerPoints, true, 0.4),
  });

  // 2. Derived Inner Contour (controlled top/inner/bottom insets)
  const topInset = view === "front" ? 25 : 20;
  const bottomInset = view === "front" ? 15 : 12;
  const innerPoints = generateInsetPathPoints(outerPoints, 25, topInset, bottomInset);

  wires.push({
    role: "inner",
    layer: "INNER_CONTOUR",
    commands: fitSmoothCurve(innerPoints, true, 0.4),
  });

  // 3. Piping Contour (continuous 12mm inset line)
  const pipingPoints = generateInsetPathPoints(outerPoints, 14);
  wires.push({
    role: "piping",
    layer: "PIPING",
    commands: fitSmoothCurve(pipingPoints, true, 0.4),
  });

  return wires;
}

/**
 * Multi-layer wire generator for Seat Cushions (SEAT-1 / SEAT-2 / SEAT-3).
 * Generates: outer contour, top seam wire, and lower front edge wire.
 */
export function buildSeatWires(
  outerPoints: Point2D[],
  view: "front" | "side" | "top"
): ComponentWirePath[] {
  if (!outerPoints || outerPoints.length < 3) return [];

  const wires: ComponentWirePath[] = [];

  // 1. Outer Contour
  wires.push({
    role: "outer",
    layer: "COMPONENT_OUTLINE",
    commands: fitSmoothCurve(outerPoints, true, 0.3),
  });

  // 2. Piping / Top Seam Wire
  const pipingPoints = generateInsetPathPoints(outerPoints, 12);
  wires.push({
    role: "piping",
    layer: "PIPING",
    commands: fitSmoothCurve(pipingPoints, true, 0.3),
  });

  // 3. Structural Split / Lower Front Edge Wire
  const minY = Math.min(...outerPoints.map((p) => p.y));
  const maxY = Math.max(...outerPoints.map((p) => p.y));
  const minX = Math.min(...outerPoints.map((p) => p.x));
  const maxX = Math.max(...outerPoints.map((p) => p.x));

  if (view === "front" || view === "side") {
    const lowerY = minY + (maxY - minY) * 0.22;
    const lowerEdgePoints: Point2D[] = [
      { x: minX + 15, y: lowerY },
      { x: (minX + maxX) / 2, y: lowerY - 5 },
      { x: maxX - 15, y: lowerY },
    ];
    wires.push({
      role: "structural",
      layer: "MODULE_DIVIDER",
      commands: fitSmoothCurve(lowerEdgePoints, false, 0.2),
    });
  }

  return wires;
}

/**
 * Multi-layer wire generator for Lumbar Pillows (PILLOW-1 / PILLOW-2).
 * Generates: outer contour, piping contour with aspect ratio width/height ≈ 3.8.
 */
export function buildPillowWires(
  outerPoints: Point2D[]
): ComponentWirePath[] {
  if (!outerPoints || outerPoints.length < 3) return [];

  const wires: ComponentWirePath[] = [];

  // 1. Outer Contour
  wires.push({
    role: "outer",
    layer: "COMPONENT_OUTLINE",
    commands: fitSmoothCurve(outerPoints, true, 0.4),
  });

  // 2. Piping Contour
  const pipingPoints = generateInsetPathPoints(outerPoints, 10);
  wires.push({
    role: "piping",
    layer: "PIPING",
    commands: fitSmoothCurve(pipingPoints, true, 0.4),
  });

  return wires;
}

/**
 * Multi-layer wire generator for Backrest Cushions (BACK-1 / BACK-2 / BACK-3).
 * Generates: outer contour with soft organic crown wave, lower seam wire, and top seam wire.
 */
export function buildBackrestWires(
  outerPoints: Point2D[],
  view: "front" | "side" | "top"
): ComponentWirePath[] {
  if (!outerPoints || outerPoints.length < 3) return [];

  const wires: ComponentWirePath[] = [];

  // Add subtle center rise / wave to top of backrest in front view
  const modifiedOuter: Point2D[] = outerPoints.map((p) => ({ ...p }));
  if (view === "front") {
    const maxY = Math.max(...outerPoints.map((p) => p.y));
    const minX = Math.min(...outerPoints.map((p) => p.x));
    const maxX = Math.max(...outerPoints.map((p) => p.x));
    const width = maxX - minX || 1;

    for (const p of modifiedOuter) {
      if (p.y > maxY - 40) {
        const u = (p.x - minX) / width;
        const wave = Math.sin(u * Math.PI) * 12; // 12mm subtle center rise
        p.y += wave;
      }
    }
  }

  // 1. Outer Contour
  wires.push({
    role: "outer",
    layer: "COMPONENT_OUTLINE",
    commands: fitSmoothCurve(modifiedOuter, true, 0.35),
  });

  // 2. Seam & Piping Wires
  const pipingPoints = generateInsetPathPoints(modifiedOuter, 14);
  wires.push({
    role: "piping",
    layer: "PIPING",
    commands: fitSmoothCurve(pipingPoints, true, 0.35),
  });

  if (view === "front" || view === "side") {
    const minY = Math.min(...modifiedOuter.map((p) => p.y));
    const maxY = Math.max(...modifiedOuter.map((p) => p.y));
    const minX = Math.min(...modifiedOuter.map((p) => p.x));
    const maxX = Math.max(...modifiedOuter.map((p) => p.x));

    const lowerY = minY + (maxY - minY) * 0.18;
    const seamPoints: Point2D[] = [
      { x: minX + 20, y: lowerY },
      { x: (minX + maxX) / 2, y: lowerY + 4 },
      { x: maxX - 20, y: lowerY },
    ];
    wires.push({
      role: "seam",
      layer: "SEAM",
      commands: fitSmoothCurve(seamPoints, false, 0.2),
    });
  }

  return wires;
}
