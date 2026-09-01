import { z } from "zod";

export const SignedAxisSchema = z.enum(["+X", "-X", "+Y", "-Y", "+Z", "-Z"]);
export type SignedAxis = z.infer<typeof SignedAxisSchema>;

export const OriginModeSchema = z.enum(["raw", "center", "bottom_center"]);
export type OriginMode = z.infer<typeof OriginModeSchema>;

export const Vector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});
export type Vector3D = z.infer<typeof Vector3Schema>;

export const MeshBoundsSchema = z.object({
  min: Vector3Schema,
  max: Vector3Schema,
  center: Vector3Schema,
  size: Vector3Schema,
  boundingRadius: z.number(),
  meshCount: z.number(),
  vertexCount: z.number(),
  triangleCount: z.number(),
});
export type MeshBounds = z.infer<typeof MeshBoundsSchema>;

export const MeshAxisMappingSchema = z.object({
  meshUpAxis: SignedAxisSchema,
  meshFrontAxis: SignedAxisSchema,
});
export type MeshAxisMapping = z.infer<typeof MeshAxisMappingSchema>;

export const MeshNormalizationTransformSchema = z.object({
  artifactId: z.string(),
  partId: z.string().optional(),
  bounds: MeshBoundsSchema,
  axisMapping: MeshAxisMappingSchema,
  originMode: OriginModeSchema,
  originTranslation: Vector3Schema,
  rotationEulerDeg: Vector3Schema,
  normalizationMatrix: z.array(z.number()).length(16), // 4x4 matrix column-major
  confidence: z.number().min(0).max(1).default(1.0),
  productionTruth: z.literal(false).default(false),
});
export type MeshNormalizationTransform = z.infer<typeof MeshNormalizationTransformSchema>;

export const NormalizationStatusSchema = z.enum([
  "NOT_NORMALIZED",
  "NORMALIZED",
  "INVALID_AXIS_MAPPING",
  "ERROR",
]);
export type NormalizationStatus = z.infer<typeof NormalizationStatusSchema>;

export const MeshAlignmentDiagnosticSchema = z.object({
  artifactId: z.string(),
  partId: z.string().optional(),
  status: NormalizationStatusSchema,
  rawBounds: MeshBoundsSchema,
  normalizedBounds: MeshBoundsSchema.optional(),
  transform: MeshNormalizationTransformSchema.optional(),
  errorMessage: z.string().optional(),
  productionTruth: z.literal(false).default(false),
});
export type MeshAlignmentDiagnostic = z.infer<typeof MeshAlignmentDiagnosticSchema>;

// G4-4B: Dimension Alignment Schemas
export const MeshScaleModeSchema = z.enum(["uniform", "non_uniform_preview"]);
export type MeshScaleMode = z.infer<typeof MeshScaleModeSchema>;

export const DistortionLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type DistortionLevel = z.infer<typeof DistortionLevelSchema>;

export const MeshDimensionAlignmentStatusSchema = z.enum([
  "READY",
  "ALIGNED",
  "DISTORTION_WARNING",
  "INVALID_SOURCE_BOUNDS",
  "INVALID_TARGET_SIZE",
  "TARGET_COMPONENT_NOT_FOUND",
  "ALIGNMENT_FAILED",
]);
export type MeshDimensionAlignmentStatus = z.infer<typeof MeshDimensionAlignmentStatusSchema>;

export const MeshDimensionTargetSchema = z.object({
  componentId: z.string(),
  size: Vector3Schema,
});
export type MeshDimensionTarget = z.infer<typeof MeshDimensionTargetSchema>;

export const MeshDimensionAlignmentSchema = z.object({
  artifactId: z.string(),
  partId: z.string().optional(),
  componentId: z.string().optional(),
  sourceSize: Vector3Schema,
  targetSize: Vector3Schema,
  candidateScale: Vector3Schema,
  appliedScale: Vector3Schema,
  scaleMode: MeshScaleModeSchema,
  alignedSize: Vector3Schema,
  residualMm: Vector3Schema,
  residualPercent: Vector3Schema,
  aspectDistortion: z.number(),
  distortionRisk: z.boolean(),
  distortionLevel: DistortionLevelSchema,
  confidence: z.number().min(0).max(1).default(1.0),
  status: MeshDimensionAlignmentStatusSchema,
  dimensionMatrix: z.array(z.number()).length(16).optional(),
  productionTruth: z.literal(false).default(false),
});
export type MeshDimensionAlignment = z.infer<typeof MeshDimensionAlignmentSchema>;

// G4-4C: Component Placement Schemas
export const MeshAnchorModeSchema = z.enum([
  "center",
  "bottom_center",
  "rear_bottom_center",
  "custom",
]);
export type MeshAnchorMode = z.infer<typeof MeshAnchorModeSchema>;

export const MeshPlacementStatusSchema = z.enum([
  "READY",
  "PLACED",
  "PLACEMENT_WARNING",
  "TARGET_COMPONENT_NOT_FOUND",
  "INVALID_ANCHOR",
  "INVALID_TRANSFORM",
  "PLACEMENT_FAILED",
]);
export type MeshPlacementStatus = z.infer<typeof MeshPlacementStatusSchema>;

export const MeshPlacementResidualSchema = z.object({
  positionResidualMm: Vector3Schema,
  rotationResidualDeg: Vector3Schema,
});
export type MeshPlacementResidual = z.infer<typeof MeshPlacementResidualSchema>;

export const MeshComponentPlacementSchema = z.object({
  artifactId: z.string(),
  partId: z.string().optional(),
  componentId: z.string(),
  anchorMode: MeshAnchorModeSchema,
  targetPosition: Vector3Schema,
  targetRotation: Vector3Schema,
  appliedPosition: Vector3Schema,
  appliedRotation: Vector3Schema,
  anchorOffset: Vector3Schema,
  status: MeshPlacementStatusSchema,
  confidence: z.number().min(0).max(1).default(1.0),
  engineeringMatrix: z.array(z.number()).length(16),
  productionTruth: z.literal(false).default(false),
});
export type MeshComponentPlacement = z.infer<typeof MeshComponentPlacementSchema>;

export const MeshEngineeringTransformSchema = z.object({
  artifactId: z.string(),
  componentId: z.string(),
  normalizationMatrix: z.array(z.number()).length(16),
  dimensionMatrix: z.array(z.number()).length(16),
  placementMatrix: z.array(z.number()).length(16),
  finalEngineeringMatrix: z.array(z.number()).length(16),
  productionTruth: z.literal(false).default(false),
});
export type MeshEngineeringTransform = z.infer<typeof MeshEngineeringTransformSchema>;


