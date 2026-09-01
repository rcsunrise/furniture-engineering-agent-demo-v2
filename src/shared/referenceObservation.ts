export interface ReferenceView {
  id: string;
  type: "hero" | "front" | "side_left" | "side_right" | "top";
  widthPx: number;
  heightPx: number;
  url?: string;
  calibration?: {
    knownWidthMm?: number;
    knownHeightMm?: number;
    originX?: number;
    originZ?: number;
  };
}

export interface ViewObservation {
  bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  keypoints: {
    id: string;
    u: number;
    v: number;
    confidence: number;
  }[];
  contour: {
    u: number;
    v: number;
  }[];
}

export interface ReferenceComponentObservation {
  draftId: string;
  semanticType:
    | "armrest"
    | "seat"
    | "backrest"
    | "pillow"
    | "frame"
    | "base"
    | "leg"
    | "unknown";
  confidence: number;
  symmetryGroup?: string;
  visibleIn: string[];
  views: {
    front?: ViewObservation;
    side?: ViewObservation;
    top?: ViewObservation;
  };
}

export interface ReferenceObservationDocument {
  version: "1.0";
  sku: string;
  references: ReferenceView[];
  components: ReferenceComponentObservation[];
}
