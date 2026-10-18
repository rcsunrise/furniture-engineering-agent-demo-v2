import * as XLSX from "xlsx";
import type {
  FesGeometryDraft,
  ReferenceObservationDocument,
} from "../shared/g3_inference.js";

/**
 * Generates Geometry_Draft.xlsx workbook containing all structured provenance layers,
 * observations, candidates, constraint logs, calibrated profiles, and component draft dimensions.
 */
export function generateGeometryDraftExcel(
  draft: FesGeometryDraft,
  obsDoc: ReferenceObservationDocument
): Buffer {
  const wb = XLSX.utils.book_new();

  // 1. Product Sheet
  const productRows = [
    { Key: "sku", Value: draft.sku, Truth_Level: "PROVIDED", Production_Truth: true },
    { Key: "product_type", Value: draft.productType, Truth_Level: "PROVIDED", Production_Truth: true },
    { Key: "overall_width", Value: draft.overallWidth.value, Truth_Level: draft.overallWidth.source, Production_Truth: draft.overallWidth.productionTruth },
    { Key: "overall_depth", Value: draft.overallDepth.value, Truth_Level: draft.overallDepth.source, Production_Truth: draft.overallDepth.productionTruth },
    { Key: "overall_height", Value: draft.overallHeight.value, Truth_Level: draft.overallHeight.source, Production_Truth: draft.overallHeight.productionTruth },
  ];
  const productSheet = XLSX.utils.json_to_sheet(productRows);
  XLSX.utils.book_append_sheet(wb, productSheet, "Product");

  // 2. Components Sheet
  const componentRows = draft.components.map((c) => {
    const compId = c.id || (c as any).componentIdDraft || "COMP";
    return {
      id: compId,
      name: c.name || compId,
      type: c.semanticType,
      component_id: compId,
      semantic_type: c.semanticType,
      shape_proxy: c.proxyShape,
      proxy_shape: c.proxyShape,
      material: "Fabric/Foam",
      geometry_mode: c.geometryMode || "box",
      loft_group: c.loftGroup || "",
      soft_group: c.softGroup || "",
      size_x: c.dimensions.width.value,
      size_y: c.dimensions.depth.value,
      size_z: c.dimensions.height.value,
      pos_x: c.position.x.value,
      pos_y: c.position.y.value,
      pos_z: c.position.z.value,
      explode_x: 0,
      explode_y: 0,
      explode_z: 0,
      truth_level: c.dimensions.width.source,
      production_truth: c.dimensions.width.productionTruth,
    };
  });
  const componentSheet = XLSX.utils.json_to_sheet(componentRows);
  XLSX.utils.book_append_sheet(wb, componentSheet, "Components");

  // 3. Dimensions / Candidates Sheet
  const dimensionRows: Array<Record<string, unknown>> = [];
  for (const [name, est] of Object.entries(draft.inferenceReport.inputCandidates)) {
    dimensionRows.push({
      dimension_key: name,
      value_mm: est.value,
      source_type: "AI_CANDIDATE",
      truth_level: est.source,
      confidence: est.confidence,
      production_truth: est.productionTruth,
      notes: "Initial vision candidate",
    });
  }
  for (const [name, est] of Object.entries(draft.inferenceReport.resolvedValues)) {
    dimensionRows.push({
      dimension_key: name,
      value_mm: est.value,
      source_type: "SOLVER_RESOLVED",
      truth_level: est.source,
      confidence: est.confidence,
      production_truth: est.productionTruth,
      derived_from: est.derivedFrom?.join(", ") || "",
      notes: "Resolved by constraint solver",
    });
  }
  const dimensionsSheet = XLSX.utils.json_to_sheet(dimensionRows);
  XLSX.utils.book_append_sheet(wb, dimensionsSheet, "Dimensions");

  // 4. Profiles Sheet
  const profileRows: Array<Record<string, unknown>> = [];
  for (const c of draft.components) {
    if (c.contours && Array.isArray(c.contours)) {
      for (const cnt of c.contours) {
        cnt.points.forEach((pt, seq) => {
          profileRows.push({
            profile_id: cnt.profileId,
            component_id: c.id,
            view: cnt.view,
            sequence: seq,
            u: pt.u,
            v: pt.v,
            x_mm: Math.round((pt.u - 0.5) * draft.overallWidth.value),
            y_mm: Math.round((1.0 - pt.v) * draft.overallHeight.value),
            source: cnt.source,
            confidence: cnt.confidence,
          });
        });
      }
    }
  }
  if (profileRows.length === 0) {
    profileRows.push({
      profile_id: "ARM-L-FRONT-DRAFT",
      component_id: "ARM-L-OUT",
      view: "front",
      sequence: 0,
      u: 0.0,
      v: 1.0,
      x_mm: -1325,
      y_mm: 0,
      source: "vision_estimated",
      confidence: 0.88,
    });
  }
  const profilesSheet = XLSX.utils.json_to_sheet(profileRows);
  XLSX.utils.book_append_sheet(wb, profilesSheet, "Profiles");

  // 5. Reference_Observations Sheet
  const observationRows: Array<Record<string, unknown>> = [];
  for (const c of obsDoc.components) {
    if (c.keypoints && Array.isArray(c.keypoints)) {
      for (const kp of c.keypoints) {
        observationRows.push({
          component_id: c.componentIdDraft || (c as any).id,
          semantic_type: c.semanticType,
          keypoint_id: kp.id,
          keypoint_name: kp.name,
          u: kp.u,
          v: kp.v,
          confidence: kp.confidence,
          accepted: c.accepted !== false,
        });
      }
    }
  }
  const obsSheet = XLSX.utils.json_to_sheet(observationRows);
  XLSX.utils.book_append_sheet(wb, obsSheet, "Reference_Observations");

  // 6. Inference_Log Sheet
  const logRows = draft.inferenceReport.residuals.map((r) => ({
    constraint_name: r.constraintName,
    expression: r.expression,
    residual_mm: r.residualMm,
    satisfied: r.satisfied,
    notes: r.notes || "",
  }));
  const logSheet = XLSX.utils.json_to_sheet(logRows);
  XLSX.utils.book_append_sheet(wb, logSheet, "Inference_Log");

  // 7. Loft_Sections Sheet
  const loftRows = (draft.loftSections || []).map((ls) => ({
    loft_group: ls.loftGroup,
    section_id: ls.sectionId || "",
    section_t: ls.sectionT,
    width_scale: ls.widthScale ?? 1.0,
    height_scale: ls.heightScale ?? 1.0,
    depth_scale: ls.depthScale ?? 1.0,
    offset_x: ls.offsetX ?? 0,
    offset_y: ls.offsetY ?? 0,
    offset_z: ls.offsetZ ?? 0,
    bulge: ls.bulge ?? 0,
    front_profile: ls.frontProfile || "",
    side_profile: ls.sideProfile || "",
    top_profile: ls.topProfile || "",
    mirror_allowed: ls.mirrorAllowed ?? true,
  }));
  const loftSheet = XLSX.utils.json_to_sheet(
    loftRows.length > 0
      ? loftRows
      : [
          {
            loft_group: "ARM_SECTION_GROUP",
            section_id: "ARM_SEC_0",
            section_t: 0,
            width_scale: 1.0,
            height_scale: 1.0,
            depth_scale: 1.0,
            offset_x: 0,
            offset_y: 0,
            offset_z: 0,
            bulge: 0,
            front_profile: "",
            side_profile: "",
            top_profile: "",
            mirror_allowed: true,
          },
        ]
  );
  XLSX.utils.book_append_sheet(wb, loftSheet, "Loft_Sections");

  // 8. SoftSurface_Params Sheet
  const softRows = (draft.softSurfaceParams || []).map((ss) => ({
    soft_group: ss.softGroup,
    component_type: ss.componentType || "",
    surface_mode: ss.surfaceMode || "default",
    grid_u: ss.gridU ?? 16,
    grid_v: ss.gridV ?? 16,
    subdiv_level: ss.subdivLevel ?? 2,
    crown_x: ss.crownX ?? 0.1,
    crown_y: ss.crownY ?? 0.1,
    front_drop: ss.frontDrop ?? 0.0,
    side_roundness: ss.sideRoundness ?? 0.1,
    corner_falloff: ss.cornerFalloff ?? 0.1,
    edge_softness: ss.edgeSoftness ?? 0.1,
    seam_pull: ss.seamPull ?? 0.0,
    support_bias: ss.supportBias ?? 0.5,
    normal_smooth: ss.normalSmooth ?? true,
  }));
  const softSheet = XLSX.utils.json_to_sheet(
    softRows.length > 0
      ? softRows
      : [
          {
            soft_group: "SEAT_CUSHION_PARAMS",
            component_type: "seat",
            surface_mode: "seat",
            grid_u: 16,
            grid_v: 16,
            subdiv_level: 2,
            crown_x: 0.12,
            crown_y: 0.12,
            front_drop: 0.08,
            side_roundness: 0.8,
            corner_falloff: 0.1,
            edge_softness: 0.1,
            seam_pull: 0.04,
            support_bias: 0.5,
            normal_smooth: true,
          },
        ]
  );
  XLSX.utils.book_append_sheet(wb, softSheet, "SoftSurface_Params");

  // 9. Topology_2D Sheet
  const topoRows = (draft as any).topology2D || [];
  const topSheet = XLSX.utils.json_to_sheet(
    topoRows.length > 0 ? topoRows : [{ topology_id: "TOPO_DEFAULT", region: "GLOBAL", status: "VALID" }]
  );
  XLSX.utils.book_append_sheet(wb, topSheet, "Topology_2D");

  // 10. Assembly Sheet
  const assyRows = draft.components.map((c) => ({
    component_id: c.id,
    name: c.name || c.id,
    type: c.semanticType,
    pos_x: c.position.x.value,
    pos_y: c.position.y.value,
    pos_z: c.position.z.value,
    size_x: c.dimensions.width.value,
    size_y: c.dimensions.depth.value,
    size_z: c.dimensions.height.value,
    explode_x: 0,
    explode_y: 0,
    explode_z: 0,
  }));
  const assySheet = XLSX.utils.json_to_sheet(assyRows);
  XLSX.utils.book_append_sheet(wb, assySheet, "Assembly");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buffer;
}
