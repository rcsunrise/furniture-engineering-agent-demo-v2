import { ReferenceObservationService } from "../src/server/ai/observationService.js";
import { CalibrationAdapter } from "../src/server/inference/calibrationAdapter.js";
import { DeterministicConstraintSolver } from "../src/server/inference/constraintSolver.js";
import { FesDraftBuilder } from "../src/server/inference/fesDraftBuilder.js";
import { generateGeometryDraftExcel } from "../src/server/excelDraftExport.js";
import { parseWorkbook } from "../src/server/excel.js";
import { validateEngineeringData } from "../src/server/validate.js";
import { buildCadView } from "../src/server/cad.js";
import { buildAssembly } from "../src/server/assembly.js";
import * as XLSX from "xlsx";

async function runG3CTest() {
  console.log("==================================================");
  console.log("    RUNNING G3-C WORKBOOK GEOMETRY HOTFIX TEST    ");
  console.log("==================================================\n");

  const sku = "G3-AB-ULTIMATE-ROUNDARM-SOFA-2650";
  const knownDims = { width: 2650, depth: 1050, height: 850 };

  // 1. Generate standard draft FES
  console.log("[1/5] Extracting observations & building draft FES...");
  const obsService = new ReferenceObservationService();
  const obsDoc = await obsService.observeProduct(sku, knownDims);
  const solver = new DeterministicConstraintSolver();
  const report = solver.solve({
    sku: obsDoc.sku,
    knownOverallWidthMm: obsDoc.knownOverallDimensions.width.value,
    knownOverallDepthMm: obsDoc.knownOverallDimensions.depth.value,
    knownOverallHeightMm: obsDoc.knownOverallDimensions.height.value,
    componentObservations: obsDoc.components,
  });
  const builder = new FesDraftBuilder();
  const { draft, fes: initialFes } = builder.buildDraft(obsDoc, report);

  console.log(`  ✓ FES built with ${initialFes.components.length} components`);
  console.log(`  ✓ Loft Sections count: ${(initialFes.loftSections || []).length}`);
  console.log(`  ✓ Soft Surface Params count: ${(initialFes.softSurfaceParams || []).length}`);

  // 2. Generate Excel & re-parse with parseWorkbook
  console.log("\n[2/5] Exporting Excel and re-parsing with parseWorkbook...");
  const excelBuf = generateGeometryDraftExcel(draft, obsDoc);
  const parseResult = parseWorkbook(excelBuf, "G3_C_Test.xlsx");
  if (!parseResult.success || !parseResult.fes) {
    throw new Error(`parseWorkbook failed: ${parseResult.error}`);
  }
  const parsedFes = parseResult.fes;
  console.log(`  ✓ Parsed Workbook successfully. SKU: ${parsedFes.sku}`);
  console.log(`  ✓ Geometry dataset profiles count: ${(parsedFes.geometry?.profiles || []).length}`);

  // 3. Validation
  console.log("\n[3/5] Validating Parsed FES Engineering Data...");
  const validation = validateEngineeringData(parsedFes);
  console.log(`  ✓ Engineering Validation Result: [${validation.level.toUpperCase()}]`);
  if (!validation.valid || validation.level === "fail") {
    throw new Error("Validation failed on parsed FES data");
  }

  // 4. CAD View Construction & Workbook Geometry Verification
  console.log("\n[4/5] Building CAD Views (Front, Side, Top) & Checking Geometry Resolution...");
  for (const view of ["front", "side", "top"] as const) {
    const cadDoc = buildCadView(parsedFes, view);
    if (!cadDoc || cadDoc.entities.length === 0) {
      throw new Error(`CAD-IR failed for view ${view}`);
    }
    const pathEntities = cadDoc.entities.filter((e) => e.type === "path");
    const fallbackCount = pathEntities.filter((e) => (e as any).profileFallback !== false).length;
    console.log(`  ✓ CAD View '${view}': ${pathEntities.length} component paths, ${fallbackCount} fallbacks`);
  }

  // 5. 3D Assembly Graph Verification
  console.log("\n[5/5] Building 3D Assembly Graph & Checking Geometry Modes...");
  const assembly = buildAssembly(parsedFes);
  if (!assembly || assembly.components.length === 0) {
    throw new Error("Assembly generation failed");
  }

  const armL = assembly.components.find((c) => c.id === "ARM-L-OUT");
  const seat1 = assembly.components.find((c) => c.id.startsWith("SEAT"));
  const back1 = assembly.components.find((c) => c.id.startsWith("BACK"));
  const pillow1 = assembly.components.find((c) => c.id.startsWith("PILLOW"));

  console.log(`  ✓ ARM-L geometryMode: ${armL?.geometryMode} (loftGroup: ${armL?.loftGroup})`);
  console.log(`  ✓ SEAT-1 geometryMode: ${seat1?.geometryMode} (softGroup: ${seat1?.softGroup})`);
  console.log(`  ✓ BACK-1 geometryMode: ${back1?.geometryMode} (softGroup: ${back1?.softGroup})`);
  console.log(`  ✓ PILLOW-1 geometryMode: ${pillow1?.geometryMode} (softGroup: ${pillow1?.softGroup})`);

  if (armL?.geometryMode !== "loft_shell") {
    throw new Error("ARM-L failed to use loft_shell geometryMode");
  }

  console.log("\n==================================================");
  console.log("   G3-C WORKBOOK GEOMETRY HOTFIX RESULT: PASS    ");
  console.log("==================================================");
}

runG3CTest().catch((err) => {
  console.error("\n❌ G3-C VERIFICATION FAILED:", err);
  process.exit(1);
});
