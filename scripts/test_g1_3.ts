import fs from "fs";
import path from "path";
import { parseWorkbook } from "../src/server/excel.js";
import { buildFrontView } from "../src/server/cad.js";

const sampleDir = path.join(process.cwd(), "sample");

console.log("=== G1-3 CAD Geometry Builder Unit Tests ===");

// 1. Load valid FES from engineering_valid.xlsx
const validBuf = fs.readFileSync(path.join(sampleDir, "engineering_valid.xlsx"));
const parseRes = parseWorkbook(validBuf, "engineering_valid.xlsx");
if (!parseRes.success) {
  console.error("1. FAIL: Could not parse engineering_valid.xlsx");
  process.exit(1);
}
const fes = parseRes.fes;

// 2. Build Front View CAD
const cad = buildFrontView(fes);
console.log("\n1. Testing Front View CAD Generation:");
console.log("   Document Version:", cad.version);
console.log("   View:", cad.view);
console.log("   SKU:", cad.sourceSku);
console.log("   Entity Count:", cad.entities.length);

if (cad.version === "1.0" && cad.view === "front" && cad.sourceSku === fes.sku) {
  console.log("   -> PASS");
} else {
  console.error("   -> FAIL: Basic document properties mismatch");
  process.exit(1);
}

// 3. Test Product Bounds
console.log("\n2. Testing Product Bounds:");
const expectedMinX = -fes.overall.width / 2;
const expectedMaxX = fes.overall.width / 2;
const expectedMinY = 0;
const expectedMaxY = fes.overall.height;

console.log(`   Bounds: minX=${cad.bounds.minX}, maxX=${cad.bounds.maxX}, minY=${cad.bounds.minY}, maxY=${cad.bounds.maxY}`);
if (
  cad.bounds.minX === expectedMinX &&
  cad.bounds.maxX === expectedMaxX &&
  cad.bounds.minY === expectedMinY &&
  cad.bounds.maxY === expectedMaxY
) {
  console.log("   -> PASS");
} else {
  console.error("   -> FAIL: Product bounds mismatch");
  process.exit(1);
}

// 4. Test Component Projection
console.log("\n3. Testing Component Projection:");
const frameComp = fes.components[0];
if (!frameComp) {
  console.error("   -> FAIL: No components found in FES");
  process.exit(1);
}

const frameEntity = cad.entities.find((e) => (e as any).componentId === frameComp.id || e.id.includes(frameComp.id)) as any;
if (!frameEntity) {
  console.error(`   -> FAIL: Could not find entity for component '${frameComp.id}'`);
  process.exit(1);
}

console.log(`   Found CAD entity for component ${frameComp.id}: id=${frameEntity.id}, layer=${frameEntity.layer}`);
console.log("   -> PASS (Component CAD path projected)");

// 5. Test Dimensions
console.log("\n4. Testing Overall Width & Height Dimensions:");
const widthDim = cad.entities.find((e) => e.type === "dimension" && e.id === "dimension:overall-width:front") as any;
const heightDim = cad.entities.find((e) => e.type === "dimension" && e.id === "dimension:overall-height:front") as any;

if (widthDim && widthDim.value === fes.overall.width && heightDim && heightDim.value === fes.overall.height) {
  console.log(`   Width Dim Value: ${widthDim.value} mm, Height Dim Value: ${heightDim.value} mm`);
  console.log("   -> PASS");
} else {
  console.error("   -> FAIL: Dimension entities mismatch");
  process.exit(1);
}

// 6. Test Determinism & Stable IDs
console.log("\n5. Testing Determinism and Stable IDs:");
const cad2 = buildFrontView(fes);
if (JSON.stringify(cad) === JSON.stringify(cad2)) {
  console.log("   -> PASS (Identical CAD-IR output for identical input)");
} else {
  console.error("   -> FAIL: Generator is not deterministic!");
  process.exit(1);
}

console.log("\n=== ALL G1-3 UNIT TESTS PASSED ===");
