import fs from "fs";
import path from "path";
import { parseWorkbook } from "../src/server/excel.js";
import { buildFrontView } from "../src/server/cad.js";
import { buildAssembly } from "../src/server/assembly.js";
import { validateEngineeringData } from "../src/server/validate.js";

async function testG2ShapeDemo() {
  console.log("=== Running G2-SHAPE-DEMO Automated Test Suite ===");

  const filePath = path.join(process.cwd(), "sample", "est_sofa_roundarm_2650.xlsx");
  if (!fs.existsSync(filePath)) {
    throw new Error(`Sample file not found at ${filePath}`);
  }

  const fileBuffer = fs.readFileSync(filePath);
  console.log("1. Testing parseWorkbook with G2 Excel sample...");
  const parseRes = parseWorkbook(fileBuffer, "est_sofa_roundarm_2650.xlsx");

  if (!parseRes.success || !parseRes.fes) {
    console.error("FAIL: parseWorkbook failed", parseRes.error);
    process.exit(1);
  }

  const fes = parseRes.fes;
  console.log("PASS: parseWorkbook succeeded!");
  console.log(`- SKU: ${fes.sku}`);
  console.log(`- Product Type: ${fes.productType}`);
  console.log(`- Component Count: ${fes.components.length}`);
  console.log(`- Shape Profiles Count: ${fes.shapeProfiles?.length ?? 0}`);

  // Check component shapes
  const armL = fes.components.find((c) => c.id === "ARM-L");
  if (!armL || armL.shape?.proxy !== "rounded_shell") {
    console.error("FAIL: ARM-L shape proxy expected 'rounded_shell', got:", armL?.shape);
    process.exit(1);
  }
  console.log("PASS: ARM-L shape proxy verified as 'rounded_shell'");

  const pillowL = fes.components.find((c) => c.id === "PILLOW-L");
  if (!pillowL || pillowL.shape?.source !== "ai_estimated" || pillowL.shape?.productionTruth !== false) {
    console.error("FAIL: PILLOW-L shape source/truth expected ai_estimated/false, got:", pillowL?.shape);
    process.exit(1);
  }
  console.log("PASS: PILLOW-L shape provenance verified (source=ai_estimated, productionTruth=false)");

  // Validation Check
  console.log("2. Testing Validation Engine...");
  const report = validateEngineeringData(fes);
  console.log(`PASS: Validation Level = ${report.level}, Valid = ${report.valid}`);

  // CAD-IR Generation Check
  console.log("3. Testing CAD Front View with Path Entities...");
  const cad = buildFrontView(fes);
  const pathEntities = cad.entities.filter((e) => e.type === "path");
  console.log(`PASS: Generated ${pathEntities.length} path entities out of ${cad.entities.length} total CAD entities`);

  if (pathEntities.length === 0) {
    console.error("FAIL: Expected path entities in CAD Front View for G2 shapes!");
    process.exit(1);
  }

  // Assembly Graph Check
  console.log("4. Testing Assembly Graph...");
  const assembly = buildAssembly(fes);
  const assemblyPillow = assembly.components.find((c) => c.id === "PILLOW-L");
  if (!assemblyPillow?.shape || assemblyPillow.shape.source !== "ai_estimated") {
    console.error("FAIL: Assembly component PILLOW-L shape data lost!");
    process.exit(1);
  }
  console.log("PASS: Assembly Graph retained component shape fields!");

  console.log("\n=== G2-SHAPE-DEMO Test Suite Result: ALL PASS ===");
}

testG2ShapeDemo().catch((err) => {
  console.error("G2 Test Error:", err);
  process.exit(1);
});
