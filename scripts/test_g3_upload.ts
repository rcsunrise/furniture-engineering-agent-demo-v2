import { ReferenceObservationService } from "../src/server/ai/observationService.js";
import { CalibrationAdapter } from "../src/server/inference/calibrationAdapter.js";
import { DeterministicConstraintSolver } from "../src/server/inference/constraintSolver.js";
import { FesDraftBuilder } from "../src/server/inference/fesDraftBuilder.js";
import { validateEngineeringData } from "../src/server/validate.js";

async function runG3UploadTest() {
  console.log("==================================================");
  console.log("   RUNNING G3-AB MULTIMODAL REFERENCE UPLOAD TEST ");
  console.log("==================================================\n");

  const sku = "G2.3-ROUNDARM-SOFA-2650";
  const knownDims = { width: 2650, depth: 1050, height: 850 };

  // Create mock image upload buffers
  const dummyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );

  const images = {
    hero: { buffer: dummyPng, mimeType: "image/png", filename: "hero.png", url: "/uploads/references/test/hero.png" },
    front: { buffer: dummyPng, mimeType: "image/png", filename: "front.png", url: "/uploads/references/test/front.png" },
    side: { buffer: dummyPng, mimeType: "image/png", filename: "side.png", url: "/uploads/references/test/side.png" },
    top: { buffer: dummyPng, mimeType: "image/png", filename: "top.png", url: "/uploads/references/test/top.png" },
  };

  console.log("[1/4] Running ReferenceObservationService.observeFromReferenceImages...");
  const obsService = new ReferenceObservationService();
  const { observationDocument, telemetry } = await obsService.observeFromReferenceImages({
    sku,
    knownDimensions: knownDims,
    images,
    provider: "routerhub",
    model: "gemini-3.6-flash",
  });

  if (!observationDocument || observationDocument.components.length === 0) {
    throw new Error("Failed to produce observationDocument from reference images");
  }
  console.log(`  ✓ Extracted ${observationDocument.components.length} components from multimodal reference images`);
  console.log(`  ✓ Reference views mapped: ${observationDocument.references.map((r) => r.type).join(", ")}`);

  console.log("\n[2/4] Testing Constraint Solver on Multimodal Observations...");
  const solver = new DeterministicConstraintSolver();
  const report = solver.solve({
    sku: observationDocument.sku,
    knownOverallWidthMm: observationDocument.knownOverallDimensions.width.value,
    knownOverallDepthMm: observationDocument.knownOverallDimensions.depth.value,
    knownOverallHeightMm: observationDocument.knownOverallDimensions.height.value,
    componentObservations: observationDocument.components,
  });

  console.log(`  ✓ Solved overall width lock: ${report.overallWidthMm.value} mm`);

  console.log("\n[3/4] Building Draft FES & Running Validation...");
  const builder = new FesDraftBuilder();
  const { draft, fes } = builder.buildDraft(observationDocument, report);
  const validation = validateEngineeringData(fes);

  console.log(`  ✓ Validation status: ${validation.valid ? "PASS" : "FAIL"}`);

  if (!validation.valid) {
    throw new Error("Validation failed on multimodal FES draft");
  }

  console.log("\n==================================================");
  console.log("   MULTIMODAL REFERENCE UPLOAD RESULT: PASS       ");
  console.log("==================================================");
}

runG3UploadTest().catch((err) => {
  console.error("\n❌ G3 MULTIMODAL TEST FAILED:", err);
  process.exit(1);
});
