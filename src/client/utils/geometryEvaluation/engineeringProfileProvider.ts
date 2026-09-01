import { ProjectionView } from "../../../shared/geometryEvaluation.js";
import { Vector3D } from "../../../shared/meshAlignment.js";

export type GeometrySourceType =
  | "workbook_profile"
  | "workbook_loft"
  | "cad_component_contour"
  | "proxy_fallback";

export interface Point2D {
  x: number;
  y: number;
}

export interface EngineeringProfile2D {
  geometrySource: GeometrySourceType;
  view: ProjectionView;
  contour: Point2D[]; // 2D polygon vertices in mm
  bounds2D: { minX: number; maxX: number; minY: number; maxY: number };
  widthMm: number;
  heightMm: number;
}

export interface ComponentProfileInput {
  id: string;
  size: Vector3D; // mm { x: W, y: D, z: H }
  workbookProfile?: Point2D[];
  workbookLoftGroup?: string;
  cadContour?: Point2D[];
}

/**
 * Resolves engineering reference profile with explicit priority:
 * 1. workbook profile
 * 2. workbook loft projection
 * 3. CAD component contour
 * 4. deterministic proxy fallback
 */
export function getEngineeringProfile(
  component: ComponentProfileInput,
  view: ProjectionView
): EngineeringProfile2D {
  const sizeX = component.size.x || 100;
  const sizeY = component.size.y || 100;
  const sizeZ = component.size.z || 100;

  // 1. Workbook Profile
  if (component.workbookProfile && component.workbookProfile.length >= 3) {
    const contour = component.workbookProfile;
    const bounds = calc2DBounds(contour);
    return {
      geometrySource: "workbook_profile",
      view,
      contour,
      bounds2D: bounds,
      widthMm: bounds.maxX - bounds.minX,
      heightMm: bounds.maxY - bounds.minY,
    };
  }

  // 2. Workbook Loft Projection
  if (component.workbookLoftGroup) {
    const contour = generateBoxContourForView(view, sizeX, sizeY, sizeZ);
    const bounds = calc2DBounds(contour);
    return {
      geometrySource: "workbook_loft",
      view,
      contour,
      bounds2D: bounds,
      widthMm: bounds.maxX - bounds.minX,
      heightMm: bounds.maxY - bounds.minY,
    };
  }

  // 3. CAD Component Contour
  if (component.cadContour && component.cadContour.length >= 3) {
    const contour = component.cadContour;
    const bounds = calc2DBounds(contour);
    return {
      geometrySource: "cad_component_contour",
      view,
      contour,
      bounds2D: bounds,
      widthMm: bounds.maxX - bounds.minX,
      heightMm: bounds.maxY - bounds.minY,
    };
  }

  // 4. Deterministic Proxy Fallback (Bounding Box Rectangle in 2D)
  const contour = generateBoxContourForView(view, sizeX, sizeY, sizeZ);
  const bounds = calc2DBounds(contour);
  return {
    geometrySource: "proxy_fallback",
    view,
    contour,
    bounds2D: bounds,
    widthMm: bounds.maxX - bounds.minX,
    heightMm: bounds.maxY - bounds.minY,
  };
}

function generateBoxContourForView(
  view: ProjectionView,
  x: number,
  y: number,
  z: number
): Point2D[] {
  // Center X/Y in 2D profile space for comparison
  let halfW = 0;
  let halfH = 0;

  switch (view) {
    case "front":
      // X = width ([-x/2, x/2]), Y = height ([0, z])
      halfW = x / 2;
      halfH = z / 2;
      break;
    case "side":
      // X = depth ([-y/2, y/2]), Y = height ([0, z])
      halfW = y / 2;
      halfH = z / 2;
      break;
    case "top":
      // X = width ([-x/2, x/2]), Y = depth ([-y/2, y/2])
      halfW = x / 2;
      halfH = y / 2;
      break;
  }

  return [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ];
}

function calc2DBounds(contour: Point2D[]) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const pt of contour) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  return { minX, maxX, minY, maxY };
}
