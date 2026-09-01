import type { PathCommand } from "../../shared/cad.js";

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Fits a smooth Catmull-Rom spline through a set of points and converts to cubic Bezier commands for CAD/ThorVG rendering.
 */
export function fitSmoothCurve(
  points: Point2D[],
  closed = true,
  tension = 0.5
): PathCommand[] {
  if (!points || points.length === 0) return [];
  if (points.length < 3) {
    const commands: PathCommand[] = [{ type: "moveTo", x: points[0].x, y: points[0].y }];
    for (let i = 1; i < points.length; i++) {
      commands.push({ type: "lineTo", x: points[i].x, y: points[i].y });
    }
    if (closed) commands.push({ type: "close" });
    return commands;
  }

  const n = points.length;
  const pts: Point2D[] = [...points];

  if (closed) {
    pts.unshift(points[n - 1]);
    pts.push(points[0]);
    pts.push(points[1]);
  } else {
    pts.unshift(points[0]);
    pts.push(points[n - 1]);
  }

  const commands: PathCommand[] = [{ type: "moveTo", x: points[0].x, y: points[0].y }];

  for (let i = 1; i < (closed ? n + 1 : n); i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];

    const cp1x = p1.x + ((p2.x - p0.x) / 6) * (1 - tension);
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * (1 - tension);

    const cp2x = p2.x - ((p3.x - p1.x) / 6) * (1 - tension);
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * (1 - tension);

    commands.push({
      type: "cubicTo",
      cp1x,
      cp1y,
      cp2x,
      cp2y,
      x: p2.x,
      y: p2.y,
    });
  }

  if (closed) {
    commands.push({ type: "close" });
  }

  return commands;
}

/**
 * Generates an inset (or offset) polygon path for piping or inner contour generation.
 */
export function generateInsetPathPoints(
  points: Point2D[],
  insetMm: number,
  insetTopMm?: number,
  insetBottomMm?: number
): Point2D[] {
  if (points.length < 3) return points;

  // Calculate center centroid
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;

  const result: Point2D[] = [];
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const height = maxY - minY || 1;

  for (const p of points) {
    const tY = (p.y - minY) / height; // 0 at bottom, 1 at top
    let effectiveInset = insetMm;

    if (insetTopMm !== undefined || insetBottomMm !== undefined) {
      const topW = insetTopMm ?? insetMm;
      const botW = insetBottomMm ?? insetMm;
      effectiveInset = botW + (topW - botW) * tY;
    }

    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;

    const scale = Math.max(0.05, (len - effectiveInset) / len);
    result.push({
      x: cx + dx * scale,
      y: cy + dy * scale,
    });
  }

  return result;
}
