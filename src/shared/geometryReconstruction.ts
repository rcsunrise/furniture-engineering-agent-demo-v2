import { z } from "zod";
import { DataProvenanceSchema, sanitizeProvenance, type DataProvenance } from "./provenance.js";
import type { FESComponent, FESDocument } from "./fes.js";

// ==================================================
// RECONSTRUCTION METHOD & CAPABILITY MATRIX
// ==================================================

export const GeometryReconstructionMethodSchema = z.enum([
  "profile_reconstruction",
  "loft_reconstruction",
  "soft_surface_reconstruction",
  "mesh_parametric_fitting",
  "hybrid",
]);

export type GeometryReconstructionMethod = z.infer<typeof GeometryReconstructionMethodSchema>;

export type CapabilityLevel = "supported" | "preferred" | "optional" | "limited" | "unsupported";

export const COMPONENT_TYPE_CAPABILITY_MATRIX: Record<
  string,
  Record<GeometryReconstructionMethod, CapabilityLevel>
> = {
  armrest: {
    profile_reconstruction: "supported",
    loft_reconstruction: "supported",
    soft_surface_reconstruction: "supported",
    mesh_parametric_fitting: "supported",
    hybrid: "supported",
  },
  arm: {
    profile_reconstruction: "supported",
    loft_reconstruction: "supported",
    soft_surface_reconstruction: "supported",
    mesh_parametric_fitting: "supported",
    hybrid: "supported",
  },
  seat: {
    profile_reconstruction: "supported",
    loft_reconstruction: "optional",
    soft_surface_reconstruction: "preferred",
    mesh_parametric_fitting: "supported",
    hybrid: "supported",
  },
  backrest: {
    profile_reconstruction: "supported",
    loft_reconstruction: "optional",
    soft_surface_reconstruction: "preferred",
    mesh_parametric_fitting: "supported",
    hybrid: "supported",
  },
  back: {
    profile_reconstruction: "supported",
    loft_reconstruction: "optional",
    soft_surface_reconstruction: "preferred",
    mesh_parametric_fitting: "supported",
    hybrid: "supported",
  },
  frame: {
    profile_reconstruction: "limited",
    loft_reconstruction: "unsupported",
    soft_surface_reconstruction: "unsupported",
    mesh_parametric_fitting: "supported",
    hybrid: "limited",
  },
  leg: {
    profile_reconstruction: "supported",
    loft_reconstruction: "limited",
    soft_surface_reconstruction: "unsupported",
    mesh_parametric_fitting: "preferred",
    hybrid: "supported",
  },
};

export function getComponentCapabilities(
  componentType: string
): Record<GeometryReconstructionMethod, CapabilityLevel> {
  const normalizedType = componentType.toLowerCase();
  for (const [key, value] of Object.entries(COMPONENT_TYPE_CAPABILITY_MATRIX)) {
    if (normalizedType.includes(key)) {
      return value;
    }
  }
  return {
    profile_reconstruction: "supported",
    loft_reconstruction: "optional",
    soft_surface_reconstruction: "optional",
    mesh_parametric_fitting: "supported",
    hybrid: "supported",
  };
}

// ==================================================
// CANONICAL INPUT CONTRACT
// ==================================================

export const GeometryReconstructionRequestSchema = z.object({
  requestId: z.string(),
  sessionId: z.string(),
  workspaceId: z.string().default("default-workspace"),
  sku: z.string(),
  canonicalComponentId: z.string(),
  referenceMeshArtifactId: z.string().optional(),
  fesDocumentId: z.string(),
  requestedMethod: GeometryReconstructionMethodSchema,

  existingGeometry: z
    .object({
      frontProfileId: z.string().optional(),
      sideProfileId: z.string().optional(),
      topProfileId: z.string().optional(),
      loftGroupId: z.string().optional(),
      softSurfaceGroupId: z.string().optional(),
      topologyId: z.string().optional(),
    })
    .optional(),

  targetDimensions: z.object({
    sizeX: z.number(),
    sizeY: z.number(),
    sizeZ: z.number(),
    positionX: z.number().optional(),
    positionY: z.number().optional(),
    positionZ: z.number().optional(),
    rotationX: z.number().optional(),
    rotationY: z.number().optional(),
    rotationZ: z.number().optional(),
  }),

  provenance: DataProvenanceSchema,
});

export type GeometryReconstructionRequest = z.infer<typeof GeometryReconstructionRequestSchema>;

// ==================================================
// RECONSTRUCTION CONTEXT & READINESS CONTRACT
// ==================================================

