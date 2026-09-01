import type { FurnitureEngineeringData } from "../shared/fes.js";
import type { CadDocument } from "../shared/cad.js";
import { buildCadViewProjection } from "./cad/projectionBuilder.js";

/**
 * Deterministic CAD Geometry Builder for Multi-View (Front, Side, Top).
 * Delegates to modular Projection Builder pipeline.
 */
export function buildCadView(
  fes: FurnitureEngineeringData,
  view: "front" | "side" | "top" = "front"
): CadDocument {
  return buildCadViewProjection(fes, view);
}

export function buildFrontView(fes: FurnitureEngineeringData): CadDocument {
  return buildCadView(fes, "front");
}
