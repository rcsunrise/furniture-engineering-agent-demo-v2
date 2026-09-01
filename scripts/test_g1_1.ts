import fs from "fs";
import path from "path";
import { parseWorkbook } from "../src/server/excel.js";

const sampleDir = path.join(process.cwd(), "sample");

console.log("=== G1-1 Test Suite ===");

// Test 1: valid.xlsx
const validBuf = fs.readFileSync(path.join(sampleDir, "valid.xlsx"));
const res1 = parseWorkbook(validBuf, "valid.xlsx");
console.log("\n1. Testing valid.xlsx:");
if (res1.success) {
  console.log("   Result: PASS");
  console.log("   SKU:", res1.fes.sku);
  console.log("   Components:", res1.fes.components.length);
} else {
  console.error("   Result: FAIL - Unexpected error:", res1.error);
  process.exit(1);
}

// Test 2: missing_required.xlsx
const missingBuf = fs.readFileSync(path.join(sampleDir, "missing_required.xlsx"));
const res2 = parseWorkbook(missingBuf, "missing_required.xlsx");
console.log("\n2. Testing missing_required.xlsx:");
if (!res2.success) {
  console.log("   Result: PASS (Correctly rejected)");
  console.log("   Error message:", res2.error);
} else {
  console.error("   Result: FAIL - Expected error but succeeded!");
  process.exit(1);
}

// Test 3: invalid_number.xlsx
const invalidBuf = fs.readFileSync(path.join(sampleDir, "invalid_number.xlsx"));
const res3 = parseWorkbook(invalidBuf, "invalid_number.xlsx");
console.log("\n3. Testing invalid_number.xlsx:");
if (!res3.success) {
  console.log("   Result: PASS (Correctly rejected)");
  console.log("   Error message:", res3.error);
} else {
  console.error("   Result: FAIL - Expected error but succeeded!");
  process.exit(1);
}

console.log("\n=== ALL G1-1 TESTS PASSED ===");
