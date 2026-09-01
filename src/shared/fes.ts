import { z } from "zod";

export const ShapeProxyEnum = z.enum([
  "box",
  "rounded_box",
  "soft_cushion",
  "rounded_shell",
  "tapered_cushion",
  "arched_back",
  "pillow",
  "base",
  "cylinder",
  "sphere",
]);

export type ShapeProxyType = z.infer<typeof ShapeProxyEnum>;

export const ComponentTypeEnum = z.enum([
  "frame",
  "foam",
  "fabric",
  "hardware",
  "leg",
  "armrest",
  "backrest",
  "seat",
  "pillow",
  "base",
  "base_frame",
  "cushion",
  "cushion_seat",
  "cushion_back",
  "support",
  "panel",
  "structure",
  "other",
]);

export type ComponentType = z.infer<typeof ComponentTypeEnum>;

export const ComponentRotationSchema = z
  .object({
    x: z.number().default(0),
    y: z.number().default(0),
    z: z.number().default(0),
  })
  .default({ x: 0, y: 0, z: 0 });

export type ComponentRotation = z.infer<typeof ComponentRotationSchema>;

export const ComponentProfilesSchema = z
  .object({
    front: z.string().optional(),
    side: z.string().optional(),
    top: z.string().optional(),
    outer: z.string().optional(),
    inner: z.string().optional(),
    seam: z.string().optional(),
  })
  .optional();

export type ComponentProfiles = z.infer<typeof ComponentProfilesSchema>;

export const ComponentShapeSchema = z.object({
  proxy: ShapeProxyEnum.default("box"),
  shapeRef: z.string().optional(),
  cornerRadius: z.number().optional(),
  softness: z.number().optional(),
  bulge: z
    .object({
      front: z.number().optional(),
      side: z.number().optional(),
      top: z.number().optional(),
    })
    .optional(),
  taper: z
    .object({
      top: z.number().optional(),
      bottom: z.number().optional(),
    })
    .optional(),
  symmetryGroup: z.string().optional(),
  source: z.enum(["provided", "ai_estimated", "library"]).optional(),
  productionTruth: z.boolean().optional(),
});

export type ComponentShape = z.infer<typeof ComponentShapeSchema>;

export const ShapeProfilePointSchema = z.object({
  profileId: z.string(),
  view: z.enum(["front", "side", "top"]),
  pointIndex: z.number(),
  u: z.number(),
  v: z.number(),
});

export type ShapeProfilePoint = z.infer<typeof ShapeProfilePointSchema>;

export const CadProfileCommandSchema = z.object({
  profileId: z.string(),
  componentFamily: z.string().optional(),
  view: z.enum(["front", "side", "top"]),
  pathRole: z.enum(["outer", "inner", "seam", "piping", "divider"]).default("outer"),
  sequence: z.number().default(0),
  command: z.enum(["moveTo", "lineTo", "quadraticTo", "cubicTo", "close"]),
  x: z.number().optional(),
  y: z.number().optional(),
  cp1x: z.number().optional(),
  cp1y: z.number().optional(),
  cp2x: z.number().optional(),
  cp2y: z.number().optional(),
  closed: z.boolean().optional().default(false),
  mirrorAllowed: z.boolean().optional().default(false),
  note: z.string().optional(),
});

export type CadProfileCommand = z.infer<typeof CadProfileCommandSchema>;

export const LoftSectionSchema = z.object({
  loftGroup: z.string(),
  sectionId: z.string().optional(),
  sectionT: z.number(),
  mirrorAllowed: z.boolean().default(true),
  widthScale: z.number().default(1.0),
  heightScale: z.number().default(1.0),
  depthScale: z.number().default(1.0),
  offsetX: z.number().default(0),
  offsetY: z.number().default(0),
  offsetZ: z.number().default(0),
  bulge: z.number().default(0),
  frontProfile: z.string().optional(),
  sideProfile: z.string().optional(),
  topProfile: z.string().optional(),
});

export type LoftSection = z.infer<typeof LoftSectionSchema>;

