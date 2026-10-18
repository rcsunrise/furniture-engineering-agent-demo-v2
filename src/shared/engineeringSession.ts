import { z } from "zod";
import { DataProvenanceSchema, sanitizeProvenance, type DataProvenance } from "./provenance.js";
import type { FESDocument } from "./fes.js";

export type EngineeringSessionStatus =
  | "created"
  | "image_ready"
  | "mesh_ready"
  | "fes_ready"
  | "alignment_ready"
  | "geometry_ready"
  | "assembly_ready"
  | "validated"
  | "production_candidate"
  | "blocked";

export const EngineeringSessionStatusSchema = z.enum([
  "created",
  "image_ready",
  "mesh_ready",
  "fes_ready",
  "alignment_ready",
  "geometry_ready",
  "assembly_ready",
  "validated",
  "production_candidate",
  "blocked",
]);

export type PipelineStageStatus =
  | "not_started"
  | "ready"
  | "running"
  | "passed"
  | "warning"
  | "blocked"
  | "failed";

export const PipelineStageStatusSchema = z.enum([
  "not_started",
  "ready",
  "running",
  "passed",
  "warning",
  "blocked",
  "failed",
]);

export const DiagnosticIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(["info", "warning", "error"]),
});

export type DiagnosticIssue = z.infer<typeof DiagnosticIssueSchema>;

export const EngineeringPipelineDiagnosticsSchema = z.object({
  image: PipelineStageStatusSchema.default("not_started"),
  localWorker: PipelineStageStatusSchema.default("not_started"),
  comfyui: PipelineStageStatusSchema.default("not_started"),
  hunyuan3d: PipelineStageStatusSchema.default("not_started"),
  glb: PipelineStageStatusSchema.default("not_started"),
  session: PipelineStageStatusSchema.default("not_started"),
  fes: PipelineStageStatusSchema.default("not_started"),
  alignment: PipelineStageStatusSchema.default("not_started"),
  geometry: PipelineStageStatusSchema.default("not_started"),
  assembly: PipelineStageStatusSchema.default("not_started"),
  production: PipelineStageStatusSchema.default("not_started"),
  issues: z.array(DiagnosticIssueSchema).default([]),
});

export type EngineeringPipelineDiagnostics = z.infer<typeof EngineeringPipelineDiagnosticsSchema>;

export const BindingMethodSchema = z.enum([
  "EXPLICIT_CANONICAL",
  "EXPLICIT_ALIAS",
  "USER_MAPPED",
  "UNRESOLVED",
]);
export type BindingMethod = z.infer<typeof BindingMethodSchema>;

export const ComponentIdentitySchema = z.object({
  canonicalComponentId: z.string(),
  partId: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  artifactIds: z.array(z.string()).default([]),
  sessionId: z.string(),
  sku: z.string().optional(),
  bindingMethod: BindingMethodSchema.default("UNRESOLVED"),
});
export type ComponentIdentity = z.infer<typeof ComponentIdentitySchema>;

export const ComponentArtifactBindingSchema = z.object({
  partId: z.string(),
  componentId: z.string(),
  canonicalComponentId: z.string().optional(),
  artifactId: z.string(),
  bindingType: z.enum(["ai_reference_mesh", "cad_profile", "soft_surface", "loft_shell", "proxy_fallback"]).default("ai_reference_mesh"),
  bindingMethod: BindingMethodSchema.default("UNRESOLVED"),
  confidence: z.number().min(0).max(1).default(0.5),
  productionTruth: z.boolean().default(false),
  provenance: DataProvenanceSchema.optional(),
  boundAt: z.string().default(() => new Date().toISOString()),
});

export type ComponentArtifactBinding = z.infer<typeof ComponentArtifactBindingSchema>;

export const GeometryCandidateSummarySchema = z
  .object({
    candidateId: z.string(),
    canonicalComponentId: z.string(),
    reconstructionMethod: z.string(),
    createdAt: z.string(),
    reviewStatus: z.string().default("draft"),
  })
  .passthrough();
export type GeometryCandidateSummary = z.infer<typeof GeometryCandidateSummarySchema>;

