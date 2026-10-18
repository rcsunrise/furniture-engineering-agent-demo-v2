import { z } from "zod";

export const Model3DFormatSchema = z.enum([
  "glb",
  "gltf",
  "obj",
  "stl",
  "ply",
  "fbx",
  "zip",
]);
export type Model3DFormat = z.infer<typeof Model3DFormatSchema>;

export const CoordinateUpAxisSchema = z.enum(["Y_UP", "Z_UP"]);
export type CoordinateUpAxis = z.infer<typeof CoordinateUpAxisSchema>;

export const ModelBoundingBoxSchema = z.object({
  min: z.tuple([z.number(), z.number(), z.number()]),
  max: z.tuple([z.number(), z.number(), z.number()]),
});
export type ModelBoundingBox = z.infer<typeof ModelBoundingBoxSchema>;

export const ModelDimensionsSchema = z.object({
  width: z.number(),  // X axis (mm)
  depth: z.number(),  // Y axis (mm)
  height: z.number(), // Z axis (mm)
});
export type ModelDimensions = z.infer<typeof ModelDimensionsSchema>;

export const ModelGeometryStatsSchema = z.object({
  meshCount: z.number(),
  vertexCount: z.number(),
  triangleCount: z.number(),
  materialCount: z.number(),
  textureCount: z.number(),
  boundingBox: ModelBoundingBoxSchema,
  dimensions: ModelDimensionsSchema,
});
export type ModelGeometryStats = z.infer<typeof ModelGeometryStatsSchema>;

export const ModelMaterialInfoSchema = z.object({
  name: z.string(),
  type: z.string(),
  color: z.string().optional(),
  wireframe: z.boolean().optional(),
  hasTexture: z.boolean().optional(),
});
export type ModelMaterialInfo = z.infer<typeof ModelMaterialInfoSchema>;

export const CoordinateSystemMetadataSchema = z.object({
  detectedUp: CoordinateUpAxisSchema,
  targetUp: CoordinateUpAxisSchema,
  conversionApplied: z.string().default("NONE"),
});
export type CoordinateSystemMetadata = z.infer<typeof CoordinateSystemMetadataSchema>;

/**
 * Canonical Imported 3D Asset Record.
 * Stored in Supabase Storage bucket 'engineering-3d-assets' (binary file)
 * and metadata in PostgreSQL table 'engineering_3d_assets'.
 */
export const Imported3DAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  fileName: z.string(),
  fileSize: z.number(),
  format: Model3DFormatSchema,
  storageBucket: z.string().default("engineering-3d-assets"),
  storagePath: z.string(),
  downloadUrl: z.string(),
  thumbnailUrl: z.string().optional(),
  stats: ModelGeometryStatsSchema,
  materials: z.array(ModelMaterialInfoSchema).default([]),
  coordinateSystem: CoordinateSystemMetadataSchema,
  metadata: z.record(z.string(), z.any()).default({}),
  productionTruth: z.literal(false).default(false), // AI/imported mesh is never productionTruth
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Imported3DAsset = z.infer<typeof Imported3DAssetSchema>;

/**
 * Scene Model Instance
 * Represents an instance of an imported asset placed within an Engineering 3D Scene.
 */
export const CoordinateAdapterSettingsSchema = z.object({
  sourceUp: CoordinateUpAxisSchema.default("Y_UP"),
  alignGround: z.boolean().default(true),
  centerOrigin: z.boolean().default(true),
  scaleFactor: z.number().default(1.0), // Unit multiplier (e.g. 1000 for m->mm, 10 for cm->mm)
});
export type CoordinateAdapterSettings = z.infer<typeof CoordinateAdapterSettingsSchema>;

export const SceneModelInstanceSchema = z.object({
  instanceId: z.string(),
  assetId: z.string(),
  artifactId: z.string().optional(),
  componentId: z.string().optional(),
  name: z.string(),
  transform: z.object({
    position: z.tuple([z.number(), z.number(), z.number()]),
    rotation: z.tuple([z.number(), z.number(), z.number()]), // Euler degrees
    scale: z.tuple([z.number(), z.number(), z.number()]),
  }),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  isolated: z.boolean().optional(),
  productionTruth: z.boolean().default(false).optional(),
  coordinateAdapter: CoordinateAdapterSettingsSchema.default({
    sourceUp: "Y_UP",
    alignGround: true,
    centerOrigin: true,
    scaleFactor: 1.0,
  }),
  materialOverrides: z.object({
    color: z.string().optional(),
    wireframe: z.boolean().optional(),
    opacity: z.number().optional(),
  }).optional(),
  componentBinding: z.object({
    canonicalComponentId: z.string().optional(),
    partId: z.string().optional(),
    bindingMethod: z.string().optional(),
  }).optional(),
});
export type SceneModelInstance = z.infer<typeof SceneModelInstanceSchema>;

/**
 * Engineering 3D Scene
 * Lightweight JSON document saved in PostgreSQL 'engineering_3d_scenes'.
 * Never duplicates mesh data - references assets by assetId.
 */
export const Engineering3DSceneSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  instances: z.array(SceneModelInstanceSchema).default([]),
  camera: z.object({
    position: z.tuple([z.number(), z.number(), z.number()]),
    target: z.tuple([z.number(), z.number(), z.number()]),
    fov: z.number().optional().default(45),
  }),
  viewMode: z.enum(["shaded", "wireframe", "normal", "xray", "engineering"]).default("shaded"),
  explodeProgress: z.number().default(0),
  environment: z.object({
    gridVisible: z.boolean().default(true),
    shadows: z.boolean().default(true),
    axesVisible: z.boolean().default(true),
    backgroundColor: z.string().default("#18191c"),
  }).default({
    gridVisible: true,
    shadows: true,
    axesVisible: true,
    backgroundColor: "#18191c",
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Engineering3DScene = z.infer<typeof Engineering3DSceneSchema>;