export interface GeometryReconstructionContext {
  sessionId: string;
  workspaceId: string;
  sku: string;
  canonicalComponentId: string;

  component: {
    id: string;
    type: string;
    material?: string;
    sizeX: number;
    sizeY: number;
    sizeZ: number;
    posX: number;
    posY: number;
    posZ: number;
    rotationX: number;
    rotationY: number;
    rotationZ: number;
  };

  referenceMesh?: {
    artifactId: string;
    url?: string;
    geometrySource: string;
    productionTruth: false;
    normalizedBounds?: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
    alignedBounds?: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
  };

  engineeringGeometry?: {
    frontProfile?: any;
    sideProfile?: any;
    topProfile?: any;
    loftSections?: any[];
    softSurface?: any;
    topology?: any;
  };

  truthState: {
    isComponentResolved: boolean;
    hasProvidedDimensions: boolean;
    hasEngineeringProfiles: boolean;
    hasEngineeringLoft: boolean;
    hasEngineeringSoftSurface: boolean;
    hasEngineeringTopology: boolean;
    hasReferenceMesh: boolean;
    hasProxyOnly: boolean;
  };
}

export type ReconstructionReadinessStatus =
  | "READY"
  | "READY_WITH_LIMITATIONS"
  | "BLOCKED_MISSING_FES"
  | "BLOCKED_COMPONENT_UNRESOLVED"
  | "BLOCKED_MISSING_DIMENSIONS"
  | "BLOCKED_MISSING_REFERENCE"
  | "BLOCKED_IDENTITY_MISMATCH"
  | "BLOCKED_MISSING_PROFILE_SOURCE";

export interface ReconstructionReadinessResult {
  status: ReconstructionReadinessStatus;
  reasons: string[];
  availableMethods: GeometryReconstructionMethod[];
}

export function evaluateReconstructionReadiness(
  context: GeometryReconstructionContext | null | undefined,
  requestedMethod: GeometryReconstructionMethod
): ReconstructionReadinessResult {
  const reasons: string[] = [];
  const availableMethods: GeometryReconstructionMethod[] = [];

  if (!context) {
    return {
      status: "BLOCKED_MISSING_FES",
      reasons: ["No active EngineeringContext found for current session."],
      availableMethods: [],
    };
  }

  if (!context.truthState?.isComponentResolved || !context.component || !context.component.id) {
    return {
      status: "BLOCKED_COMPONENT_UNRESOLVED",
      reasons: [`Target component '${context?.canonicalComponentId || "UNKNOWN"}' was not resolved in FES.`],
      availableMethods: [],
    };
  }

  const caps = getComponentCapabilities(context.component.type);
  if (caps.profile_reconstruction !== "unsupported") availableMethods.push("profile_reconstruction");
  if (caps.loft_reconstruction !== "unsupported") availableMethods.push("loft_reconstruction");
  if (caps.soft_surface_reconstruction !== "unsupported") availableMethods.push("soft_surface_reconstruction");
  if (caps.mesh_parametric_fitting !== "unsupported") availableMethods.push("mesh_parametric_fitting");
  availableMethods.push("hybrid");

  if (!context.truthState.hasProvidedDimensions) {
    reasons.push("Component size dimensions are zero or unprovided.");
    return {
      status: "BLOCKED_MISSING_DIMENSIONS",
      reasons,
      availableMethods,
    };
  }

  if (requestedMethod === "mesh_parametric_fitting" && !context.truthState.hasReferenceMesh) {
    reasons.push("Requested method 'mesh_parametric_fitting' requires a valid AI reference mesh artifact.");
    return {
      status: "BLOCKED_MISSING_REFERENCE",
      reasons,
      availableMethods,
    };
  }

  if (requestedMethod === "loft_reconstruction" && !context.truthState.hasEngineeringProfiles && !context.truthState.hasReferenceMesh) {
    reasons.push("Requested method 'loft_reconstruction' requires profile sources or a reference mesh projection.");
    return {
      status: "BLOCKED_MISSING_PROFILE_SOURCE",
      reasons,
      availableMethods,
    };
  }

  if (context.truthState.hasProxyOnly) {
    reasons.push("Session relies purely on proxy fallback geometries. Reconstruction operates with reference limitations.");
    return {
      status: "READY_WITH_LIMITATIONS",
      reasons,
      availableMethods,
    };
  }

  return {
    status: "READY",
    reasons: ["All contract prerequisites satisfied for geometry reconstruction."],
    availableMethods,
  };
}

