import { z } from "zod";

/**
 * Truth / Provenance levels for furniture engineering data
 */
export type TruthLevel = "PROVIDED" | "AI_ESTIMATED" | "SOLVER_RESOLVED";

export interface EngineeringEstimate<T = number> {
  value: T;
  units: string; // e.g. "mm", "deg", "ratio"
  source: TruthLevel;
  confidence: number; // 0.0 - 1.0
  range?: {
    min: number;
    max: number;
  };
  derivedFrom?: string[];
  productionTruth: boolean;
  notes?: string;
}

export type ReferenceViewType = "hero" | "front" | "side_left" | "side_right" | "top";

export interface ReferenceImage {
  id: string;
  type: ReferenceViewType;
  title: string;
  url?: string;
  widthPx: number;
  heightPx: number;
  calibration?: {
    uScale: number; // mm per u unit (0..1)
    vScale: number; // mm per v unit (0..1)
    originX: number; // mm
    originZ: number; // mm
  };
}

export interface KeypointObservation {
  id: string;
  name: string; // e.g., "front_outer_peak", "left_front"
  u: number; // 0..1 normalized
  v: number; // 0..1 normalized
  confidence: number;
  notes?: string;
}

export interface ContourPoint2D {
  u: number; // 0..1 normalized
  v: number; // 0..1 normalized
}

export interface ContourObservation {
  profileId: string;
  view: "front" | "side" | "top";
  points: ContourPoint2D[];
  source: "vision_estimated";
  confidence: number;
}

export interface ComponentObservation {
  componentIdDraft: string;
  semanticType:
    | "armrest"
    | "cushion_seat"
    | "cushion_back"
    | "pillow"
    | "base_frame"
    | "leg"
    | "support";
  visibleIn: string[]; // reference image IDs
  symmetryGroup?: string; // e.g., "ARM_PAIR", "SEAT_TRIPLE", "BACK_TRIPLE"
  confidence: number;
  accepted?: boolean; // user accept/reject state
  bboxNormalized: {
    uMin: number;
    vMin: number;
    uMax: number;
    vMax: number;
  };
  keypoints: KeypointObservation[];
  contours: ContourObservation[];
  estimatedDimensionsMm?: {
    width: EngineeringEstimate;
    depth: EngineeringEstimate;
    height: EngineeringEstimate;
  };
  relations?: Record<string, unknown>;
}

export interface ReferenceObservationDocument {
  version: "1.0";
  sku: string;
  knownOverallDimensions: {
    width: EngineeringEstimate;
    depth: EngineeringEstimate;
    height: EngineeringEstimate;
  };
  references: ReferenceImage[];
  components: ComponentObservation[];
  createdAt: string;
}

export interface ConstraintResult {
  constraintName: string;
  expression: string;
  residualMm: number;
  satisfied: boolean;
  notes?: string;
}

export interface GeometryInferenceReport {
  sku: string;
  overallWidthMm: EngineeringEstimate;
  overallDepthMm: EngineeringEstimate;
  overallHeightMm: EngineeringEstimate;

  inputCandidates: Record<string, EngineeringEstimate>;
  constraintsApplied: string[];
  resolvedValues: Record<string, EngineeringEstimate>;
  residuals: ConstraintResult[];
  warnings: string[];
  solvedAt: string;
}

export interface FesGeometryDraft {
  sku: string;
  productType: string;
  overallWidth: EngineeringEstimate;
  overallDepth: EngineeringEstimate;
  overallHeight: EngineeringEstimate;

  components: Array<{
    id: string;
    name: string;
    category: string;
    semanticType: string;
    proxyShape: string;
    dimensions: {
      width: EngineeringEstimate;
      depth: EngineeringEstimate;
      height: EngineeringEstimate;
    };
    position: {
      x: EngineeringEstimate;
      y: EngineeringEstimate;
      z: EngineeringEstimate;
    };
    symmetryGroup?: string;
    geometryMode?: string;
    loftGroup?: string;
    softGroup?: string;
    contours: ContourObservation[];
  }>;

  inferenceReport: GeometryInferenceReport;
  loftSections?: import("./fes.js").LoftSection[];
  softSurfaceParams?: import("./fes.js").SoftSurfaceParams[];
}