export const EngineeringSessionSchema = z.object({
  id: z.string(),
  workspaceId: z.string().default("default-workspace"),
  sku: z.string(),
  status: EngineeringSessionStatusSchema.default("created"),

  referenceImageArtifactId: z.string().optional(),
  aiMeshArtifactIds: z.array(z.string()).default([]),
  fesDocumentId: z.string().optional(),
  fesDocument: z.any().optional(),
  activeComponentId: z.string().optional(),

  componentBindings: z.array(ComponentArtifactBindingSchema).default([]),
  unresolvedArtifacts: z.array(z.object({ artifactId: z.string(), partId: z.string() })).default([]),
  alignmentSessions: z.array(z.string()).default([]),
  geometryCandidates: z.array(GeometryCandidateSummarySchema).default([]),

  diagnostics: EngineeringPipelineDiagnosticsSchema.default({
    image: "not_started",
    localWorker: "not_started",
    comfyui: "not_started",
    hunyuan3d: "not_started",
    glb: "not_started",
    session: "ready",
    fes: "not_started",
    alignment: "not_started",
    geometry: "not_started",
    assembly: "not_started",
    production: "blocked",
    issues: [],
  }),

  productionTruth: z.boolean().default(false),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type EngineeringSession = z.infer<typeof EngineeringSessionSchema>;

export interface ProductionEligibilityResult {
  eligible: boolean;
  reason: string;
  level: "DISPLAY_READY" | "ENGINEERING_READY" | "PRODUCTION_READY";
  issues: DiagnosticIssue[];
}

/**
 * Strict Production Eligibility Gate:
 * Evaluates whether an Engineering Session can be marked PRODUCTION READY.
 * If proxy fallback, missing profiles, AI-only mesh, or unverified truth exists,
 * returns productionEligible = false.
 */
export function isProductionEligible(
  session: Partial<EngineeringSession>,
  fesDocument?: FESDocument | null
): ProductionEligibilityResult {
  const issues: DiagnosticIssue[] = [];
  let hasProxy = false;
  let hasAiOnly = false;
  let missingFes = !fesDocument;

  if (!fesDocument) {
    issues.push({
      code: "MISSING_FES_DOCUMENT",
      message: "No FES engineering document bound to session.",
      severity: "error",
    });
  } else {
    for (const comp of fesDocument.components || []) {
      const mode = (comp.geometryMode || "box").toLowerCase();
      if (mode === "box" || mode === "proxy_fallback") {
        hasProxy = true;
        issues.push({
          code: "PROXY_GEOMETRY_DETECTED",
          message: `Component ${comp.id} uses proxy geometry mode '${mode}'.`,
          severity: "warning",
        });
      }
      if (!(comp as any).productionTruth) {
        issues.push({
          code: "COMPONENT_NOT_PRODUCTION_TRUTH",
          message: `Component ${comp.id} has productionTruth=false.`,
          severity: "warning",
        });
      }
    }
  }

  for (const binding of session.componentBindings || []) {
    if (binding.bindingType === "ai_reference_mesh" && !binding.productionTruth) {
      hasAiOnly = true;
    }
    if (binding.bindingType === "proxy_fallback") {
      hasProxy = true;
    }
  }

  if (missingFes) {
    return {
      eligible: false,
      reason: "Missing canonical FES document.",
      level: "DISPLAY_READY",
      issues,
    };
  }

  if (hasProxy) {
    return {
      eligible: false,
      reason: "System contains proxy/fallback geometries. Proxy geometries cannot pass production gate.",
      level: "DISPLAY_READY",
      issues,
    };
  }

  if (hasAiOnly || !session.productionTruth) {
    return {
      eligible: false,
      reason: "Session relies on AI inference or unverified mesh without confirmed engineering CAD truth.",
      level: "ENGINEERING_READY",
      issues,
    };
  }

  return {
    eligible: true,
    reason: "All components verified with CAD engineering truth.",
    level: "PRODUCTION_READY",
    issues,
  };
}

/**
 * Canonical Component Alias Table
 * Standard mapping between incoming part identifiers/aliases and canonical FES component IDs.
 */
export const DEFAULT_COMPONENT_ALIAS_TABLE: Record<string, string[]> = {
  "ARM-L-OUT": ["part-arm-left", "armrest_left", "arm-l-out", "arm_l_out", "arm-l-outer", "arm-left-outer", "arm-l", "arm_l", "arm-left"],
  "ARM-R-OUT": ["part-arm-right", "armrest_right", "arm-r-out", "arm_r_out", "arm-r-outer", "arm-right-outer", "arm-r", "arm_r", "arm-right"],
  "ARM-L": ["part-arm-left", "armrest_left", "arm-l", "arm_l", "arm-left", "arm-l-out", "arm_l_out", "arm-l-outer", "arm-left-outer"],
  "ARM-R": ["part-arm-right", "armrest_right", "arm-r", "arm_r", "arm-right", "arm-r-out", "arm_r_out", "arm-r-outer", "arm-right-outer"],
  "FRAME-BASE": ["part-frame-base", "frame_base", "frame-1", "frame_1"],
  "LEG-FL": ["part-leg-fl", "leg_fl", "leg-fl-mesh"],
  "LEG-FR": ["part-leg-fr", "leg_fr", "leg-fr-mesh"],
  "LEG-BL": ["part-leg-bl", "leg_bl", "leg-bl-mesh"],
  "LEG-BR": ["part-leg-br", "leg_br", "leg-br-mesh"],
  "SEAT-CUSHION": ["part-seat-cushion", "seat_cushion", "seat-cush-01", "seat-1", "seat_cushion_1"],
  "SEAT-CUSH-01": ["part-seat-cushion", "seat_cushion", "seat-cush-01", "seat-1"],
  "BACK-REST": ["part-back-rest", "back_rest", "backrest"],
  "PILLOW-L": ["part-pillow-l", "pillow_l", "pillow-left"],
  "PILLOW-R": ["part-pillow-r", "pillow_r", "pillow-right"],
};

function normalizeStringId(id: string): string {
  return id.trim().toLowerCase().replace(/_/g, "-");
}

/**
 * Strict Binding Resolver (Gate G4-SYSTEM-AUDIT-R2):
 * Priority:
 * 1. Exact Canonical ID match
 * 2. Explicit alias table match
 * 3. Explicit user mapping match
 * 4. Unresolved (NO fuzzy substring/startsWith matching)
 */
export function resolveComponentBinding(
  partId: string,
  artifactId: string,
  fesDocument?: FESDocument | null,
  bindingType: "ai_reference_mesh" | "cad_profile" | "soft_surface" | "loft_shell" | "proxy_fallback" = "ai_reference_mesh",
  confidence: number = 0.5,
  userMappings?: Record<string, string>
): { binding: ComponentArtifactBinding | null; status: "OK" | "UNRESOLVED_BINDING"; reason?: string } {
  if (!fesDocument || !fesDocument.components || fesDocument.components.length === 0) {
    return {
      binding: null,
      status: "UNRESOLVED_BINDING",
      reason: "No FES document or components available for binding.",
    };
  }

  const normPartId = normalizeStringId(partId);

  // PRIORITY 1: Exact Canonical ID match
  const exactCanonicalComp = fesDocument.components.find(
    (c) => normalizeStringId(c.id) === normPartId
  );

  if (exactCanonicalComp) {
    return {
      binding: {
        partId,
        componentId: exactCanonicalComp.id,
        canonicalComponentId: exactCanonicalComp.id,
        artifactId,
        bindingType,
        bindingMethod: "EXPLICIT_CANONICAL",
        confidence,
        productionTruth: false,
        provenance: sanitizeProvenance({
          sourceType: "ai_generated",
          sourceId: artifactId,
          confidence,
          productionTruth: false,
          producer: "ComponentBindingResolver",
        }),
        boundAt: new Date().toISOString(),
      },
      status: "OK",
    };
  }

  // PRIORITY 2: Explicit Alias Table Match
  const aliasComp = fesDocument.components.find((comp) => {
    // Check component.aliases array if declared on FES component
    if ((comp as any).aliases && Array.isArray((comp as any).aliases)) {
      if ((comp as any).aliases.some((a: string) => normalizeStringId(a) === normPartId)) {
        return true;
      }
    }
    // Check global DEFAULT_COMPONENT_ALIAS_TABLE
    const canonicalKey = comp.id.toUpperCase();
    const explicitAliases = DEFAULT_COMPONENT_ALIAS_TABLE[canonicalKey] || DEFAULT_COMPONENT_ALIAS_TABLE[comp.id] || [];
    return explicitAliases.some((alias) => normalizeStringId(alias) === normPartId);
  });

  if (aliasComp) {
    return {
      binding: {
        partId,
        componentId: aliasComp.id,
        canonicalComponentId: aliasComp.id,
        artifactId,
        bindingType,
        bindingMethod: "EXPLICIT_ALIAS",
        confidence,
        productionTruth: false,
        provenance: sanitizeProvenance({
          sourceType: "ai_generated",
          sourceId: artifactId,
          confidence,
          productionTruth: false,
          producer: "ComponentBindingResolver",
        }),
        boundAt: new Date().toISOString(),
      },
      status: "OK",
    };
  }

  // PRIORITY 3: Explicit User Mapping Match
  if (userMappings) {
    const userMappedTargetId = userMappings[partId] || userMappings[normPartId];
    if (userMappedTargetId) {
      const mappedComp = fesDocument.components.find(
        (c) => normalizeStringId(c.id) === normalizeStringId(userMappedTargetId)
      );
      if (mappedComp) {
        return {
          binding: {
            partId,
            componentId: mappedComp.id,
            canonicalComponentId: mappedComp.id,
            artifactId,
            bindingType,
            bindingMethod: "USER_MAPPED",
            confidence,
            productionTruth: false,
            provenance: sanitizeProvenance({
              sourceType: "ai_generated",
              sourceId: artifactId,
              confidence,
              productionTruth: false,
              producer: "ComponentBindingResolver",
            }),
            boundAt: new Date().toISOString(),
          },
          status: "OK",
        };
      }
    }
  }

  // PRIORITY 4: UNRESOLVED (No fuzzy matching permitted)
  return {
    binding: null,
    status: "UNRESOLVED_BINDING",
    reason: `Strict identity resolution failed: partId '${partId}' has no exact canonical ID or explicit alias match in FES components.`,
  };
}

/**
 * Session Consistency & Identity Validator (Gate G4-SYSTEM-AUDIT-R2):
 * Verifies that the canonicalComponentId is identical across session bindings, alignment, assembly, and selection.
 * Generates COMPONENT_IDENTITY_MISMATCH diagnostic issue on any discrepancy.
 */
export function validateComponentIdentityConsistency(params: {
  canonicalComponentId: string;
  partId?: string;
  bindingComponentId?: string;
  alignmentComponentId?: string;
  fesComponentId?: string;
  assemblyComponentId?: string;
  selectedComponentId?: string;
}): { consistent: boolean; mismatchReason?: string; issues: DiagnosticIssue[] } {
  const issues: DiagnosticIssue[] = [];
  const target = params.canonicalComponentId;

  if (params.bindingComponentId && params.bindingComponentId !== target) {
    issues.push({
      code: "COMPONENT_IDENTITY_MISMATCH",
      message: `Binding componentId '${params.bindingComponentId}' does not match canonicalComponentId '${target}'.`,
      severity: "error",
    });
  }

  if (params.alignmentComponentId && params.alignmentComponentId !== target) {
    issues.push({
      code: "COMPONENT_IDENTITY_MISMATCH",
      message: `AlignmentSession componentId '${params.alignmentComponentId}' does not match canonicalComponentId '${target}'.`,
      severity: "error",
    });
  }

  if (params.fesComponentId && params.fesComponentId !== target) {
    issues.push({
      code: "COMPONENT_IDENTITY_MISMATCH",
      message: `FES component.id '${params.fesComponentId}' does not match canonicalComponentId '${target}'.`,
      severity: "error",
    });
  }

  if (params.assemblyComponentId && params.assemblyComponentId !== target) {
    issues.push({
      code: "COMPONENT_IDENTITY_MISMATCH",
      message: `Assembly componentId '${params.assemblyComponentId}' does not match canonicalComponentId '${target}'.`,
      severity: "error",
    });
  }

  if (params.selectedComponentId && params.selectedComponentId !== target) {
    issues.push({
      code: "COMPONENT_IDENTITY_MISMATCH",
      message: `Selected componentId '${params.selectedComponentId}' does not match canonicalComponentId '${target}'.`,
      severity: "error",
    });
  }

  const consistent = issues.length === 0;
  return {
    consistent,
    mismatchReason: consistent ? undefined : issues.map((i) => i.message).join(" "),
    issues,
  };
}
