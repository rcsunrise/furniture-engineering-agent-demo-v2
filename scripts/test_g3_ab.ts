import { ReferenceObservationService } from "../src/server/ai/observationService.js";
import { CalibrationAdapter } from "../src/server/inference/calibrationAdapter.js";
import { DeterministicConstraintSolver } from "../src/server/inference/constraintSolver.js";
import { FesDraftBuilder } from "../src/server/inference/fesDraftBuilder.js";
import { generateGeometryDraftExcel } from "../src/server/excelDraftExport.js";
import { validateEngineeringData } from "../src/server/validate.js";
import { buildCadView } from "../src/server/cad.js";
import { buildAssembly } from "../src/server/assembly.js";
import * as XLSX from "xlsx";

async function runG3ABTest() {
  console.log("==================================================");
  console.log("    RUNNING G3-AB AUTOMATED VERIFICATION TEST    ");
  console.log("==================================================\n");

  const sku = "G2.3-ROUNDARM-SOFA-2650";
  const knownDims = { width: 2650, depth: 1050, height: 850 };

  // 1. Observation Extraction
  console.log("[1/7] Testing ReferenceObservationService...");
  const obsService = new ReferenceObservationService();
  const obsDoc = await obsService.observeProduct(sku, knownDims);

  if (!obsDoc || obsDoc.sku !== sku) {
    throw new Error(`Failed to generate ReferenceObservationDocument for ${sku}`);
  }
  if (obsDoc.components.length < 15) {
    throw new Error(`Expected ~17 components, got ${obsDoc.components.length}`);
  }
  console.log(`  ✓ Extracted ${obsDoc.references.length} reference views`);
  console.log(`  ✓ Extracted ${obsDoc.components.length} component observations (~17 components)`);

  // Verify Keypoints & Contours
  const armL = obsDoc.components.find((c) => c.componentIdDraft === "ARM-L-OUT");
  if (!armL || armL.keypoints.length === 0 || armL.contours.length === 0) {
    throw new Error("ARM-L-OUT missing keypoints or contours");
  }
  console.log(`  ✓ Verified ARM-L-OUT keypoints (${armL.keypoints.length}) & contours (${armL.contours[0].points.length} pts)`);

  // 2. Calibration Adapter
  console.log("\n[2/7] Testing CalibrationAdapter...");
  const calAdapter = new CalibrationAdapter({
    overallWidthMm: 2650,
    overallDepthMm: 1050,
    overallHeightMm: 850,
  });

  const frontPoint = calAdapter.normalizedToMm(0.5, 0.0, "front"); // u=0.5 -> x=0, v=0 -> z=850
  if (frontPoint.x !== 0 || frontPoint.z !== 850) {
    throw new Error(`Calibration error: Expected (0, 0, 850), got (${frontPoint.x}, ${frontPoint.y}, ${frontPoint.z})`);
  }
  console.log(`  ✓ Calibration u=0.5, v=0.0 -> x=${frontPoint.x}mm, z=${frontPoint.z}mm`);

  // 3. Deterministic Constraint Solver
  console.log("\n[3/7] Testing DeterministicConstraintSolver...");
  const solver = new DeterministicConstraintSolver();
  const report = solver.solve({
    sku: obsDoc.sku,
    knownOverallWidthMm: obsDoc.knownOverallDimensions.width.value,
    knownOverallDepthMm: obsDoc.knownOverallDimensions.depth.value,
    knownOverallHeightMm: obsDoc.knownOverallDimensions.height.value,
    componentObservations: obsDoc.components,
  });

  if (report.overallWidthMm.value !== 2650 || !report.overallWidthMm.productionTruth) {
    throw new Error("Overall width lock broken");
  }

  const armResolved = report.resolvedValues["armrest_width"]?.value;
  const seatResolved = report.resolvedValues["seat_cushion_width"]?.value;
  console.log(`  ✓ Overall dimensions locked: ${report.overallWidthMm.value} x ${report.overallDepthMm.value} x ${report.overallHeightMm.value} mm (Truth: PROVIDED)`);
  console.log(`  ✓ Resolved armrest width: ${armResolved} mm (Truth: SOLVER_RESOLVED)`);
  console.log(`  ✓ Resolved seat cushion width: ${seatResolved} mm (Truth: SOLVER_RESOLVED)`);

  // Check sum: 2 * armResolved + 3 * seatResolved == 2650
  const totalSum = 2 * armResolved + 3 * seatResolved;
  console.log(`  ✓ Layout width check: 2*${armResolved} + 3*${seatResolved} = ${totalSum} mm (target 2650 mm)`);
  if (Math.abs(totalSum - 2650) > 2) {
    throw new Error(`Layout sum mismatch: got ${totalSum}`);
  }

  // 4. FES Draft Builder
  console.log("\n[4/7] Testing FesDraftBuilder...");
  const builder = new FesDraftBuilder();
  const { draft, fes } = builder.buildDraft(obsDoc, report);

  if (draft.components.length !== obsDoc.components.length) {
    throw new Error(`Draft component count mismatch`);
  }
  console.log(`  ✓ FES Geometry Draft assembled with ${draft.components.length} components`);

  // 5. FES Engineering Validation
  console.log("\n[5/7] Testing Engineering Validation on Draft FES...");
  const validationReport = validateEngineeringData(fes);
  console.log(`  ✓ Engineering Validation Result: [${validationReport.level.toUpperCase()}]`);
  console.log(`  ✓ Summary: Errors=${validationReport.summary.errors}, Warnings=${validationReport.summary.warnings}`);

  if (!validationReport.valid || validationReport.level === "fail") {
    throw new Error("Generated FES failed engineering validation!");
  }

  // 6. Excel Geometry_Draft.xlsx Export
  console.log("\n[6/7] Testing Geometry_Draft.xlsx Excel Generation...");
  const excelBuffer = generateGeometryDraftExcel(draft, obsDoc);
  if (!excelBuffer || excelBuffer.length === 0) {
    throw new Error("Failed to generate Excel buffer");
  }

  const workbook = XLSX.read(excelBuffer, { type: "buffer" });
  const sheetNames = workbook.SheetNames;
  console.log(`  ✓ Generated Excel Workbook with ${sheetNames.length} sheets: ${sheetNames.join(", ")}`);

  const requiredSheets = [
    "Product",
    "Components",
    "Dimensions",
    "Profiles",
    "Reference_Observations",
    "Inference_Log",
  ];
  for (const sheet of requiredSheets) {
    if (!sheetNames.includes(sheet)) {
      throw new Error(`Excel missing required sheet: ${sheet}`);
    }
  }

  // 7. Pipeline Connection Check (FES -> CAD -> 3D)
  console.log("\n[7/7] Testing Downstream CAD & 3D Assembly Pipeline Connection...");
  const cadDoc = buildCadView(fes, "front");
  const assemblyDoc = buildAssembly(fes);

  if (!cadDoc || !cadDoc.entities || cadDoc.entities.length === 0) {
    throw new Error("CAD-IR generation failed from Draft FES");
  }
  if (!assemblyDoc || !assemblyDoc.components || assemblyDoc.components.length === 0) {
    throw new Error("3D Assembly generation failed from Draft FES");
  }

  console.log(`  ✓ CAD-IR generated ${cadDoc.entities.length} vector CAD entities`);
  console.log(`  ✓ 3D Assembly Graph generated ${assemblyDoc.components.length} 3D components (${assemblyDoc.assemblyType})`);

  console.log("\n==================================================");
  console.log("   G3-AB AUTOMATED VERIFICATION RESULT: PASS      ");
  console.log("==================================================");
}

runG3ABTest().catch((err) => {
  console.error("\n❌ G3-AB VERIFICATION FAILED:", err);
  process.exit(1);
});
