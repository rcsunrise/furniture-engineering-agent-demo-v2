import { z } from "zod";

export const GeometrySourceEnum = z.enum([
  "workbook_profile",
  "workbook_loft",
  "workbook_soft_surface",
  "procedural_default",
  "built_in_registry",
  "box_geometry",
  "proxy_fallback",
  "ai_reference_mesh",
]);

export type GeometrySource = z.infer<typeof GeometrySourceEnum>;
