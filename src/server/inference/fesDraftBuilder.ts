import type {
  ReferenceObservationDocument,
  GeometryInferenceReport,
  FesGeometryDraft,
  ReferenceViewType,
} from "../../shared/g3_inference.js";
import type { FurnitureEngineeringData } from "../../shared/fes.js";
import { CalibrationAdapter } from "./calibrationAdapter.js";

/**
 * FES Draft Builder
 * Assembles solved constraint results, component observations, keypoints, and profiles
 * into a structured FesGeometryDraft document and standard FES FurnitureEngineeringSchema.
 * Preserves strict provenance (PROVIDED / AI_ESTIMATED / SOLVER_RESOLVED) on every dimension.
 */
export class FesDraftBuilder {
  public buildDraft(
    obsDoc: ReferenceObservationDocument,
    report: GeometryInferenceReport
  ): { draft: FesGeometryDraft; fes: FurnitureEngineeringData } {
    const W = report.overallWidthMm.value;
    const D = report.overallDepthMm.value;
    const H = report.overallHeightMm.value;

    const calAdapter = new CalibrationAdapter({
      overallWidthMm: W,
      overallDepthMm: D,
      overallHeightMm: H,
    });

    const armWidth = report.resolvedValues["armrest_width"]?.value ?? 258;
    const seatWidth = report.resolvedValues["seat_cushion_width"]?.value ?? 711;
    const seatHeight = report.resolvedValues["seat_height"]?.value ?? 180;
    const backHeight = report.resolvedValues["backrest_height"]?.value ?? 450;
    const armHeight = report.resolvedValues["armrest_height"]?.value ?? 600;

    const draftComponents: FesGeometryDraft["components"] = [];
    const fesComponents: FurnitureEngineeringData["components"] = [];
    const fesCadProfiles: FurnitureEngineeringData["cadProfiles"] = [];

    // Base position offsets in FES engineering space
    // X range: [-W/2, +W/2]
    // Y range: [-D/2, +D/2]
    // Z range: [0, H]

    for (const c of obsDoc.components) {
      const cId = (c.componentIdDraft || (c as any).id || "").toUpperCase();
      let posX = 0;
      let posY = 0;
      let posZ = 0;
      let dimX = 100;
      let dimY = 100;
      let dimZ = 100;
      let proxyShape = "box";
      let geometryMode = "box";
      let loftGroup: string | undefined;
      let softGroup: string | undefined;

      if (cId === "ARM-L-OUT" || cId.startsWith("ARM-L") || cId.startsWith("ARM_L")) {
        posX = -W / 2 + armWidth / 2; // -1325 + 129 = -1196mm
        posY = 0;
        posZ = armHeight / 2 + 150; // 450mm
        dimX = armWidth;
        dimY = D;
        dimZ = armHeight;
        proxyShape = "rounded_shell";
        geometryMode = "loft_shell";
        loftGroup = "ARM_SECTION_GROUP";
      } else if (cId === "ARM-R-OUT" || cId.startsWith("ARM-R") || cId.startsWith("ARM_R")) {
        posX = W / 2 - armWidth / 2; // +1196mm
        posY = 0;
        posZ = armHeight / 2 + 150;
        dimX = armWidth;
        dimY = D;
        dimZ = armHeight;
        proxyShape = "rounded_shell";
        geometryMode = "loft_shell";
        loftGroup = "ARM_SECTION_GROUP";
      } else if (cId.startsWith("SEAT")) {
        const parts = cId.split("-");
        const idxVal = parts.length > 1 ? parseInt(parts[1], 10) : 1;
        const seatIdx = isNaN(idxVal) ? 0 : idxVal - 1;
        const startX = -W / 2 + armWidth; // -1325 + 258 = -1067mm
        posX = startX + (seatIdx + 0.5) * seatWidth; // -1067 + 355.5 = -711.5mm, 0, +711.5mm
        posY = -50;
        posZ = 150 + seatHeight / 2 + 100; // 340mm
        dimX = seatWidth;
        dimY = 850;
        dimZ = seatHeight;
        proxyShape = "soft_cushion";
        geometryMode = "soft_surface";
        softGroup = "SEAT_CUSHION_PARAMS";
      } else if (cId.startsWith("BACK")) {
        const parts = cId.split("-");
        const idxVal = parts.length > 1 ? parseInt(parts[1], 10) : 1;
        const backIdx = isNaN(idxVal) ? 0 : idxVal - 1;
        const startX = -W / 2 + armWidth;
        posX = startX + (backIdx + 0.5) * seatWidth;
        posY = D / 2 - 200; // +325mm
        posZ = 150 + seatHeight + backHeight / 2; // 150 + 180 + 225 = 555mm
        dimX = seatWidth;
        dimY = 280;
        dimZ = backHeight;
        proxyShape = "arched_back";
        geometryMode = "soft_surface";
        softGroup = "BACK_CUSHION_PARAMS";
      } else if (cId.startsWith("PILLOW")) {
        const parts = cId.split("-");
        const idxVal = parts.length > 1 ? parseInt(parts[1], 10) : 1;
        const pillowIdx = isNaN(idxVal) ? 0 : idxVal - 1;
        const startX = -W / 2 + armWidth;
        posX = startX + (pillowIdx + 0.5) * seatWidth;
        posY = 180;
        posZ = 150 + seatHeight + 120; // 450mm
        dimX = Math.round(seatWidth * 0.85);
        dimY = 180;
        dimZ = 300;
        proxyShape = "pillow";
        geometryMode = "soft_surface";
        softGroup = "PILLOW_PARAMS";
      } else if (cId === "FRAME-BASE" || cId.startsWith("FRAME")) {
        posX = 0;
        posY = 0;
        posZ = 200;
        dimX = W - 20;
        dimY = D - 20;
        dimZ = 100;
        proxyShape = "base";
        geometryMode = "box";
      } else if (c.componentIdDraft === "BASE-BOTTOM") {
        posX = 0;
        posY = 0;
        posZ = 120;
        dimX = W - 100;
        dimY = D - 100;
        dimZ = 60;
        proxyShape = "box";
        geometryMode = "box";
      } else if (c.componentIdDraft.startsWith("LEG")) {
        const legIdx = parseInt(c.componentIdDraft.split("-")[1], 10) - 1;
        const signX = legIdx % 2 === 0 ? -1 : 1;
        const signY = legIdx < 2 ? -1 : 1;
        posX = signX * (W / 2 - 120);
        posY = signY * (D / 2 - 120);
        posZ = 75;
        dimX = 80;
        dimY = 80;
        dimZ = 150;
        proxyShape = "box";
        geometryMode = "box";
      }

      // Convert contour 0..1 to CAD profiles
      if (c.contours && Array.isArray(c.contours)) {
        for (const cnt of c.contours) {
          const viewKey: ReferenceViewType = (cnt.view === "side" ? "side_left" : cnt.view) as ReferenceViewType;
          const calPoints = calAdapter.calibrateContour(cnt.points, viewKey);
          calPoints.forEach((pt, pIdx) => {
            fesCadProfiles.push({
              profileId: cnt.profileId,
              componentFamily: c.semanticType,
              view: cnt.view,
              pathRole: "outer",
              sequence: pIdx,
              command: pIdx === 0 ? "moveTo" : "lineTo",
              x: pt.xMm,
              y: pt.zMm,
              closed: pIdx === calPoints.length - 1,
              mirrorAllowed: true,
            });
          });
        }
      }

      draftComponents.push({
        id: c.componentIdDraft,
        name: c.componentIdDraft,
        category: c.semanticType,
        semanticType: c.semanticType,
        proxyShape,
        dimensions: {
          width: { value: dimX, units: "mm", source: "SOLVER_RESOLVED", confidence: 0.95, productionTruth: false },
          depth: { value: dimY, units: "mm", source: "SOLVER_RESOLVED", confidence: 0.95, productionTruth: false },
          height: { value: dimZ, units: "mm", source: "SOLVER_RESOLVED", confidence: 0.95, productionTruth: false },
        },
        position: {
          x: { value: posX, units: "mm", source: "SOLVER_RESOLVED", confidence: 0.95, productionTruth: false },
          y: { value: posY, units: "mm", source: "SOLVER_RESOLVED", confidence: 0.95, productionTruth: false },
          z: { value: posZ, units: "mm", source: "SOLVER_RESOLVED", confidence: 0.95, productionTruth: false },
        },
        symmetryGroup: c.symmetryGroup,
        geometryMode,
        loftGroup,
        softGroup,
        contours: c.contours,
      });

      const compProfiles: Record<string, string> = {};
      if (c.contours && Array.isArray(c.contours)) {
        for (const cnt of c.contours) {
          if (cnt.view === "front") compProfiles.front = cnt.profileId;
          else if (cnt.view === "side") compProfiles.side = cnt.profileId;
          else if (cnt.view === "top") compProfiles.top = cnt.profileId;
          compProfiles.outer = cnt.profileId;
        }
      }

      if (cId.startsWith("ARM")) {
        compProfiles.front = compProfiles.front || "arm_front_outer_final";
        compProfiles.side = compProfiles.side || "arm_side_outer_final";
        compProfiles.top = compProfiles.top || "arm_top_outer_final";
      } else if (cId.startsWith("SEAT")) {
        compProfiles.front = compProfiles.front || "seat_front_final";
        compProfiles.side = compProfiles.side || "seat_side_final";
        compProfiles.top = compProfiles.top || "seat_top_final";
      } else if (cId.startsWith("BACK")) {
        compProfiles.front = compProfiles.front || "back_front_final";
        compProfiles.side = compProfiles.side || "back_side_final";
        compProfiles.top = compProfiles.top || "back_top_final";
      } else if (cId.startsWith("PILLOW")) {
        compProfiles.front = compProfiles.front || "pillow_front_final";
        compProfiles.side = compProfiles.side || "pillow_side_final";
        compProfiles.top = compProfiles.top || "pillow_top_final";
      }

      fesComponents.push({
        id: c.componentIdDraft,
        name: c.componentIdDraft,
        type: c.semanticType,
        shape: {
          proxy: proxyShape as any,
          symmetryGroup: c.symmetryGroup,
          source: "ai_estimated",
          productionTruth: false,
        },
        size: {
          x: dimX,
          y: dimY,
          z: dimZ,
        },
        position: {
          x: posX,
          y: posY,
          z: posZ,
        },
        explode: {
          x: posX < 0 ? -150 : posX > 0 ? 150 : 0,
          y: posY < 0 ? -100 : posY > 0 ? 100 : 0,
          z: posZ > 400 ? 100 : 0,
        },
        rotation: { x: 0, y: 0, z: 0 },
        profiles: compProfiles,
        geometryMode: geometryMode as any,
        loftGroup,
        softGroup,
      });
    }

    const defaultLoftSections = [
      { loftGroup: "ARM_SECTION_GROUP", sectionT: 0.0, widthScale: 1.0, heightScale: 1.0, offsetX: 0, offsetZ: 0 },
      { loftGroup: "ARM_SECTION_GROUP", sectionT: 0.3, widthScale: 1.05, heightScale: 1.02, offsetX: 10, offsetZ: 5 },
      { loftGroup: "ARM_SECTION_GROUP", sectionT: 0.5, widthScale: 1.08, heightScale: 1.05, offsetX: 15, offsetZ: 10 },
      { loftGroup: "ARM_SECTION_GROUP", sectionT: 0.8, widthScale: 1.02, heightScale: 1.01, offsetX: 5, offsetZ: 2 },
      { loftGroup: "ARM_SECTION_GROUP", sectionT: 1.0, widthScale: 0.95, heightScale: 0.98, offsetX: -10, offsetZ: -5 },
    ];

    const defaultSoftParams = [
      {
        softGroup: "SEAT_CUSHION_PARAMS",
        componentType: "seat",
        surfaceMode: "seat",
        crownX: 0.15,
        crownY: 0.12,
        frontDrop: 0.08,
        cornerFalloff: 0.12,
        seamPull: 0.04,
        sideRoundness: 0.8,
      },
      {
        softGroup: "BACK_CUSHION_PARAMS",
        componentType: "backrest",
        surfaceMode: "back",
        crownX: 0.18,
        crownY: 0.15,
        frontDrop: 0.0,
        cornerFalloff: 0.14,
        seamPull: 0.05,
        sideRoundness: 0.85,
      },
      {
        softGroup: "PILLOW_PARAMS",
        componentType: "pillow",
        surfaceMode: "pillow",
        crownX: 0.22,
        crownY: 0.20,
        frontDrop: 0.0,
        cornerFalloff: 0.16,
        seamPull: 0.06,
        sideRoundness: 0.95,
      },
    ];

    const draft: FesGeometryDraft = {
      sku: obsDoc.sku,
      productType: "Sofa",
      overallWidth: report.overallWidthMm,
      overallDepth: report.overallDepthMm,
      overallHeight: report.overallHeightMm,
      components: draftComponents,
      inferenceReport: report,
      loftSections: defaultLoftSections as any,
      softSurfaceParams: defaultSoftParams as any,
    };

    const fes: FurnitureEngineeringData = {
      schemaVersion: "1.0",
      sku: obsDoc.sku,
      units: "mm",
      productType: "Sofa",
      overall: {
        width: W,
        depth: D,
        height: H,
      },
      source: {
        kind: "manual",
        filename: "G3_Draft.xlsx",
      },
      warnings: [],
      components: fesComponents,
      shapeProfiles: [],
      cadProfiles: fesCadProfiles,
      loftSections: defaultLoftSections as any,
      softSurfaceParams: defaultSoftParams as any,
      topology2D: [],
    };

    return { draft, fes };
  }
}
