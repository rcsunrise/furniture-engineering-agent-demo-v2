import type { FurnitureEngineeringData } from "../../shared/fes.js";
import type { CadEntity } from "../../shared/cad.js";

/**
 * Builds structural seams, module division lines, and seam indicator lines across overall CAD views.
 */
export function buildStructuralSeams(
  fes: FurnitureEngineeringData,
  view: "front" | "side" | "top"
): CadEntity[] {
  const entities: CadEntity[] = [];

  // Seam line between Seat Modules (e.g., 3-seat split at 1/3 and 2/3 width)
  if (view === "front" || view === "top") {
    const seats = fes.components.filter((c) => c.id.toUpperCase().startsWith("SEAT"));
    if (seats.length > 1) {
      for (let i = 0; i < seats.length - 1; i++) {
        const s1 = seats[i];
        const s2 = seats[i + 1];
        const splitX = (s1.position.x + s2.position.x) / 2;

        const minY = view === "front" ? s1.position.z - s1.size.z / 2 : s1.position.y - s1.size.y / 2;
        const maxY = view === "front" ? s1.position.z + s1.size.z / 2 : s1.position.y + s1.size.y / 2;

        entities.push({
          type: "line",
          id: `structural:seam:seat-split:${i}:${view}`,
          layer: "MODULE_DIVIDER",
          x1: splitX,
          y1: minY,
          x2: splitX,
          y2: maxY,
        });
      }
    }
  }

  return entities;
}
