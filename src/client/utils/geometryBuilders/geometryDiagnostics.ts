import type { ComponentObservation, FurnitureEngineeringData } from "../../../shared/fes.js";
import type { GeometrySource } from "../../../shared/geometry.js";

export type { GeometrySource };

export interface ComponentGeometryDiagnostics {
  geometryMode: string;
  geometrySource: GeometrySource;
  frontProfile: string | null;
  sideProfile: string | null;
  topProfile: string | null;
  loftGroup: string | null;
  softGroup: string | null;
  fallback: boolean;
  missingProfiles: string[];
}

/**
 * Computes deterministic component geometry diagnostics without mutating global state.
 * Enforces Truth/Provenance: Only returns workbook_* if actual matching group/profile data exists in FES.
 */
export function evaluateComponentDiagnostics(
  comp: ComponentObservation,
  fes: FurnitureEngineeringData
): ComponentGeometryDiagnostics {
  const mode = comp.geometryMode || "box";
  const frontProf = comp.profiles?.front || null;
  const sideProf = comp.profiles?.side || null;
  const topProf = comp.profiles?.top || null;
  const loftGroup = comp.loftGroup || null;
  const softGroup = comp.softGroup || null;

  const missing: string[] = [];

  let source: GeometrySource = "proxy_fallback";
  let fallback = true;

  // 1. Check workbook_loft: Must have matching loftGroup in fes.loftSections
  const matchingLoftSections = (fes.loftSections || []).filter(
    (ls) => loftGroup && ls.loftGroup === loftGroup
  );
  const hasMatchedLoft = matchingLoftSections.length > 0;

  // 2. Check workbook_soft_surface: Must have matching softGroup in fes.softSurfaceParams
  const matchingSoftParams = (fes.softSurfaceParams || []).filter(
    (sp) => softGroup && sp.softGroup === softGroup
  );
  const hasMatchedSoft = matchingSoftParams.length > 0;

  // 3. Check workbook_profile: Must have profile ID matching cadProfiles or shapeProfiles
  const cadProfiles = fes.cadProfiles || [];
  const shapeProfiles = fes.shapeProfiles || [];
  const compProfileIds = [frontProf, sideProf, topProf].filter(Boolean) as string[];
  const hasMatchedProfile = compProfileIds.some(
    (pid) =>
      cadProfiles.some((cp) => cp.profileId === pid) ||
      shapeProfiles.some((sp) => sp.profileId === pid)
  );

  if (hasMatchedLoft) {
    source = "workbook_loft";
    fallback = false;
  } else if (hasMatchedSoft) {
    source = "workbook_soft_surface";
    fallback = false;
  } else if (hasMatchedProfile) {
    source = "workbook_profile";
    fallback = false;
  } else if (mode === "box" || comp.id.toUpperCase().startsWith("FRAME") || comp.id.toUpperCase().startsWith("BASE") || comp.id.toUpperCase().startsWith("LEG")) {
    source = "box_geometry";
    fallback = false;
  } else {
    source = "proxy_fallback";
    fallback = true;
  }

  return {
    geometryMode: mode,
    geometrySource: source,
    frontProfile: frontProf,
    sideProfile: sideProf,
    topProfile: topProf,
    loftGroup,
    softGroup,
    fallback,
    missingProfiles: missing,
  };
}
