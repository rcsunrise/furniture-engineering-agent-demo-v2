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

export const ComponentArtifactBindingSchema = z.object({
  partId: z.string(),
  componentId: z.string(),
  artifactId: z.string(),
  bindingType: z.enum(["ai_reference_mesh", "cad_profile", "soft_surface", "loft_shell", "proxy_fallback"]).default("ai_reference_mesh"),
  confidence: z.number().min(0).max(1).default(0.5),
  productionTruth: z.boolean().default(false),
  provenance: DataProvenanceSchema.optional(),
  boundAt: z.string().default(() => new Date().toISOString()),
});

export type ComponentArtifactBinding = z.infer<typeof ComponentArtifactBindingSchema>;

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
      if (!comp.productionTruth) {
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
 * Strict Binding Resolver:
 * Resolves binding from partId to componentId. Returns UNRESOLVED_BINDING if ambiguous or missing.
 */
export function resolveComponentBinding(
  partId: string,
  artifactId: string,
  fesDocument?: FESDocument | null,
  bindingType: "ai_reference_mesh" | "cad_profile" | "soft_surface" | "loft_shell" | "proxy_fallback" = "ai_reference_mesh",
  confidence: number = 0.5
): { binding: ComponentArtifactBinding | null; status: "OK" | "UNRESOLVED_BINDING"; reason?: string } {
  if (!fesDocument || !fesDocument.components || fesDocument.components.length === 0) {
    return {
      binding: null,
      status: "UNRESOLVED_BINDING",
      reason: "No FES document or components available for binding.",
    };
  }

  const rawPartLower = partId.toLowerCase();
  const normalizedPart = rawPartLower.replace(/^part-/, "").replace(/-/g, "_");

  // 1. Direct / Substring Match Check
  const directMatch = fesDocument.components.find((c) => {
    const cid = c.id.toLowerCase();
    const cnorm = cid.replace(/-/g, "_");
    return cid === rawPartLower || cnorm === normalizedPart || rawPartLower.startsWith(cid) || cid.startsWith(rawPartLower);
  });

  if (directMatch) {
    return {
      binding: {
        partId,
        componentId: directMatch.id,
        artifactId,
        bindingType,
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

  // 2. Token Match
  const ignoreTokens = new Set(["out", "in", "mesh", "part", "glb", "v1", "v2"]);
  const partTokens = normalizedPart.split("_").filter((t) => t.length > 0 && !ignoreTokens.has(t));

  const isTokenMatch = (tok: string, cid: string, ctype: string, cname: string) => {
    if (cid.includes(tok) || ctype.includes(tok) || cname.includes(tok)) return true;
    if (tok === "left" && (cid.includes("-l") || cid.includes("_l") || cname.includes("left"))) return true;
    if (tok === "right" && (cid.includes("-r") || cid.includes("_r") || cname.includes("right"))) return true;
    if (tok === "arm" && (ctype.includes("arm") || cid.includes("arm"))) return true;
    if (tok === "seat" && (ctype.includes("seat") || cid.includes("seat"))) return true;
    if (tok === "back" && (ctype.includes("back") || cid.includes("back"))) return true;
    return false;
  };

  const matches = fesDocument.components.filter((c) => {
    const cid = c.id.toLowerCase();
    const ctype = c.type.toLowerCase();
    const cname = c.name.toLowerCase();
    return partTokens.length > 0 && partTokens.every((tok) => isTokenMatch(tok, cid, ctype, cname));
  });

  if (matches.length === 0) {
    return {
      binding: null,
      status: "UNRESOLVED_BINDING",
      reason: `No matching FES component found for partId '${partId}'.`,
    };
  }

  if (matches.length > 1) {
    const exact = matches.find((c) => c.id.toLowerCase() === rawPartLower || c.id.toLowerCase() === normalizedPart);
    if (!exact) {
      return {
        binding: null,
        status: "UNRESOLVED_BINDING",
        reason: `Ambiguous match: partId '${partId}' matches multiple components (${matches.map((m) => m.id).join(", ")}).`,
      };
    }
    return {
      binding: {
        partId,
        componentId: exact.id,
        artifactId,
        bindingType,
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

  const matched = matches[0];
  return {
    binding: {
      partId,
      componentId: matched.id,
      artifactId,
      bindingType,
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
