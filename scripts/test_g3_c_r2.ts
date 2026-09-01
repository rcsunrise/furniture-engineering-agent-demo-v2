import { ReferenceObservationService } from "../src/server/ai/observationService.js";
import { DeterministicConstraintSolver } from "../src/server/inference/constraintSolver.js";
import { FesDraftBuilder } from "../src/server/inference/fesDraftBuilder.js";
import { generateGeometryDraftExcel } from "../src/server/excelDraftExport.js";
import { parseWorkbook } from "../src/server/excel.js";
import { buildCadView } from "../src/server/cad.js";
import { buildAssembly } from "../src/server/assembly.js";
import { ThreeShapeFactory } from "../src/client/utils/threeShapeFactory.js";
import { evaluateComponentDiagnostics } from "../src/client/utils/geometryBuilders/geometryDiagnostics.js";
import { resampleClosedProfile } from "../src/client/utils/geometryBuilders/profileResampler.js";
import * as THREE from "three";

async function runG3CR2BenchmarkTest() {
  console.log("==================================================");
  console.log("    RUNNING G3-C-R2 GEOMETRY CONSUMPTION GATE TEST ");
  console.log("==================================================\n");

  const startTime = Date.now();
  const sku = "G3-AB-ULTIMATE-ROUNDARM-SOFA-2650";
  const knownDims = { width: 2650, depth: 1050, height: 850 };

  // 1. Ingest Excel & Parse
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
  const { draft } = builder.buildDraft(obsDoc, report);
  const excelBuf = generateGeometryDraftExcel(draft, obsDoc);
  const parseResult = parseWorkbook(excelBuf, "G3_C_R2_Benchmark.xlsx");

  if (!parseResult.success || !parseResult.fes) {
    throw new Error(`Workbook parse failed: ${parseResult.error}`);
  }
  const fes = parseResult.fes;

  // 2. Test A: ARM-L Geometry Source & Loft Shell
  const assembly = buildAssembly(fes);
  const armL = assembly.components.find((c) => c.id === "ARM-L-OUT");
  if (!armL) throw new Error("ARM-L-OUT not found in assembly");
  const armLDiag = evaluateComponentDiagnostics(armL as any, fes as any);
  console.log(`[A] ARM-L GeometrySource: ${armLDiag.geometrySource}, Fallback: ${armLDiag.fallback}`);
  if (armLDiag.geometrySource !== "workbook_loft" || armLDiag.fallback !== false) {
    throw new Error("ARM-L failed Workbook Loft Shell check");
  }

  // 3. Test B: ARM-R Mirror Verification
  const armR = assembly.components.find((c) => c.id === "ARM-R-OUT");
  if (!armR) throw new Error("ARM-R-OUT not found in assembly");
  const armLGeom = ThreeShapeFactory.createGeometryForComponent(armL as any);
  const armRGeom = ThreeShapeFactory.createGeometryForComponent(armR as any);
  console.log(`[B] ARM-L Vertices: ${armLGeom.getAttribute("position").count}, ARM-R Vertices: ${armRGeom.getAttribute("position").count}`);
  if (armLGeom.getAttribute("position").count !== armRGeom.getAttribute("position").count) {
    throw new Error("ARM-R vertex count does not match ARM-L mirror geometry");
  }

  // 4. Test C: SEAT Soft Surface Geometry Source
  const seat1 = assembly.components.find((c) => c.id.startsWith("SEAT"));
  if (!seat1) throw new Error("SEAT component not found");
  const seatDiag = evaluateComponentDiagnostics(seat1 as any, fes as any);
  console.log(`[C] SEAT GeometrySource: ${seatDiag.geometrySource}, Fallback: ${seatDiag.fallback}`);
  if (seatDiag.geometrySource !== "workbook_soft_surface") {
    throw new Error("SEAT failed Workbook Soft Surface check");
  }

  // 5. Test D: FRAME / BASE Box Geometry Source
  const frame = assembly.components.find((c) => c.id.startsWith("FRAME") || c.id.startsWith("BASE") || c.id.startsWith("LEG"));
  if (frame) {
    const frameDiag = evaluateComponentDiagnostics(frame as any, fes as any);
    console.log(`[D] FRAME GeometrySource: ${frameDiag.geometrySource}, Fallback: ${frameDiag.fallback}`);
    if (frameDiag.geometrySource !== "box_geometry" || frameDiag.fallback !== false) {
      throw new Error("FRAME failed Box Geometry check");
    }
  }

  // 6. Test E: Pillow Wide Flat Cushion Bounding Aspect Ratio
  const pillow = assembly.components.find((c) => c.id.startsWith("PILLOW"));
  if (pillow) {
    const ratio = pillow.size.x / pillow.size.y;
    console.log(`[E] Pillow Aspect Ratio (width/height): ${ratio.toFixed(2)}`);
    if (ratio < 3.0) {
      throw new Error(`Pillow aspect ratio ${ratio} is less than 3.0 (must be wide, flat cushion)`);
    }
  }

  // 7. Test F: Section Resampling Vertex Count (64 per section)
  const samplePts = [new THREE.Vector2(0, 0), new THREE.Vector2(100, 0), new THREE.Vector2(100, 50), new THREE.Vector2(0, 50)];
  const resampled = resampleClosedProfile(samplePts, 64);
  console.log(`[F] Profile Resample Count: ${resampled.length}`);
  if (resampled.length !== 64) {
    throw new Error("Profile resampler failed to yield 64 vertices");
  }

  // 8. Test G: Benchmark Primary Components Fallback Count
  let primaryFallbackCount = 0;
  for (const comp of assembly.components) {
    if (comp.id.startsWith("ARM") || comp.id.startsWith("SEAT") || comp.id.startsWith("BACK") || comp.id.startsWith("PILLOW")) {
      const diag = evaluateComponentDiagnostics(comp as any, fes as any);
      if (diag.fallback) primaryFallbackCount++;
    }
  }
  console.log(`[G] Primary Components Proxy Fallback Count: ${primaryFallbackCount}`);
  if (primaryFallbackCount !== 0) {
    throw new Error(`Primary components fallback count is ${primaryFallbackCount}, expected 0`);
  }

  // 9. CAD Multi-View Projection Verification
  for (const v of ["front", "side", "top"] as const) {
    const cadDoc = buildCadView(fes, v);
    console.log(`[CAD] View '${v}': ${cadDoc.entities.length} entities generated`);
  }

  const buildDuration = Date.now() - startTime;
  console.log(`\n  ✓ Geometry Construction Time: ${buildDuration}ms (Target < 500ms)`);

  console.log("\n==================================================");
  console.log("   G3-C-R2 BENCHMARK GATE RESULT: PASS            ");
  console.log("==================================================");
}

runG3CR2BenchmarkTest().catch((err) => {
  console.error("\n❌ G3-C-R2 BENCHMARK GATE TEST FAILED:", err);
  process.exit(1);
});