// ==================================================
// PROFILE CANDIDATE CONTRACT (FES_MM SPACE ONLY)
// ==================================================

export const GeometryProfileCandidateSchema = z.object({
  profileId: z.string(),
  view: z.enum(["front", "side", "top"]),
  coordinateSpace: z.literal("FES_MM"),
  closed: z.boolean().default(true),
  points: z.array(
    z.object({
      u: z.number(),
      v: z.number(),
      coord1Mm: z.number(),
      coord2Mm: z.number(),
    })
  ),
  source: z.enum(["engineering_profile", "mesh_projection", "image_inference", "derived", "proxy"]),
  confidence: z.number().min(0).max(1).default(0.5),
  productionTruth: z.literal(false).default(false),
  rawPointCount: z.number().optional(),
  cleanPointCount: z.number().optional(),
  simplifiedPointCount: z.number().optional(),
  winding: z.enum(["CCW", "CW"]).default("CCW").optional(),
  sourceBounds: z
    .object({
      min1: z.number(),
      max1: z.number(),
      min2: z.number(),
      max2: z.number(),
      span1: z.number(),
      span2: z.number(),
    })
    .optional(),
  targetBounds: z
    .object({
      size1: z.number(),
      size2: z.number(),
    })
    .optional(),
  reconstructionDiagnostics: z.record(z.string(), z.any()).optional(),
});

export type GeometryProfileCandidate = z.infer<typeof GeometryProfileCandidateSchema>;

// ==================================================
// LOFT CANDIDATE CONTRACT
// ==================================================

export const LoftGeometryCandidateSchema = z.object({
  loftGroupId: z.string(),
  axis: z.enum(["X", "Y", "Z"]),
  sections: z.array(
    z.object({
      sectionId: z.string(),
      sectionT: z.number(),
      profileId: z.string().optional(),
      widthScale: z.number().default(1),
      heightScale: z.number().default(1),
      depthScale: z.number().default(1),
      offsetX: z.number().default(0),
      offsetY: z.number().default(0),
      offsetZ: z.number().default(0),
      bulge: z.number().optional(),
    })
  ),
  source: z.enum(["engineering_loft", "mesh_derived", "hybrid"]),
  confidence: z.number().min(0).max(1).default(0.5),
  productionTruth: z.literal(false).default(false),
});

export type LoftGeometryCandidate = z.infer<typeof LoftGeometryCandidateSchema>;

// ==================================================
// SOFT SURFACE CANDIDATE CONTRACT
// ==================================================

export const SoftSurfaceGeometryCandidateSchema = z.object({
  softGroupId: z.string(),
  surfaceMode: z.string().default("cushion_dome"),
  gridU: z.number().default(16),
  gridV: z.number().default(16),
  subdivision: z.number().default(2),
  crownX: z.number().default(12),
  crownY: z.number().default(15),
  frontDrop: z.number().default(8),
  sideRoundness: z.number().default(10),
  cornerFalloff: z.number().default(6),
  edgeSoftness: z.number().default(5),
  seamPull: z.number().default(2),
  supportBias: z.number().default(0.5),
  source: z.enum(["engineering_soft_surface", "mesh_derived", "hybrid"]),
  confidence: z.number().min(0).max(1).default(0.5),
  productionTruth: z.literal(false).default(false),
});

export type SoftSurfaceGeometryCandidate = z.infer<typeof SoftSurfaceGeometryCandidateSchema>;

// ==================================================
// TOPOLOGY CANDIDATE CONTRACT
// ==================================================

export const TopologyCandidateSchema = z.object({
  topologyId: z.string(),
  componentFamily: z.string(),
  views: z.array(
    z.object({
      view: z.enum(["front", "side", "top"]),
      wireRole: z.string(),
      profileId: z.string(),
      closed: z.boolean().default(true),
      edgeCount: z.number(),
    })
  ),
  source: z.enum(["engineering_topology", "derived_topology"]),
  confidence: z.number().min(0).max(1).default(0.5),
  productionTruth: z.literal(false).default(false),
});

export type TopologyCandidate = z.infer<typeof TopologyCandidateSchema>;

// ==================================================
// FIT METRICS CONTRACT (Reuses G4-4D Terminology)
// ==================================================

