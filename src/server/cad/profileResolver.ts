import type { ComponentObservation } from "../../shared/fes.js";
import type { ComponentCadPathResult } from "../../shared/shapeRegistry.js";
import { ShapeRegistry } from "../../shared/shapeRegistry.js";
import { buildArmrestWires, buildSeatWires, buildPillowWires, buildBackrestWires, type ComponentWirePath } from "./wireBuilder.js";
import type { Point2D } from "./curveFitter.js";

/**
 * Resolves multi-layer CAD paths for a given component in a given CAD view.
 */
export function resolveComponentCadWires(
  component: ComponentObservation,
  cadProfiles: any[],
  shapeProfiles: any[],
  view: "front" | "side" | "top"
): { paths: ComponentWirePath[]; geometrySource: string; fallback: boolean; matchedProfileId?: string } {
  const compId = component.id.toUpperCase();
  const rawResults: ComponentCadPathResult[] = ShapeRegistry.buildCadPathsForComponent(
    component,
    cadProfiles,
    shapeProfiles,
    view
  );

  if (!rawResults || rawResults.length === 0) {
    return {
      paths: [],
      geometrySource: "box_geometry",
      fallback: false,
    };
  }

  const firstRes = rawResults[0];
  const geometrySource = firstRes.geometrySource || (firstRes.profileFallback ? "proxy_fallback" : "workbook_profile");
  const fallback = firstRes.profileFallback ?? false;
  const matchedProfileId = firstRes.matchedProfileId;

  // Extract outer path points from first result commands
  const outerPoints: Point2D[] = [];
  for (const cmd of firstRes.commands) {
    if (cmd.type === "moveTo" || cmd.type === "lineTo" || cmd.type === "cubicTo" || cmd.type === "quadraticTo") {
      outerPoints.push({ x: cmd.x, y: cmd.y });
    }
  }

  let wirePaths: ComponentWirePath[] = [];

  if (compId.startsWith("ARM")) {
    wirePaths = buildArmrestWires(outerPoints, view);
  } else if (compId.startsWith("SEAT")) {
    wirePaths = buildSeatWires(outerPoints, view);
  } else if (compId.startsWith("PILLOW")) {
    wirePaths = buildPillowWires(outerPoints);
  } else if (compId.startsWith("BACK")) {
    wirePaths = buildBackrestWires(outerPoints, view);
  } else {
    // Structural frame/leg/base fallback to standard single or multi-wire
    wirePaths = rawResults.map((r) => ({
      role: (r.pathRole as any) || "outer",
      layer: r.layer,
      commands: r.commands,
      matchedProfileId: r.matchedProfileId,
      geometrySource: r.geometrySource,
    }));
  }

  // Attach metadata
  wirePaths.forEach((w) => {
    if (!w.matchedProfileId) w.matchedProfileId = matchedProfileId;
    if (!w.geometrySource) w.geometrySource = geometrySource;
  });

  return {
    paths: wirePaths,
    geometrySource,
    fallback,
    matchedProfileId,
  };
}
