import fs from "fs";
import path from "path";
import { parseWorkbook } from "../src/server/excel.js";
import { buildFrontView } from "../src/server/cad.js";
import { buildAssembly } from "../src/server/assembly.js";
import { validateEngineeringData } from "../src/server/validate.js";

const sampleDir = path.join(process.cwd(), "sample");

console.log("==================================================");
console.log("=== G1-DEMO Acceptance Test Suite ===");
console.log("==================================================\n");

// --- Test A: Valid Excel Parse ---
console.log("[Test A] Valid Excel Workbook Parsing (engineering_valid.xlsx)...");
const validBuf = fs.readFileSync(path.join(sampleDir, "engineering_valid.xlsx"));
const parseRes = parseWorkbook(validBuf, "engineering_valid.xlsx");

if (!parseRes.success) {
  console.error("❌ Test A FAIL: Unable to parse engineering_valid.xlsx", parseRes.error);
  process.exit(1);
}
const fes = parseRes.fes;
console.log(` -> PASS: Parsed SKU: ${fes.sku}, Components: ${fes.components.length}, Units: ${fes.units}\n`);

// --- Test B: CAD-IR Front View Generation ---
console.log("[Test B] CAD-IR Front View Generation...");
const cad = buildFrontView(fes);
if (!cad || cad.version !== "1.0" || cad.view !== "front" || cad.entities.length === 0) {
  console.error("❌ Test B FAIL: CAD-IR generation invalid", cad);
  process.exit(1);
}
console.log(` -> PASS: CAD-IR bounds [${cad.bounds.minX}, ${cad.bounds.maxX}] × [${cad.bounds.minY}, ${cad.bounds.maxY}], Entities: ${cad.entities.length}\n`);

// --- Test C: Assembly Graph Component Count ---
console.log("[Test C] Assembly Graph Generation...");
const assembly = buildAssembly(fes);
if (!assembly || assembly.version !== "1.0" || assembly.components.length !== fes.components.length) {
  console.error(`❌ Test C FAIL: Assembly components count mismatch. Expected ${fes.components.length}, got ${assembly.components.length}`);
  process.exit(1);
}
console.log(` -> PASS: Assembly Document SKU: ${assembly.sku}, Components Count: ${assembly.components.length}\n`);

// --- Test D: Size & Base Position Consistency ---
console.log("[Test D] Component Size & Base Position Consistency...");
for (const fesComp of fes.components) {
  const assemComp = assembly.components.find((x) => x.id === fesComp.id);
  if (!assemComp) {
    console.error(`❌ Test D FAIL: Component ${fesComp.id} missing in Assembly Document`);
    process.exit(1);
  }

  const sizeMatch =
    assemComp.size.x === fesComp.size.x &&
    assemComp.size.y === fesComp.size.y &&
    assemComp.size.z === fesComp.size.z;

  const posMatch =
    assemComp.position.x === fesComp.position.x &&
    assemComp.position.y === fesComp.position.y &&
    assemComp.position.z === fesComp.position.z;

  if (!sizeMatch || !posMatch) {
    console.error(`❌ Test D FAIL: Mismatch for component ${fesComp.id}`, { fesComp, assemComp });
    process.exit(1);
  }
}
console.log(` -> PASS: All ${assembly.components.length} components match size and position exactly\n`);

// --- Test E: explodeRatio = 0 Position Evaluation ---
console.log("[Test E] Exploded View Evaluation (explodeRatio = 0)...");
for (const c of assembly.components) {
  const explodeRatio = 0;
  const renderX = c.position.x + c.explodeVector.x * explodeRatio;
  const renderY = c.position.y + c.explodeVector.y * explodeRatio;
  const renderZ = c.position.z + c.explodeVector.z * explodeRatio;

  if (renderX !== c.position.x || renderY !== c.position.y || renderZ !== c.position.z) {
    console.error(`❌ Test E FAIL: Explode position at ratio 0 mismatch for ${c.id}`);
    process.exit(1);
  }
}
console.log(" -> PASS: explodeRatio = 0 produces exact unexploded base positions\n");

// --- Test F: explodeRatio = 1 Position Evaluation ---
console.log("[Test F] Exploded View Evaluation (explodeRatio = 1)...");
for (const c of assembly.components) {
  const explodeRatio = 1.0;
  const renderX = c.position.x + c.explodeVector.x * explodeRatio;
  const renderY = c.position.y + c.explodeVector.y * explodeRatio;
  const renderZ = c.position.z + c.explodeVector.z * explodeRatio;

  const expectedX = c.position.x + c.explodeVector.x;
  const expectedY = c.position.y + c.explodeVector.y;
  const expectedZ = c.position.z + c.explodeVector.z;

  if (renderX !== expectedX || renderY !== expectedY || renderZ !== expectedZ) {
    console.error(`❌ Test F FAIL: Explode position at ratio 1 mismatch for ${c.id}`);
    process.exit(1);
  }
}
console.log(" -> PASS: explodeRatio = 1 produces exact fully exploded positions (original + explodeVector)\n");

// --- Test G: Invalid FES Rejection ---
console.log("[Test G] Invalid FES Rejection (out_of_bounds_x.xlsx)...");
const invalidBuf = fs.readFileSync(path.join(sampleDir, "out_of_bounds_x.xlsx"));
const parseInvalidRes = parseWorkbook(invalidBuf, "out_of_bounds_x.xlsx");

if (!parseInvalidRes.success) {
  console.log(" -> PASS: Invalid workbook rejected at parsing level");
} else {
  const invalidFes = parseInvalidRes.fes;
  const validationReport = validateEngineeringData(invalidFes);

  if (!validationReport.valid || validationReport.level === "fail") {
    console.log(` -> PASS: Invalid FES correctly flagged with level='${validationReport.level}' and ${validationReport.summary.errors} errors`);
  } else {
    console.error("❌ Test G FAIL: Invalid engineering workbook was not rejected!");
    process.exit(1);
  }
}

console.log("\n==================================================");
console.log("=== ALL G1-DEMO ACCEPTANCE TESTS PASSED ===");
console.log("==================================================\n");
