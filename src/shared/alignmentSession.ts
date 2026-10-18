import { z } from "zod";
import {
  MeshAlignmentDiagnosticSchema,
  MeshDimensionAlignmentSchema,
  MeshComponentPlacementSchema,
  MeshEngineeringTransformSchema,
} from "./meshAlignment.js";
import { GeometryResidualReportSchema } from "./geometryEvaluation.js";

export const AlignmentSessionStatusSchema = z.enum([
  "CREATED",
  "WAITING_FOR_ENGINEERING_DATA",
  "WAITING_FOR_COMPONENT_MAPPING",
  "READY",
  "NORMALIZING",
  "DIMENSION_ALIGNING",
  "PLACING",
  "EVALUATING",
  "COMPLETED",
  "FAILED",
]);
export type AlignmentSessionStatus = z.infer<typeof AlignmentSessionStatusSchema>;

export const EngineeringAlignmentSessionSchema = z.object({
  sessionId: z.string(),
  workspaceId: z.string().default("default-workspace"),

  artifactId: z.string(),
  partId: z.string(),

  engineeringDocumentId: z.string(),
  sku: z.string(),
  componentId: z.string(),
  canonicalComponentId: z.string().optional(),
  bindingMethod: z.enum(["EXPLICIT_CANONICAL", "EXPLICIT_ALIAS", "USER_MAPPED", "UNRESOLVED"]).optional(),

  status: AlignmentSessionStatusSchema,

  geometrySource: z.string().optional(),

  normalization: MeshAlignmentDiagnosticSchema.optional(),
  dimensionAlignment: MeshDimensionAlignmentSchema.optional(),
  placement: MeshComponentPlacementSchema.optional(),
  engineeringTransform: MeshEngineeringTransformSchema.optional(),
  evaluation: GeometryResidualReportSchema.optional(),

  createdAt: z.number(),
  updatedAt: z.number(),

  errorMessage: z.string().optional(),

  productionTruth: z.literal(false).default(false),
});

export type EngineeringAlignmentSession = z.infer<typeof EngineeringAlignmentSessionSchema>;

export function createAlignmentSession(params: {
  sessionId?: string;
  workspaceId?: string;
  artifactId: string;
  partId: string;
  engineeringDocumentId?: string;
  sku?: string;
  componentId?: string;
  canonicalComponentId?: string;
  bindingMethod?: "EXPLICIT_CANONICAL" | "EXPLICIT_ALIAS" | "USER_MAPPED" | "UNRESOLVED";
  geometrySource?: string;
}): EngineeringAlignmentSession {
  const now = Date.now();
  const id = params.sessionId || `session_${now}_${Math.random().toString(36).substring(2, 7)}`;
  const hasFes = Boolean(params.engineeringDocumentId && params.engineeringDocumentId.trim() !== "");
  const hasComp = Boolean(params.componentId && params.componentId.trim() !== "");

  let status: AlignmentSessionStatus = "CREATED";
  if (!hasFes) {
    status = "WAITING_FOR_ENGINEERING_DATA";
  } else if (!hasComp) {
    status = "WAITING_FOR_COMPONENT_MAPPING";
  } else {
    status = "READY";
  }

  const canonCompId = params.canonicalComponentId || params.componentId || "";

  return {
    sessionId: id,
    workspaceId: params.workspaceId || "default-workspace",
    artifactId: params.artifactId,
    partId: params.partId,
    engineeringDocumentId: params.engineeringDocumentId || "",
    sku: params.sku || "",
    componentId: params.componentId || "",
    canonicalComponentId: canonCompId,
    bindingMethod: params.bindingMethod || (hasComp ? "EXPLICIT_CANONICAL" : "UNRESOLVED"),
    status,
    geometrySource: params.geometrySource || "proxy_fallback",
    createdAt: now,
    updatedAt: now,
    productionTruth: false,
  };
}
