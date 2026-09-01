import { z } from "zod";

export const ProjectionViewSchema = z.enum(["front", "side", "top"]);
export type ProjectionView = z.infer<typeof ProjectionViewSchema>;

export const ProjectionAxisContractSchema = z.object({
  view: ProjectionViewSchema,
  horizontalAxis: z.enum(["X", "Y", "Z"]),
  verticalAxis: z.enum(["X", "Y", "Z"]),
});
export type ProjectionAxisContract = z.infer<typeof ProjectionAxisContractSchema>;

/**
 * Canonical Orthographic Projection Axis Contract
 * Engineering Coordinate System: X = LEFT/RIGHT, Y = FRONT/BACK, Z = UP/DOWN
 * FRONT = XZ (Horizontal: X, Vertical: Z)
 * SIDE  = YZ (Horizontal: Y, Vertical: Z)
 * TOP   = XY (Horizontal: X, Vertical: Y)
 */
export const CANONICAL_PROJECTION_AXES: Record<
  ProjectionView,
  { horizontalAxis: "X" | "Y" | "Z"; verticalAxis: "X" | "Y" | "Z" }
> = {
  front: { horizontalAxis: "X", verticalAxis: "Z" },
  side: { horizontalAxis: "Y", verticalAxis: "Z" },
  top: { horizontalAxis: "X", verticalAxis: "Y" },
};

export const ReferenceAdequacySchema = z.enum([
  "ENGINEERING_PROFILE",
  "ENGINEERING_LOFT",
  "CAD_CONTOUR",
  "PROXY_ONLY",
  "MISSING",
]);
export type ReferenceAdequacy = z.infer<typeof ReferenceAdequacySchema>;

export function getReferenceAdequacy(geometrySource: string): ReferenceAdequacy {
  switch (geometrySource) {
    case "workbook_profile":
      return "ENGINEERING_PROFILE";
    case "workbook_loft":
      return "ENGINEERING_LOFT";
    case "cad_component_contour":
      return "CAD_CONTOUR";
    case "proxy_fallback":
      return "PROXY_ONLY";
    default:
      return "MISSING";
  }
}

export const GeometryQualityLevelSchema = z.enum([
  "REFERENCE_HIGH",
  "REFERENCE_MEDIUM",
  "REFERENCE_LOW",
  "REFERENCE_UNUSABLE",
]);
export type GeometryQualityLevel = z.infer<typeof GeometryQualityLevelSchema>;

export const EvaluationStatusSchema = z.enum([
  "READY",
  "EVALUATED",
  "PROFILE_MISSING",
  "PROJECTION_FAILED",
  "CONTOUR_INVALID",
  "REFERENCE_INSUFFICIENT",
  "EVALUATION_FAILED",
]);
export type EvaluationStatus = z.infer<typeof EvaluationStatusSchema>;

export const ProjectionSanitySchema = z.object({
  refWidthMm: z.number(),
  refHeightMm: z.number(),
  aiWidthMm: z.number(),
  aiHeightMm: z.number(),
  widthRatio: z.number(),
  heightRatio: z.number(),
  axisSuspect: z.boolean(),
});
export type ProjectionSanity = z.infer<typeof ProjectionSanitySchema>;

export const ProjectionResidualSchema = z.object({
  view: ProjectionViewSchema,
  silhouetteIoU: z.number().min(0).max(1),
  areaResidualPercent: z.number(),
  meanContourDistanceMm: z.number().min(0),
  meanSymmetricContourDistanceMm: z.number().min(0),
  p95ContourDistanceMm: z.number().min(0),
  maxContourDistanceMm: z.number().min(0),
  contourPointsCount: z.number().optional(),
  sanity: ProjectionSanitySchema.optional(),
});
export type ProjectionResidual = z.infer<typeof ProjectionResidualSchema>;

export const LandmarkResidualSchema = z.object({
  landmarkName: z.string(),
  projectedDistanceMm: z.number().min(0),
  deltaX: z.number(),
  deltaY: z.number(),
});
export type LandmarkResidual = z.infer<typeof LandmarkResidualSchema>;

export const GeometryResidualReportSchema = z.object({
  componentId: z.string(),
  artifactId: z.string(),
  geometrySource: z.enum([
    "workbook_profile",
    "workbook_loft",
    "cad_component_contour",
    "proxy_fallback",
  ]),
  referenceAdequacy: ReferenceAdequacySchema,
  gateEligible: z.boolean(),
  crossViewConsistency: z.number().min(0).max(100),
  views: z.array(ProjectionResidualSchema),
  landmarks: z.array(LandmarkResidualSchema).default([]),
  overallScore: z.number().min(0).max(100),
  qualityLevel: GeometryQualityLevelSchema,
  status: EvaluationStatusSchema,
  errorMessage: z.string().optional(),
  productionTruth: z.literal(false).default(false),
});
export type GeometryResidualReport = z.infer<typeof GeometryResidualReportSchema>;

export const EvaluatorWeightsSchema = z.object({
  frontWeight: z.number().min(0).max(1).default(0.4),
  sideWeight: z.number().min(0).max(1).default(0.3),
  topWeight: z.number().min(0).max(1).default(0.2),
  dimensionWeight: z.number().min(0).max(1).default(0.1),
});
export type EvaluatorWeights = z.infer<typeof EvaluatorWeightsSchema>;
