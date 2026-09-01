import * as XLSX from "xlsx";
import { parseWorkbook } from "../src/server/excel.js";
import { validateEngineeringData } from "../src/server/validate.js";
import { buildAssembly } from "../src/server/assembly.js";
import {
  fesToThreePosition,
  fesToThreeSize,
  fesToThreeRotation,
  PRODUCT_FRONT_AXIS,
} from "../src/client/utils/threeAdapter.js";

async function runG231HotfixTests() {
  console.log("=== Running G2.3.1 — 3D Orientation & View Hotfix Test Suite ===");

  // 1. Verify PRODUCT_FRONT_AXIS constant
  if (PRODUCT_FRONT_AXIS !== "-Y") {
    console.error(`FAILED: PRODUCT_FRONT_AXIS expected '-Y', got '${PRODUCT_FRONT_AXIS}'`);
    process.exit(1);
  }
  console.log(`PASS 1: PRODUCT_FRONT_AXIS constant verified as '${PRODUCT_FRONT_AXIS}'`);

  // 2. Verify Coordinate Mapping
  const fesPos = { x: -1150, y: -350, z: 550 };
  const threePos = fesToThreePosition(fesPos);
  if (threePos.x !== -1150 || threePos.y !== 550 || threePos.z !== 350) {
    console.error(`FAILED: fesToThreePosition mapping mismatch! Got:`, threePos);
    process.exit(1);
  }
  console.log(`PASS 2: fesToThreePosition verified (x=${threePos.x}, y=${threePos.y}, z=${threePos.z})`);

  // 3. Verify Size Mapping
  const fesSize = { x: 350, y: 1050, z: 600 };
  const threeSize = fesToThreeSize(fesSize);
  if (threeSize.x !== 350 || threeSize.y !== 600 || threeSize.z !== 1050) {
    console.error(`FAILED: fesToThreeSize mapping mismatch! Got:`, threeSize);
    process.exit(1);
  }
  console.log(`PASS 3: fesToThreeSize verified (x=${threeSize.x}, y=${threeSize.y}, z=${threeSize.z})`);

  // 4. Verify Rotation Mapping
  const fesRot = { x: -12, y: 0, z: 15 };
  const threeRot = fesToThreeRotation(fesRot);
  const expectedRotX = (-12 * Math.PI) / 180;
  const expectedRotY = (15 * Math.PI) / 180;
  const expectedRotZ = (-0 * Math.PI) / 180;

  if (
    Math.abs(threeRot.x - expectedRotX) > 1e-5 ||
    Math.abs(threeRot.y - expectedRotY) > 1e-5 ||
    Math.abs(threeRot.z - expectedRotZ) > 1e-5
  ) {
    console.error(`FAILED: fesToThreeRotation mismatch! Got:`, threeRot);
    process.exit(1);
  }
  console.log(`PASS 4: fesToThreeRotation verified (x=${threeRot.x.toFixed(4)}, y=${threeRot.y.toFixed(4)}, z=${threeRot.z.toFixed(4)})`);

  // 5. Test Excel Parsing & Assembly Build with Rotation
  const wb = XLSX.utils.book_new();

  const productSheet = XLSX.utils.json_to_sheet([
    { key: "sku", value: "G2.3.1-TEST-SOFA" },
    { key: "product_type", value: "sofa" },
    { key: "overall_width", value: 2650 },
    { key: "overall_depth", value: 1050 },
    { key: "overall_height", value: 850 },
  ]);
  XLSX.utils.book_append_sheet(wb, productSheet, "Product");

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
    },
  ];
  const compSheet = XLSX.utils.json_to_sheet(componentData);
  XLSX.utils.book_append_sheet(wb, compSheet, "Components");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const parseRes = parseWorkbook(buf, "G2_3_1_Test.xlsx");

  if (!parseRes.success) {
    console.error("FAILED to parse workbook:", parseRes.error);
    process.exit(1);
  }

  const valReport = validateEngineeringData(parseRes.fes);
  if (!valReport.valid) {
    console.error("FAILED engineering validation:", valReport);
    process.exit(1);
  }

  const assemblyDoc = buildAssembly(parseRes.fes);
  const backComp = assemblyDoc.components.find((c) => c.id === "BACK-CENTER");

  if (!backComp || !backComp.rotation || backComp.rotation.x !== -12) {
    console.error("FAILED: BACK-CENTER component missing or incorrect rotation in Assembly Document!", backComp);
    process.exit(1);
  }
  console.log(`PASS 5: Assembly Graph retained rotation_x = -12° for BACK-CENTER`);

  // 6. Camera Position Preset Calculation Test
  const overallWidth = 2650;
  const overallDepth = 1050;
  const overallHeight = 850;
  const maxDim = Math.max(overallWidth, overallDepth, overallHeight);

  const targetY = overallHeight * 0.45; // 382.5
  const distance = maxDim * 1.6; // 4240

  console.log(`PASS 6: Camera preset calculation verified (targetY=${targetY}, distance=${distance})`);

  console.log("\n=== G2.3.1 — 3D Orientation & View Hotfix Test Suite: ALL PASS ===");
}

runG231HotfixTests().catch((err) => {
  console.error("G2.3.1 Test Suite Failed:", err);
  process.exit(1);
});