export const GeometryFitMetricsSchema = z.object({
  dimensionResidual: z.object({
    xMm: z.number(),
    yMm: z.number(),
    zMm: z.number(),
    xPct: z.number(),
    yPct: z.number(),
    zPct: z.number(),
  }),
  silhouette: z
    .object({
      frontIoU: z.number().optional(),
      sideIoU: z.number().optional(),
      topIoU: z.number().optional(),
    })
    .optional(),
  contourDistance: z
    .object({
      meanMm: z.number().optional(),
      p95Mm: z.number().optional(),
      maxMm: z.number().optional(),
    })
    .optional(),
  landmarkResidual: z
    .object({
      meanMm: z.number().optional(),
      maxMm: z.number().optional(),
    })
    .optional(),
  meshFit: z
    .object({
      meanDistanceMm: z.number().optional(),
      p95DistanceMm: z.number().optional(),
      maxDistanceMm: z.number().optional(),
    })
    .optional(),
});

export type GeometryFitMetrics = z.infer<typeof GeometryFitMetricsSchema>;

// ==================================================
// GEOMETRY QUALITY ASSESSMENT
// ==================================================

export const QualityLevelSchema = z.enum([
  "insufficient",
  "proxy",
  "reference_low",
  "reference_medium",
  "candidate_high",
  "engineering_verified",
]);

export type QualityLevel = z.infer<typeof QualityLevelSchema>;

export const GeometryQualityAssessmentSchema = z.object({
  overallScore: z.number().min(0).max(1),
  dimensionScore: z.number().min(0).max(1),
  silhouetteScore: z.number().min(0).max(1).optional(),
  contourScore: z.number().min(0).max(1).optional(),
  topologyScore: z.number().min(0).max(1).optional(),
  sourceQualityScore: z.number().min(0).max(1),
  level: QualityLevelSchema,
  gateEligible: z.boolean().default(false),
  reasons: z.array(z.string()).default([]),
});

export type GeometryQualityAssessment = z.infer<typeof GeometryQualityAssessmentSchema>;

// ==================================================
// CANONICAL OUTPUT CONTRACT: EngineeringGeometryCandidate
// ==================================================

export const ReviewStatusSchema = z.enum([
  "draft",
  "evaluation_required",
  "review_required",
  "accepted_as_candidate",
  "rejected",
]);

export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const EngineeringGeometryCandidateSchema = z.object({
  id: z.string(),
  candidateId: z.string().optional(),
  sessionId: z.string(),
  workspaceId: z.string().default("default-workspace"),
  sku: z.string(),
  canonicalComponentId: z.string(),
  referenceMeshArtifactId: z.string().optional(),
  reconstructionMethod: GeometryReconstructionMethodSchema,

  sourceGeometry: z.object({
    referenceMeshArtifactId: z.string().optional(),
    inputProfileIds: z.array(z.string()).optional(),
    inputLoftGroupId: z.string().optional(),
    inputSoftSurfaceGroupId: z.string().optional(),
    inputTopologyId: z.string().optional(),
  }),

  profiles: z
    .object({
      front: GeometryProfileCandidateSchema.optional(),
      side: GeometryProfileCandidateSchema.optional(),
      top: GeometryProfileCandidateSchema.optional(),
    })
    .optional(),

  loft: LoftGeometryCandidateSchema.optional(),
  softSurface: SoftSurfaceGeometryCandidateSchema.optional(),
  topology: TopologyCandidateSchema.optional(),

  bounds: z.object({
    minX: z.number(),
    minY: z.number(),
    minZ: z.number(),
    maxX: z.number(),
    maxY: z.number(),
    maxZ: z.number(),
    sizeX: z.number(),
    sizeY: z.number(),
    sizeZ: z.number(),
  }),

  targetDimensions: z.object({
    sizeX: z.number(),
    sizeY: z.number(),
    sizeZ: z.number(),
  }),

  fitMetrics: GeometryFitMetricsSchema,
  quality: GeometryQualityAssessmentSchema,
  provenance: DataProvenanceSchema,

  productionTruth: z.literal(false).default(false),
  productionEligible: z.literal(false).default(false),

  reviewStatus: ReviewStatusSchema.default("draft"),
  createdAt: z.string().default(() => new Date().toISOString()),
});

export type EngineeringGeometryCandidate = z.infer<typeof EngineeringGeometryCandidateSchema>;

// ==================================================
// GEOMETRY SOURCE PRIORITY CONSTANTS
// ==================================================

export const GEOMETRY_SOURCE_PRIORITY = [
  "verified_engineering_profile",
  "verified_engineering_loft",
  "verified_engineering_soft_surface",
  "verified_cad_contour",
  "reconstructed_candidate",
  "ai_reference_mesh",
  "proxy_fallback",
] as const;

export type GeometrySourcePriorityRank = typeof GEOMETRY_SOURCE_PRIORITY[number];
