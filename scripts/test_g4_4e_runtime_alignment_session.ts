import fs from "fs";
import path from "path";
import { parseWorkbook } from "../src/server/excel.js";
import { alignmentSessionStore } from "../src/server/alignment/alignmentSessionStore.js";
import { createAlignmentSession } from "../src/shared/alignmentSession.js";
import { runAlignmentPipeline } from "../src/client/utils/alignment/alignmentOrchestrator.js";

async function runG44ETests() {
  console.log("==================================================");
  console.log("RUNNING G4-4E RUNTIME ALIGNMENT SESSION TESTS");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? `: ${detail}` : ""}`);
      failed++;
    }
  }

  // Load sample FES Excel file
  let samplePath = path.join(process.cwd(), "sample", "est_sofa_roundarm_2650.xlsx");
  if (!fs.existsSync(samplePath)) {
    samplePath = path.join(process.cwd(), "sample", "valid.xlsx");
  }
  if (!fs.existsSync(samplePath)) {
    throw new Error(`Sample Excel file not found at ${samplePath}`);
  }
  const fileBuf = fs.readFileSync(samplePath);
  const parseRes = parseWorkbook(fileBuf, path.basename(samplePath));
  assert(parseRes.success, "0. Load real sample FES Excel document", parseRes.error);
  const fes = parseRes.fes;
  const fesComponents = fes.components || (fes as any).assembly?.components || [];
  console.log("FES Component IDs:", fesComponents.map((c: any) => c.id));
  const validCompId = fesComponents[0]?.id || "ARM-L-OUT";

  // Test A: Session Creation
  const rawSession = createAlignmentSession({
    artifactId: "art-mesh-arm-12345",
    partId: "part-arm-left",
    engineeringDocumentId: `fes_${fes.sku}`,
    sku: fes.sku,
    componentId: "ARM-L-OUT",
    geometrySource: "comfyui_hunyuan3d_glb",
  });

  assert(Boolean(rawSession.sessionId), "A. Session Creation - generated sessionId");
  assert(rawSession.productionTruth === false, "N. productionTruth strictly false");

  // Test O: Session Persistence in Store
  alignmentSessionStore.saveSession(rawSession);
  const retrieved = alignmentSessionStore.getSession(rawSession.sessionId);
  assert(retrieved?.artifactId === "art-mesh-arm-12345", "O. Session Persistence - retrievable from store");

  // Test E: Missing FES rejection
  const noFesSession = createAlignmentSession({
    artifactId: "art-mesh-arm-12345",
    partId: "part-arm-left",
    componentId: "ARM-L-OUT",
  });
  const noFesResult = runAlignmentPipeline({ session: noFesSession, fes: null });
  assert(
    noFesResult.status === "WAITING_FOR_ENGINEERING_DATA",
    "E. Missing FES Rejection - status WAITING_FOR_ENGINEERING_DATA"
  );

  // Test F: Missing Component Rejection
  const noCompSession = createAlignmentSession({
    artifactId: "art-mesh-arm-12345",
    partId: "part-arm-left",
    engineeringDocumentId: `fes_${fes.sku}`,
    sku: fes.sku,
    componentId: "INVALID_COMPONENT_XYZ",
  });
  const noCompResult = runAlignmentPipeline({ session: noCompSession, fes });
  console.log("noCompResult status & msg:", noCompResult.status, noCompResult.errorMessage);
  assert(
    noCompResult.status === "WAITING_FOR_COMPONENT_MAPPING",
    "F. Missing Component Rejection - status WAITING_FOR_COMPONENT_MAPPING"
  );

  // Test Full Alignment Pipeline Execution (G, H, I, J, K, L, M, N)
  const fullSession = createAlignmentSession({
    artifactId: "art-mesh-arm-12345",
    partId: "part-arm-left",
    engineeringDocumentId: `fes_${fes.sku}`,
    sku: fes.sku,
    componentId: validCompId,
    geometrySource: "comfyui_hunyuan3d_glb",
  });

  const runResult = runAlignmentPipeline({
    session: fullSession,
    fes,
  });
  console.log("runResult status & msg:", runResult.status, runResult.errorMessage);

  // Test G: G4-4A Execution Reuse (Normalization)
  assert(
    runResult.normalization !== undefined && runResult.normalization.status === "NORMALIZED",
    "G. G4-4A Normalization Execution Reuse - normalized successfully"
  );

  // Test H: G4-4B Execution Reuse (Dimension Alignment)
  assert(
    runResult.dimensionAlignment !== undefined && runResult.dimensionAlignment.targetSize.x > 0,
    "H. G4-4B Dimension Alignment Execution Reuse - target size matched"
  );

  // Test I: G4-4C Execution Reuse (Component Placement)
  assert(
    runResult.placement !== undefined && runResult.placement.status === "PLACED",
    "I. G4-4C Component Placement Execution Reuse - component placed"
  );

  // Test J: G4-4D-R1 Execution Reuse (Geometry Evaluation)
  assert(
    runResult.evaluation !== undefined && typeof runResult.evaluation.overallScore === "number",
    "J. G4-4D-R1 Geometry Evaluation Execution Reuse - evaluation score calculated"
  );

  // Test K: artifactId identity preserved
  assert(
    runResult.artifactId === "art-mesh-arm-12345" && runResult.normalization?.artifactId === "art-mesh-arm-12345",
    "K. artifactId identity preserved end-to-end"
  );

  // Test L: componentId identity preserved
  assert(
    runResult.componentId === validCompId && runResult.placement?.componentId === validCompId,
    "L. componentId identity preserved end-to-end"
  );

  // Test M: No fixture substitution
  assert(
    runResult.geometrySource === "comfyui_hunyuan3d_glb" || runResult.geometrySource === "proxy_fallback",
    "M. Provenance tracking - no benchmark fixture substitution"
  );

  // Test Final Pipeline Completion
  assert(runResult.status === "COMPLETED", "Pipeline status COMPLETED");

  console.log("\n==================================================");
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runG44ETests().catch((err) => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});
