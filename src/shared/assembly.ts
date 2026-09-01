import { z } from "zod";
import {
  ComponentShapeSchema,
  ComponentRotationSchema,
  ComponentProfilesSchema,
  CadProfileCommandSchema,
  ShapeProfilePointSchema,
  LoftSectionSchema,
  SoftSurfaceParamsSchema,
} from "./fes.js";

export const AssemblyComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  material: z.string(),
  geometryMode: z.enum(["box", "soft_surface", "loft_shell", "mesh_reference"]).optional().default("box"),
  loftGroup: z.string().optional(),
  softGroup: z.string().optional(),
  size: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  position: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  rotation: ComponentRotationSchema.optional(),
  profiles: ComponentProfilesSchema.optional(),
  explodeVector: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  explodeSource: z.enum(["excel", "generated_for_visualization"]),
  productionTruth: z.boolean(),
  shape: ComponentShapeSchema.optional(),
});

export const AssemblyGeometryDatasetSchema = z
  .object({
    cadProfiles: z.array(CadProfileCommandSchema).optional().default([]),
    shapeProfiles: z.array(ShapeProfilePointSchema).optional().default([]),
    loftSections: z.array(LoftSectionSchema).optional().default([]),
    softSurfaceParams: z.array(SoftSurfaceParamsSchema).optional().default([]),
    topology2D: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  })
  .optional();

export const AssemblyDocumentSchema = z.object({
  version: z.literal("1.0"),
  sku: z.string(),
  units: z.literal("mm"),
  components: z.array(AssemblyComponentSchema),
  loftSections: z.array(LoftSectionSchema).optional().default([]),
  softSurfaceParams: z.array(SoftSurfaceParamsSchema).optional().default([]),
  geometry: AssemblyGeometryDatasetSchema,
});

export type AssemblyComponent = z.infer<typeof AssemblyComponentSchema>;
export type AssemblyDocument = z.infer<typeof AssemblyDocumentSchema>;
