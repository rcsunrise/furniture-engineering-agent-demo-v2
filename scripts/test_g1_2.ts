import fs from "fs";
import path from "path";
import { parseWorkbook } from "../src/server/excel.js";
import { validateEngineeringData } from "../src/server/validate.js";

const sampleDir = path.join(process.cwd(), "sample");

console.log("=== G1-2 Engineering Validator Unit & Integration Tests ===");

// 1. Test engineering_valid.xlsx
const validBuf = fs.readFileSync(path.join(sampleDir, "engineering_valid.xlsx"));
const p1 = parseWorkbook(validBuf, "engineering_valid.xlsx");
if (!p1.success) {
  console.error("1. FAIL: Failed to parse engineering_valid.xlsx:", p1.error);
  process.exit(1);
}
const v1 = validateEngineeringData(p1.fes);
console.log("\n1. Testing engineering_valid.xlsx:");
console.log("   Level:", v1.level);
console.log("   Errors:", v1.summary.errors);
if (v1.level === "pass" && v1.valid && v1.summary.errors === 0) {
  console.log("   -> PASS");
} else {
  console.error("   -> FAIL: Expected pass but got", v1.level);
  process.exit(1);
}

// 2. Test out_of_bounds_x.xlsx
const oobXBuf = fs.readFileSync(path.join(sampleDir, "out_of_bounds_x.xlsx"));
const p2 = parseWorkbook(oobXBuf, "out_of_bounds_x.xlsx");
if (!p2.success) {
  console.error("2. FAIL: Failed to parse out_of_bounds_x.xlsx:", p2.error);
  process.exit(1);
}
const v2 = validateEngineeringData(p2.fes);
console.log("\n2. Testing out_of_bounds_x.xlsx:");
console.log("   Level:", v2.level);
console.log("   Issues:", v2.issues.map(i => i.code));
const hasOobX = v2.issues.some(i => i.code === "COMPONENT_OUT_OF_BOUNDS_X");
if (v2.level === "fail" && hasOobX) {
  console.log("   -> PASS (Detected COMPONENT_OUT_OF_BOUNDS_X)");
} else {
  console.error("   -> FAIL: Expected COMPONENT_OUT_OF_BOUNDS_X, got:", v2.issues);
  process.exit(1);
}

// 3. Test out_of_bounds_z.xlsx
const oobZBuf = fs.readFileSync(path.join(sampleDir, "out_of_bounds_z.xlsx"));
const p3 = parseWorkbook(oobZBuf, "out_of_bounds_z.xlsx");
if (!p3.success) {
  console.error("3. FAIL: Failed to parse out_of_bounds_z.xlsx:", p3.error);
  process.exit(1);
}
const v3 = validateEngineeringData(p3.fes);
console.log("\n3. Testing out_of_bounds_z.xlsx:");
console.log("   Level:", v3.level);
console.log("   Issues:", v3.issues.map(i => i.code));
const hasOobZ = v3.issues.some(i => i.code === "COMPONENT_OUT_OF_BOUNDS_Z");
if (v3.level === "fail" && hasOobZ) {
  console.log("   -> PASS (Detected COMPONENT_OUT_OF_BOUNDS_Z)");
} else {
  console.error("   -> FAIL: Expected COMPONENT_OUT_OF_BOUNDS_Z, got:", v3.issues);
  process.exit(1);
}

// 4. Test duplicate_id.xlsx
const dupBuf = fs.readFileSync(path.join(sampleDir, "duplicate_id.xlsx"));
const p4 = parseWorkbook(dupBuf, "duplicate_id.xlsx");
if (!p4.success) {
  console.error("4. FAIL: Failed to parse duplicate_id.xlsx:", p4.error);
  process.exit(1);
}
const v4 = validateEngineeringData(p4.fes);
console.log("\n4. Testing duplicate_id.xlsx:");
console.log("   Level:", v4.level);
console.log("   Issues:", v4.issues.map(i => i.code));
const hasDup = v4.issues.some(i => i.code === "DUPLICATE_COMPONENT_ID");
if (v4.level === "fail" && hasDup) {
  console.log("   -> PASS (Detected DUPLICATE_COMPONENT_ID)");
} else {
  console.error("   -> FAIL: Expected DUPLICATE_COMPONENT_ID, got:", v4.issues);
  process.exit(1);
}

// 5. Test zero_size.xlsx
const zeroBuf = fs.readFileSync(path.join(sampleDir, "zero_size.xlsx"));
const p5 = parseWorkbook(zeroBuf, "zero_size.xlsx");
if (!p5.success) {
  console.error("5. FAIL: Failed to parse zero_size.xlsx:", p5.error);
  process.exit(1);
}
const v5 = validateEngineeringData(p5.fes);
console.log("\n5. Testing zero_size.xlsx:");
console.log("   Level:", v5.level);
console.log("   Issues:", v5.issues.map(i => i.code));
const hasZero = v5.issues.some(i => i.code === "COMPONENT_ZERO_DIMENSION");
if (v5.level === "fail" && hasZero) {
  console.log("   -> PASS (Detected COMPONENT_ZERO_DIMENSION)");
} else {
  console.error("   -> FAIL: Expected COMPONENT_ZERO_DIMENSION, got:", v5.issues);
  process.exit(1);
}

// 6. Test Determinism (pure function)
console.log("\n6. Testing Pure Function Determinism:");
const det1 = validateEngineeringData(p1.fes);
const det2 = validateEngineeringData(p1.fes);
if (JSON.stringify(det1) === JSON.stringify(det2)) {
  console.log("   -> PASS (Identical output for identical input)");
} else {
  console.error("   -> FAIL: Function is not deterministic!");
  process.exit(1);
}

// 7. G1-1 Regression Test
console.log("\n7. G1-1 Regression Tests:");
const g1Valid = parseWorkbook(fs.readFileSync(path.join(sampleDir, "valid.xlsx")), "valid.xlsx");
const g1Missing = parseWorkbook(fs.readFileSync(path.join(sampleDir, "missing_required.xlsx")), "missing_required.xlsx");
const g1Invalid = parseWorkbook(fs.readFileSync(path.join(sampleDir, "invalid_number.xlsx")), "invalid_number.xlsx");

if (g1Valid.success && !g1Missing.success && !g1Invalid.success) {
  console.log("   -> PASS (G1-1 behavior completely preserved)");
} else {
  console.error("   -> FAIL: G1-1 regression test failed!");
  process.exit(1);
}

console.log("\n=== ALL G1-2 UNIT & REGRESSION TESTS PASSED ===");
