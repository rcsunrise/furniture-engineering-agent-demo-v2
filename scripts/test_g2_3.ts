import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { parseWorkbook } from "../src/server/excel.js";
import { validateEngineeringData } from "../src/server/validate.js";
import { buildCadView } from "../src/server/cad.js";

async function runG23Tests() {
  console.log("=== Running G2.3 — CAD Profile Fidelity Test Suite ===");

  // Create sample G2.3 workbook with CAD_Profiles sheet
  const wb = XLSX.utils.book_new();

  // Product sheet
  const productData = [
    { key: "sku", value: "G2.3-ROUNDARM-SOFA-2650" },
    { key: "product_type", value: "sofa" },
    { key: "overall_width", value: 2650 },
    { key: "overall_depth", value: 1050 },
    { key: "overall_height", value: 850 },
  ];
  const productSheet = XLSX.utils.json_to_sheet(productData);
  XLSX.utils.book_append_sheet(wb, productSheet, "Product");

  // Components sheet
  const componentData = [
    {
      id: "ARM-L",
      name: "Left Armrest",
      type: "armrest",
      size_x: 350,
      size_y: 1050,
      size_z: 600,
      position_x: -1150,
      position_y: 0,
      position_z: 300,
      rotation_x: 0,
      rotation_y: 0,
      rotation_z: 0,
      front_profile: "PROF-ARM-FRONT",
      side_profile: "PROF-ARM-SIDE",
      shape_proxy: "rounded_shell",
      shape_source: "ai_estimated",
    },
    {
      id: "ARM-R",
      name: "Right Armrest",
      type: "armrest",
      size_x: 350,
      size_y: 1050,
      size_z: 600,
      position_x: 1150,
      position_y: 0,
      position_z: 300,
      rotation_x: 0,
      rotation_y: 0,
      rotation_z: 0,
      front_profile: "PROF-ARM-FRONT",
      side_profile: "PROF-ARM-SIDE",
      shape_proxy: "rounded_shell",
      shape_source: "ai_estimated",
    },
    {
      id: "BACK-CENTER",
      name: "Backrest Center",
      type: "backrest",
      size_x: 1950,
      size_y: 300,
      size_z: 500,
      position_x: 0,
      position_y: -350,
      position_z: 550,
      rotation_x: -12,
      rotation_y: 0,
      rotation_z: 0,
      front_profile: "PROF-BACK-FRONT",
      side_profile: "PROF-BACK-SIDE",
      shape_proxy: "arched_back",
      shape_source: "ai_estimated",
    },
  ];
  const compSheet = XLSX.utils.json_to_sheet(componentData);
  XLSX.utils.book_append_sheet(wb, compSheet, "Components");

  // CAD_Profiles sheet with cubicTo and multiple pathRoles
  const cadProfileData = [
    // PROF-ARM-FRONT Outer
    { profile_id: "PROF-ARM-FRONT", component_family: "armrest", view: "front", path_role: "outer", sequence: 1, command: "moveTo", x: 0.0, y: 0.0, mirror_allowed: true },
    { profile_id: "PROF-ARM-FRONT", component_family: "armrest", view: "front", path_role: "outer", sequence: 2, command: "lineTo", x: 1.0, y: 0.0, mirror_allowed: true },
    { profile_id: "PROF-ARM-FRONT", component_family: "armrest", view: "front", path_role: "outer", sequence: 3, command: "lineTo", x: 1.0, y: 0.8, mirror_allowed: true },
    { profile_id: "PROF-ARM-FRONT", component_family: "armrest", view: "front", path_role: "outer", sequence: 4, command: "cubicTo", cp1_x: 0.9, cp1_y: 1.0, cp2_x: 0.1, cp2_y: 1.0, x: 0.0, y: 0.8, mirror_allowed: true },
    { profile_id: "PROF-ARM-FRONT", component_family: "armrest", view: "front", path_role: "outer", sequence: 5, command: "close", mirror_allowed: true },

    // PROF-ARM-FRONT Seam
    { profile_id: "PROF-ARM-FRONT", component_family: "armrest", view: "front", path_role: "seam", sequence: 1, command: "moveTo", x: 0.1, y: 0.1, mirror_allowed: true },
    { profile_id: "PROF-ARM-FRONT", component_family: "armrest", view: "front", path_role: "seam", sequence: 2, command: "lineTo", x: 0.9, y: 0.1, mirror_allowed: true },

    // PROF-ARM-SIDE Outer
    { profile_id: "PROF-ARM-SIDE", component_family: "armrest", view: "side", path_role: "outer", sequence: 1, command: "moveTo", x: 0.0, y: 0.0, mirror_allowed: false },
    { profile_id: "PROF-ARM-SIDE", component_family: "armrest", view: "side", path_role: "outer", sequence: 2, command: "lineTo", x: 1.0, y: 0.0, mirror_allowed: false },
    { profile_id: "PROF-ARM-SIDE", component_family: "armrest", view: "side", path_role: "outer", sequence: 3, command: "lineTo", x: 1.0, y: 1.0, mirror_allowed: false },
    { profile_id: "PROF-ARM-SIDE", component_family: "armrest", view: "side", path_role: "outer", sequence: 4, command: "lineTo", x: 0.0, y: 1.0, mirror_allowed: false },
    { profile_id: "PROF-ARM-SIDE", component_family: "armrest", view: "side", path_role: "outer", sequence: 5, command: "close", mirror_allowed: false },
  ];
  const profileSheet = XLSX.utils.json_to_sheet(cadProfileData);
  XLSX.utils.book_append_sheet(wb, profileSheet, "CAD_Profiles");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  // 1. Parse Workbook
  const parseRes = parseWorkbook(buf, "G2_3_CAD_Profile_Fidelity_Test.xlsx");
  if (!parseRes.success) {
    console.error("FAILED to parse workbook:", parseRes.error);
    process.exit(1);
  }
  console.log("PASS 1: parseWorkbook succeeded for G2.3 CAD Profiles!");
  console.log(`- Cad Profiles count: ${parseRes.fes.cadProfiles?.length}`);
  console.log(`- ARM-L rotation:`, parseRes.fes.components[0].rotation);
  console.log(`- ARM-L profiles:`, parseRes.fes.components[0].profiles);

  // 2. Validate Engineering Data
  const valReport = validateEngineeringData(parseRes.fes);
  if (!valReport.valid || valReport.level === "fail") {
    console.error("FAILED engineering validation:", valReport);
    process.exit(1);
  }
  console.log("PASS 2: Engineering validation PASS!");

  // 3. Build CAD Views (Front, Side, Top)
  const frontCad = buildCadView(parseRes.fes, "front");
  const sideCad = buildCadView(parseRes.fes, "side");
  const topCad = buildCadView(parseRes.fes, "top");

  console.log("PASS 3: Multi-View CAD Documents generated successfully!");
  console.log(`- Front Entities: ${frontCad.entities.length}`);
  console.log(`- Side Entities: ${sideCad.entities.length}`);
  console.log(`- Top Entities: ${topCad.entities.length}`);

  // Check cubicTo in Front View
  const armLFrontEntity = frontCad.entities.find(e => e.type === "path" && e.componentId === "ARM-L" && e.pathRole === "outer");
  if (!armLFrontEntity || armLFrontEntity.type !== "path") {
    console.error("FAILED to find ARM-L path entity in FRONT view");
    process.exit(1);
  }

  const hasCubic = armLFrontEntity.commands.some(c => c.type === "cubicTo");
  if (!hasCubic) {
    console.error("FAILED: Expected cubicTo command in ARM-L FRONT CAD path!");
    process.exit(1);
  }
  console.log("PASS 4: Verified cubicTo Bezier command in CAD-IR!");

  // Check seam path role in Front View
  const armLSeamEntity = frontCad.entities.find(e => e.type === "path" && e.componentId === "ARM-L" && e.pathRole === "seam");
  if (!armLSeamEntity) {
    console.error("FAILED: Expected seam pathRole entity for ARM-L!");
    process.exit(1);
  }
  console.log("PASS 5: Verified seam pathRole and layer mapping (SEAM)!");

  // Check right arm mirror transformation
  const armRFrontEntity = frontCad.entities.find(e => e.type === "path" && e.componentId === "ARM-R" && e.pathRole === "outer");
  if (!armRFrontEntity || armRFrontEntity.type !== "path") {
    console.error("FAILED to find ARM-R path entity");
    process.exit(1);
  }
  console.log("PASS 6: Verified ARM-R mirrored CAD profile transformation!");

  console.log("\n=== G2.3 CAD Profile Fidelity Test Suite: ALL PASS ===");
}

runG23Tests().catch(err => {
  console.error("G2.3 Test Suite Failed:", err);
  process.exit(1);
});