export const SoftSurfaceParamsSchema = z.object({
  softGroup: z.string(),
  componentType: z.string().optional(),
  surfaceMode: z.enum(["seat", "back", "pillow", "cushion", "default"]).default("default"),
  gridU: z.number().default(16),
  gridV: z.number().default(16),
  subdivLevel: z.number().default(2),
  crownX: z.number().default(0.1),
  crownY: z.number().default(0.1),
  frontDrop: z.number().default(0.0),
  sideRoundness: z.number().default(0.1),
  cornerFalloff: z.number().default(0.1),
  edgeSoftness: z.number().default(0.1),
  seamPull: z.number().default(0.0),
  supportBias: z.number().default(0.5),
  normalSmooth: z.boolean().default(true),
});

export type SoftSurfaceParams = z.infer<typeof SoftSurfaceParamsSchema>;

export const ComponentSchema = z.object({
  id: z.string().min(1, "Component id is required"),
  name: z.string().min(1, "Component name is required"),
  type: z.string().min(1, "Component type is required"),
  material: z.string().optional(),
  geometryMode: z.enum(["box", "soft_surface", "loft_shell", "mesh_reference"]).optional().default("box"),
  loftGroup: z.string().optional(),
  softGroup: z.string().optional(),
  size: z.object({
    x: z.number({ message: "size_x must be a number" }).nonnegative("size_x must be non-negative"),
    y: z.number({ message: "size_y must be a number" }).nonnegative("size_y must be non-negative"),
    z: z.number({ message: "size_z must be a number" }).nonnegative("size_z must be non-negative"),
  }),
  position: z.object({
    x: z.number({ message: "pos_x must be a number" }),
    y: z.number({ message: "pos_y must be a number" }),
    z: z.number({ message: "pos_z must be a number" }),
  }),
  explode: z.object({
    x: z.number({ message: "explode_x must be a number" }),
    y: z.number({ message: "explode_y must be a number" }),
    z: z.number({ message: "explode_z must be a number" }),
  }).default({ x: 0, y: 0, z: 0 }),
  rotation: ComponentRotationSchema.optional().default({ x: 0, y: 0, z: 0 }),
  profiles: ComponentProfilesSchema,
  shape: ComponentShapeSchema.optional().default({ proxy: "box" }),
});

export const FurnitureEngineeringSchema = z.object({
  schemaVersion: z.literal("1.0"),
  sku: z.string().min(1, "SKU is required"),
  units: z.literal("mm"),
  productType: z.string().min(1, "Product type is required"),
  overall: z.object({
    width: z.number({ message: "overall_width must be a number" }).positive("overall_width must be positive"),
    depth: z.number({ message: "overall_depth must be a number" }).positive("overall_depth must be positive"),
    height: z.number({ message: "overall_height must be a number" }).positive("overall_height must be positive"),
  }),
  components: z.array(ComponentSchema).min(1, "At least one component is required"),
  shapeProfiles: z.array(ShapeProfilePointSchema).optional().default([]),
  cadProfiles: z.array(CadProfileCommandSchema).optional().default([]),
  loftSections: z.array(LoftSectionSchema).optional().default([]),
  softSurfaceParams: z.array(SoftSurfaceParamsSchema).optional().default([]),
  topology2D: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  geometry: z
    .object({
      profiles: z.array(z.any()).optional().default([]),
      loftSections: z.array(LoftSectionSchema).optional().default([]),
      softSurfaceParams: z.array(SoftSurfaceParamsSchema).optional().default([]),
      topology2D: z.array(z.record(z.string(), z.unknown())).optional().default([]),
    })
    .optional(),
  source: z.object({
    kind: z.enum(["excel", "csv", "manual", "vector-db"]),
    filename: z.string().optional(),
  }),
  warnings: z.array(z.string()).default([]),
});

export type FurnitureEngineeringData = z.infer<typeof FurnitureEngineeringSchema>;

export type IssueSeverity = "error" | "warning" | "info";
export type ValidationLevel = "pass" | "warning" | "fail";

export interface ValidationIssue {
  code: string;
  severity: IssueSeverity;
  componentId?: string;
  field?: string;
  message: string;
  actual?: unknown;
  expected?: unknown;
}

export interface EngineeringValidationReport {
  valid: boolean;
  level: ValidationLevel;
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
  issues: ValidationIssue[];
}

