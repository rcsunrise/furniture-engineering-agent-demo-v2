export type CadLayerId =
  | "PRODUCT_OUTLINE"
  | "COMPONENT_OUTLINE"
  | "INNER_CONTOUR"
  | "SEAM"
  | "PIPING"
  | "MODULE_DIVIDER"
  | "DIMENSION"
  | "ANNOTATION"
  | "COMPONENT";

export interface CadLayer {
  id: string;
  visible: boolean;
}

export interface CadBounds {
  minX: number;
  maxX: number;
  minY: number; // min coordinate along vertical axis in mm
  maxY: number; // max coordinate along vertical axis in mm
}

export type PathCommand =
  | { type: "moveTo"; x: number; y: number }
  | { type: "lineTo"; x: number; y: number }
  | { type: "quadraticTo"; cpx: number; cpy: number; x: number; y: number }
  | { type: "cubicTo"; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number }
  | { type: "close" };

export type CadLineRole =
  | "outer"
  | "inner"
  | "seam"
  | "piping"
  | "structural"
  | "divider"
  | "hidden";

export type PathRole = CadLineRole;

export type CadEntity =
  | {
      type: "line";
      id: string;
      layer: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | {
      type: "rect";
      id: string;
      layer: string;
      x: number;
      y: number;
      width: number;
      height: number;
      componentId?: string;
      componentType?: string;
      sourceEntityId?: string;
    }
  | {
      type: "path";
      id: string;
      layer: string;
      pathRole?: CadLineRole;
      role?: CadLineRole;
      commands: PathCommand[];
      componentId?: string;
      componentType?: string;
      sourceEntityId?: string;
      profileFallback?: boolean;
      geometrySource?: string;
      matchedProfileId?: string;
      source?: string;
    }
  | {
      type: "text";
      id: string;
      layer: string;
      x: number;
      y: number;
      text: string;
    }
  | {
      type: "dimension";
      id: string;
      layer: string;
      axis: "x" | "z" | "y";
      from: { x: number; y: number };
      to: { x: number; y: number };
      value: number;
      units: "mm";
      label: string;
    };

export interface CadDocument {
  version: "1.0";
  units: "mm";
  view: "front" | "side" | "top";
  sourceSku: string;
  bounds: CadBounds;
  layers: CadLayer[];
  entities: CadEntity[];
  profileFallback?: boolean;
  metadata?: Record<string, unknown>;
}
