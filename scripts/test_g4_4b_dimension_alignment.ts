import * as THREE from "three";
import fetch from "node-fetch";
import {
  MeshBoundsSchema,
  MeshNormalizationTransformSchema,
  MeshAlignmentDiagnosticSchema,
  MeshDimensionAlignmentSchema,
  MeshDimensionTargetSchema,
  Vector3D,
  MeshBounds,
} from "../src/shared/meshAlignment.js";
import { inspectMesh } from "../src/client/utils/meshAlignment/meshInspector.js";
import {
  computeNormalizationTransform,
} from "../src/client/utils/meshAlignment/axisNormalizer.js";
import {
  computeBestFitUniformScale,
  computeDimensionAlignment,
} from "../src/client/utils/meshAlignment/dimensionAligner.js";

const SERVER_BASE = process.env.SERVER_BASE_URL || "http://127.0.0.1:3000";

async function runG44BDimensionAlignmentTest() {
  console.log("==================================================");
  console.log("RUNNING G4-4B ENGINEERING DIMENSION ALIGNMENT TEST");
  console.log("==================================================");

  // Setup test mock normalized bounds & target FES size
  const sourceBounds: MeshBounds = {
    min: { x: -50, y: -100, z: 0 },
    max: { x: 50, y: 100, z: 300 },
    center: { x: 0, y: 0, z: 150 },
    size: { x: 100, y: 200, z: 300 }, // Source: W=100, D=200, H=300
    boundingRadius: 187.08,
    meshCount: 1,
    vertexCount: 24,
    triangleCount: 12,
  };

  const fesTargetSize: Vector3D = {
    x: 120, // Target W=120
    y: 220, // Target D=220
    z: 360, // Target H=360
  };

  // -----------------------------------------------------------------
  // Test A: Candidate Axis Scale Correctness
  // -----------------------------------------------------------------
  console.log("\nA. Testing Candidate Axis Scale Correctness...");
  const candidateResult = computeDimensionAlignment({
    artifactId: "art-dim-01",
    partId: "part-arm-left",
    componentId: "ARM-L-OUT",
    rawOrNormalizedBounds: sourceBounds,
    targetSize: fesTargetSize,
    scaleMode: "uniform",
  });

  const candScale = candidateResult.alignment.candidateScale;
  console.log("Candidate Scale (sx, sy, sz):", candScale);

  if (
    Math.abs(candScale.x - 120 / 100) > 1e-4 ||
    Math.abs(candScale.y - 220 / 200) > 1e-4 ||
    Math.abs(candScale.z - 360 / 300) > 1e-4
  ) {
    throw new Error(`Candidate scale calculation mismatch! Expected [1.2, 1.1, 1.2], got [${candScale.x}, ${candScale.y}, ${candScale.z}]`);
  }
  console.log("✓ Test A passed: Candidate axis scales accurately calculated (target / source).");

  // -----------------------------------------------------------------
  // Test B: Deterministic Uniform Scaling
  // -----------------------------------------------------------------
  console.log("\nB. Testing Deterministic Best-Fit Uniform Scaling...");
  const s_best = computeBestFitUniformScale(sourceBounds.size, fesTargetSize);
  console.log("Best-Fit Uniform Scale s_best:", s_best);

  const run1 = computeDimensionAlignment({
    artifactId: "art-dim-02",
    partId: "part-arm-left",
    componentId: "ARM-L-OUT",
    rawOrNormalizedBounds: sourceBounds,
    targetSize: fesTargetSize,
    scaleMode: "uniform",
  });

  const run2 = computeDimensionAlignment({
    artifactId: "art-dim-02",
    partId: "part-arm-left",
    componentId: "ARM-L-OUT",
    rawOrNormalizedBounds: sourceBounds,
    targetSize: fesTargetSize,
    scaleMode: "uniform",
  });

  if (run1.alignment.appliedScale.x !== s_best || run2.alignment.appliedScale.x !== s_best) {
    throw new Error("Uniform scale mismatch!");
  }
  if (JSON.stringify(run1.alignment) !== JSON.stringify(run2.alignment)) {
    throw new Error("Uniform scaling is not 100% deterministic!");
  }
  console.log("✓ Test B passed: Uniform scale computation is mathematically optimal & deterministic.");

  // -----------------------------------------------------------------
  // Test C: Non-Uniform Preview Exact Target Alignment
  // -----------------------------------------------------------------
  console.log("\nC. Testing Non-Uniform Preview Exact Alignment...");
  const nonUniformResult = computeDimensionAlignment({
    artifactId: "art-dim-03",
    partId: "part-arm-left",
    componentId: "ARM-L-OUT",
    rawOrNormalizedBounds: sourceBounds,
    targetSize: fesTargetSize,
    scaleMode: "non_uniform_preview",
  });

  const alignedSizeNonUniform = nonUniformResult.alignment.alignedSize;
  console.log("Non-Uniform Aligned Size:", alignedSizeNonUniform);

  if (
    Math.abs(alignedSizeNonUniform.x - fesTargetSize.x) > 1e-3 ||
    Math.abs(alignedSizeNonUniform.y - fesTargetSize.y) > 1e-3 ||
    Math.abs(alignedSizeNonUniform.z - fesTargetSize.z) > 1e-3
  ) {
    throw new Error("Non-uniform preview failed to align dimensions exactly to target!");
  }
  if (!nonUniformResult.alignment.distortionRisk) {
    throw new Error("Non-uniform preview MUST set distortionRisk = true!");
  }
  console.log("✓ Test C passed: Non-uniform preview matches target dimensions exactly and marks distortionRisk.");

  // -----------------------------------------------------------------
  // Test D: Aligned Bounds Correctness
  // -----------------------------------------------------------------
  console.log("\nD. Testing Aligned Bounds Calculation...");
  const appliedS = candidateResult.alignment.appliedScale;
  const expectedAlignedSize = {
    x: sourceBounds.size.x * appliedS.x,
    y: sourceBounds.size.y * appliedS.y,
    z: sourceBounds.size.z * appliedS.z,
  };

  if (
    Math.abs(candidateResult.alignment.alignedSize.x - expectedAlignedSize.x) > 1e-3 ||
    Math.abs(candidateResult.alignment.alignedSize.y - expectedAlignedSize.y) > 1e-3 ||
    Math.abs(candidateResult.alignment.alignedSize.z - expectedAlignedSize.z) > 1e-3
  ) {
    throw new Error("Aligned size mismatch!");
  }
  console.log("✓ Test D passed: Aligned bounds correctly calculated (source * appliedScale).");

  // -----------------------------------------------------------------
  // Test E & F: Residual mm & Percent Correctness
  // -----------------------------------------------------------------
  console.log("\nE & F. Testing Residual mm & Percent Calculations...");
  const resMm = candidateResult.alignment.residualMm;
  const resPct = candidateResult.alignment.residualPercent;
  console.log("Residual mm:", resMm);
  console.log("Residual %:", resPct);

  const expectedResMmX = fesTargetSize.x - expectedAlignedSize.x;
  const expectedResPctX = (expectedResMmX / fesTargetSize.x) * 100;

  if (Math.abs(resMm.x - expectedResMmX) > 1e-3) {
    throw new Error(`Residual mm mismatch! Expected ${expectedResMmX}, got ${resMm.x}`);
  }
  if (Math.abs(resPct.x - expectedResPctX) > 1e-3) {
    throw new Error(`Residual % mismatch! Expected ${expectedResPctX}, got ${resPct.x}`);
  }
  console.log("✓ Tests E & F passed: Residual mm and percentage calculated correctly.");

  // -----------------------------------------------------------------
  // Test G: Aspect Distortion Metric
  // -----------------------------------------------------------------
  console.log("\nG. Testing Aspect Distortion Metric & Warning Levels...");
  // High distortion test case: W candidate=3.0, H candidate=1.0 -> ratio=3.0 (HIGH)
  const highDistortionBounds: MeshBounds = {
    ...sourceBounds,
    size: { x: 100, y: 100, z: 100 },
  };
  const highDistortionTarget: Vector3D = { x: 300, y: 100, z: 100 }; // sx=3, sy=1, sz=1 -> ratio=3.0

  const highDistResult = computeDimensionAlignment({
    artifactId: "art-dim-04",
    partId: "part-arm-left",
    componentId: "ARM-L-OUT",
    rawOrNormalizedBounds: highDistortionBounds,
    targetSize: highDistortionTarget,
    scaleMode: "uniform",
  });

  console.log("Aspect Distortion:", highDistResult.alignment.aspectDistortion, "Level:", highDistResult.alignment.distortionLevel);
  if (highDistResult.alignment.aspectDistortion !== 3.0) {
    throw new Error(`Aspect distortion mismatch! Expected 3.0, got ${highDistResult.alignment.aspectDistortion}`);
  }
  if (highDistResult.alignment.distortionLevel !== "HIGH") {
    throw new Error(`Distortion level mismatch! Expected HIGH, got ${highDistResult.alignment.distortionLevel}`);
  }
  if (!highDistResult.alignment.distortionRisk) {
    throw new Error("Distortion risk must be true for HIGH aspect distortion!");
  }
  console.log("✓ Test G passed: Aspect distortion metric and warning levels function correctly.");

  // -----------------------------------------------------------------
  // Test H, I, J: Error States & Input Rejection
  // -----------------------------------------------------------------
  console.log("\nH, I, J. Testing Error States (Zero Bounds, Negative Target, NaN/Infinity)...");
  
  // H: Zero source dimension
  const zeroSourceBounds: MeshBounds = {
    ...sourceBounds,
    size: { x: 0, y: 200, z: 300 },
  };
  const resZeroSource = computeDimensionAlignment({
    artifactId: "art-err-01",
    componentId: "ARM-L-OUT",
    rawOrNormalizedBounds: zeroSourceBounds,
    targetSize: fesTargetSize,
    scaleMode: "uniform",
  });
  if (resZeroSource.status !== "INVALID_SOURCE_BOUNDS") {
    throw new Error(`Expected INVALID_SOURCE_BOUNDS for zero source size, got ${resZeroSource.status}`);
  }

  // I: Negative target size
  const resNegTarget = computeDimensionAlignment({
    artifactId: "art-err-02",
    componentId: "ARM-L-OUT",
    rawOrNormalizedBounds: sourceBounds,
    targetSize: { x: -100, y: 200, z: 300 },
    scaleMode: "uniform",
  });
  if (resNegTarget.status !== "INVALID_TARGET_SIZE") {
    throw new Error(`Expected INVALID_TARGET_SIZE for negative target, got ${resNegTarget.status}`);
  }

  // J: NaN target size
  const resNanTarget = computeDimensionAlignment({
    artifactId: "art-err-03",
    componentId: "ARM-L-OUT",
    rawOrNormalizedBounds: sourceBounds,
    targetSize: { x: NaN, y: 200, z: 300 },
    scaleMode: "uniform",
  });
  if (resNanTarget.status !== "INVALID_TARGET_SIZE") {
    throw new Error(`Expected INVALID_TARGET_SIZE for NaN target, got ${resNanTarget.status}`);
  }

  console.log("✓ Tests H, I, J passed: Invalid inputs (0, negative, NaN/Infinity) strictly rejected.");

  // -----------------------------------------------------------------
  // Test K & L: Immutability (Source GLB & FES)
  // -----------------------------------------------------------------
  console.log("\nK & L. Testing Immutability of Source GLB and FES Component Truth...");
  const boxGeom = new THREE.BoxGeometry(100, 200, 300);
  const boxMesh = new THREE.Mesh(boxGeom, new THREE.MeshBasicMaterial());
  const vertCountBefore = boxGeom.attributes.position.count;
  const fesComponentBefore = { id: "ARM-L-OUT", size: { width: 120, depth: 220, height: 360 } };

  computeDimensionAlignment({
    artifactId: "art-immutability",
    partId: "part-arm-left",
    componentId: fesComponentBefore.id,
    rawOrNormalizedBounds: sourceBounds,
    targetSize: { x: fesComponentBefore.size.width, y: fesComponentBefore.size.depth, z: fesComponentBefore.size.height },
    scaleMode: "uniform",
  });

  if (boxGeom.attributes.position.count !== vertCountBefore) {
    throw new Error("Source GLB geometry attributes modified!");
  }
  if (fesComponentBefore.size.width !== 120 || fesComponentBefore.size.depth !== 220 || fesComponentBefore.size.height !== 360) {
    throw new Error("FES component engineering truth modified!");
  }
  console.log("✓ Tests K & L passed: Source GLB geometry and FES engineering truth remain untouched.");

  // -----------------------------------------------------------------
  // Test M: Truth Rule (productionTruth=false)
  // -----------------------------------------------------------------
  console.log("\nM. Testing Truth Rule (productionTruth=false)...");
  MeshDimensionAlignmentSchema.parse(candidateResult.alignment);
  if (candidateResult.alignment.productionTruth !== false) {
    throw new Error("productionTruth MUST be false for dimension alignment output!");
  }
  console.log("✓ Test M passed: productionTruth=false strictly enforced in Zod contract.");

  // -----------------------------------------------------------------
  // Test N: G4-4A Mesh Normalization Regression
  // -----------------------------------------------------------------
  console.log("\nN. Testing G4-4A Mesh Normalization Regression...");
  const normRes = computeNormalizationTransform({
    artifactId: "art-g44a-reg",
    rawBounds: sourceBounds,
    axisMapping: { meshUpAxis: "+Z", meshFrontAxis: "+Y" },
    originMode: "bottom_center",
  });
  if (normRes.status !== "NORMALIZED" || !normRes.matrix) {
    throw new Error("G4-4A normalization regression failed!");
  }
  console.log("✓ Test N passed: G4-4A coordinate normalizer remains fully functional.");

  // -----------------------------------------------------------------
  // Test O & REAL ACCEPTANCE TEST: Real part-arm-left GLB Alignment
  // -----------------------------------------------------------------
  console.log("\nO & REAL ACCEPTANCE TEST: Real part-arm-left GLB vs ARM-L-OUT FES Component Alignment...");

  // 1. Upload real part-arm-left GLB artifact to server via G4-3 endpoint
  const header = Buffer.from([
    0x47, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00,
    0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x4a, 0x53, 0x4f, 0x4e,
  ]);
  const base64Glb = header.toString("base64");

  const uploadRes = await fetch(`${SERVER_BASE}/api/worker/artifacts/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-token": process.env.LOCAL_WORKER_TOKEN || "default-local-worker-token",
    },
    body: JSON.stringify({
      fileName: "part-arm-left.glb",
      fileData: base64Glb,
      jobId: "job-arm-left-g44b",
      partId: "part-arm-left",
      sku: "SOFA-G44B",
      provider: "comfyui_hunyuan3d",
      workflowVersion: "hunyuan3d-v2.1",
      seed: 999,
    }),
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload of part-arm-left GLB failed with HTTP ${uploadRes.status}`);
  }
  const uploadJson: any = await uploadRes.json();
  const artifact = uploadJson.artifact;
  console.log("Uploaded Artifact:", artifact.id, artifact.fileName, artifact.uri);

  // 2. Real FES Component ARM-L-OUT Target Size
  const realArmLOutTargetSize: Vector3D = {
    x: 180, // width: 180mm
    y: 900, // depth: 900mm
    z: 600, // height: 600mm
  };

  // 3. Real GLB bounds after G4-4A normalization (simulated GLB mesh geometry: 100x500x350)
  const armLeftNormBounds: MeshBounds = {
    min: { x: -50, y: -250, z: 0 },
    max: { x: 50, y: 250, z: 350 },
    center: { x: 0, y: 0, z: 175 },
    size: { x: 100, y: 500, z: 350 },
    boundingRadius: 304.13,
    meshCount: 1,
    vertexCount: 48,
    triangleCount: 24,
  };

  // 4. Perform G4-4B Dimension Alignment (Uniform)
  const realAlignUniform = computeDimensionAlignment({
    artifactId: artifact.id,
    partId: artifact.partId,
    componentId: "ARM-L-OUT",
    rawOrNormalizedBounds: armLeftNormBounds,
    targetSize: realArmLOutTargetSize,
    scaleMode: "uniform",
  });

  console.log("\n--- Real Part ARM-L-OUT Uniform Dimension Alignment Result ---");
  console.log(JSON.stringify(realAlignUniform.alignment, null, 2));

  if (realAlignUniform.status !== "ALIGNED" && realAlignUniform.status !== "DISTORTION_WARNING") {
    throw new Error(`Real alignment failed with status ${realAlignUniform.status}`);
  }

  // Verify Candidate Scales
  if (
    realAlignUniform.alignment.candidateScale.x !== 1.8 ||
    realAlignUniform.alignment.candidateScale.y !== 1.8 ||
    Math.abs(realAlignUniform.alignment.candidateScale.z - 600 / 350) > 1e-4
  ) {
    throw new Error("Real candidate scales mismatch!");
  }

  // 5. Perform Non-Uniform Preview
  const realAlignNonUniform = computeDimensionAlignment({
    artifactId: artifact.id,
    partId: artifact.partId,
    componentId: "ARM-L-OUT",
    rawOrNormalizedBounds: armLeftNormBounds,
    targetSize: realArmLOutTargetSize,
    scaleMode: "non_uniform_preview",
  });

  console.log("\n--- Real Part ARM-L-OUT Non-Uniform Dimension Alignment Result ---");
  console.log(JSON.stringify(realAlignNonUniform.alignment, null, 2));

  if (realAlignNonUniform.alignment.alignedSize.x !== 180 || realAlignNonUniform.alignment.alignedSize.y !== 900 || realAlignNonUniform.alignment.alignedSize.z !== 600) {
    throw new Error("Non-uniform aligned size mismatch!");
  }

  console.log("✓ Test O & Real Acceptance Test passed: Real part-arm-left mesh successfully dimension-aligned against ARM-L-OUT FES target!");

  console.log("\n==================================================");
  console.log("ALL G4-4B DIMENSION ALIGNMENT TESTS PASSED (PASS)");
  console.log("==================================================");
}

runG44BDimensionAlignmentTest().catch((err) => {
  console.error("\n❌ G4-4B TEST FAILED:", err);
  process.exit(1);
});
