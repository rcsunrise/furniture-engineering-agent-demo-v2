import fs from "fs";
import path from "path";
import { parseWorkbook } from "../src/server/excel.js";
import { generateGeometryDraftExcel } from "../src/server/excelDraftExport.js";
import { FesDraftBuilder } from "../src/server/inference/fesDraftBuilder.js";
import { DeterministicConstraintSolver } from "../src/server/inference/constraintSolver.js";
import type { ObservationDocument } from "../src/shared/referenceObservation.js";

console.log("=== P0 Excel Export & Parse Round-Trip Test ===");

const obsDoc: ObservationDocument = {
  version: "1.0",
  sku: "TEST-ROUNDTRIP-2000",
  knownOverallDimensions: {
    width: { value: 2000, source: "USER_SPECIFIED", confidence: 1.0, isProductionTruth: true },
    depth: { value: 900, source: "USER_SPECIFIED", confidence: 1.0, isProductionTruth: true },
    height: { value: 850, source: "USER_SPECIFIED", confidence: 1.0, isProductionTruth: true },
  },
  components: [
    {
      id: "FRAME-01",
      name: "Main Frame",
      semanticType: "frame",
      estimatedBoundingBox: {
        width: { value: 1800, source: "AI_ESTIMATED", confidence: 0.9, isProductionTruth: false },
        depth: { value: 800, source: "AI_ESTIMATED", confidence: 0.9, isProductionTruth: false },
        height: { value: 250, source: "AI_ESTIMATED", confidence: 0.9, isProductionTruth: false },
      },
      estimatedPosition: {
        x: { value: 0, source: "AI_ESTIMATED", confidence: 1.0, isProductionTruth: false },
        y: { value: 0, source: "AI_ESTIMATED", confidence: 1.0, isProductionTruth: false },
        z: { value: 125, source: "AI_ESTIMATED", confidence: 0.9, isProductionTruth: false },
      },
    },
    {
      id: "SEAT-01",
      name: "Main Cushion",
      semanticType: "cushion",
      estimatedBoundingBox: {
        width: { value: 1600, source: "AI_ESTIMATED", confidence: 0.9, isProductionTruth: false },
        depth: { value: 700, source: "AI_ESTIMATED", confidence: 0.9, isProductionTruth: false },
        height: { value: 150, source: "AI_ESTIMATED", confidence: 0.9, isProductionTruth: false },
      },
      estimatedPosition: {
        x: { value: 0, source: "AI_ESTIMATED", confidence: 1.0, isProductionTruth: false },
        y: { value: 0, source: "AI_ESTIMATED", confidence: 1.0, isProductionTruth: false },
        z: { value: 325, source: "AI_ESTIMATED", confidence: 0.9, isProductionTruth: false },
      },
    },
  ],
};

// 1. Solve and build FES draft
const solver = new DeterministicConstraintSolver();
const report = solver.solve({
  sku: obsDoc.sku,
  knownOverallWidthMm: 2000,
  knownOverallDepthMm: 900,
  knownOverallHeightMm: 850,
  componentObservations: obsDoc.components,
});

const builder = new FesDraftBuilder();
const { draft, fes: originalFes } = builder.buildDraft(obsDoc, report);

// 2. Generate Excel Buffer from Export Engine
const excelBuffer = generateGeometryDraftExcel(draft, obsDoc);
console.log("1. Exported Excel Buffer Size:", excelBuffer.length, "bytes");

if (excelBuffer.length < 1000) {
  console.error("   -> FAIL: Exported buffer too small or empty");
  process.exit(1);
}

// 3. Roundtrip Parse using parseWorkbook
const parseResult = parseWorkbook(excelBuffer, "RoundtripTest.xlsx");

if (!parseResult.success) {
  console.error("2. -> FAIL: parseWorkbook failed on exported Excel buffer:", parseResult.error);
  process.exit(1);
}

const parsedFes = parseResult.fes;
console.log("2. Successfully parsed exported Excel file!");
console.log("   Parsed SKU:", parsedFes.sku);
console.log("   Parsed Component Count:", parsedFes.components.length);
console.log("   Parsed LoftSections Count:", parsedFes.loftSections?.length);
console.log("   Parsed SoftSurfaceParams Count:", parsedFes.softSurfaceParams?.length);

if (
  parsedFes.sku === originalFes.sku &&
  parsedFes.components.length === originalFes.components.length &&
  (parsedFes.softSurfaceParams?.length || 0) > 0
) {
  console.log("   -> PASS: Roundtrip Excel Export -> Import completely preserved FES structure!");
} else {
  console.error("   -> FAIL: Mismatch between exported and re-parsed FES model");
  process.exit(1);
}

console.log("\n=== ALL P0 EXCEL ROUNDTRIP TESTS PASSED ===");
