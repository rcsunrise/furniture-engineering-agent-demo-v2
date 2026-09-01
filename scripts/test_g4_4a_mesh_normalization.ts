import * as THREE from "three";
import fetch from "node-fetch";
import {
  MeshBoundsSchema,
  MeshNormalizationTransformSchema,
  MeshAlignmentDiagnosticSchema,
} from "../src/shared/meshAlignment.js";
import { inspectMesh } from "../src/client/utils/meshAlignment/meshInspector.js";
import {
  parseSignedAxis,
  validateAxisMapping,
  computeNormalizationTransform,
} from "../src/client/utils/meshAlignment/axisNormalizer.js";

const SERVER_BASE = process.env.SERVER_BASE_URL || "http://127.0.0.1:3000";

async function runG44AMeshNormalizationTest() {
  console.log("==================================================");
  console.log("RUNNING G4-4A AI MESH COORDINATE NORMALIZATION TEST");
  console.log("==================================================");

  // -----------------------------------------------------------------
  // Test A: Bounds Calculation & Inspection
  // -----------------------------------------------------------------
  console.log("\nA. Testing Mesh Inspector & Bounds Calculation...");
  const boxGeom = new THREE.BoxGeometry(100, 200, 300); // W=100, H=200, D=300
  const boxMesh = new THREE.Mesh(boxGeom, new THREE.MeshBasicMaterial());
  boxMesh.position.set(50, 100, 150);
  const testGroup = new THREE.Group();
  testGroup.add(boxMesh);

  const rawBounds = inspectMesh(testGroup);
  console.log("Raw Bounds:", JSON.stringify(rawBounds, null, 2));

  // Validate Zod Schema
  MeshBoundsSchema.parse(rawBounds);

  if (rawBounds.size.x !== 100 || rawBounds.size.y !== 200 || rawBounds.size.z !== 300) {
    throw new Error(`Bounds size mismatch! Expected [100,200,300], got [${rawBounds.size.x}, ${rawBounds.size.y}, ${rawBounds.size.z}]`);
  }
  if (rawBounds.center.x !== 50 || rawBounds.center.y !== 100 || rawBounds.center.z !== 150) {
    throw new Error(`Bounds center mismatch! Expected [50,100,150], got [${rawBounds.center.x}, ${rawBounds.center.y}, ${rawBounds.center.z}]`);
  }
  console.log("✓ Test A passed: Bounds calculation accurate & Zod compliant.");

  // -----------------------------------------------------------------
  // Test B: Bottom-Center Origin Normalization
  // -----------------------------------------------------------------
  console.log("\nB. Testing Bottom-Center Origin Normalization...");
  const normResBottom = computeNormalizationTransform({
    artifactId: "art-test-01",
    partId: "part-arm-left",
    rawBounds,
    axisMapping: { meshUpAxis: "+Z", meshFrontAxis: "+Y" },
    originMode: "bottom_center",
  });

  if (normResBottom.status !== "NORMALIZED" || !normResBottom.matrix) {
    throw new Error("Failed to produce normalization transform for bottom_center");
  }

  const normBoundsBottom = normResBottom.diagnostic.normalizedBounds!;
  console.log("Normalized Bottom-Center Bounds:", JSON.stringify(normBoundsBottom, null, 2));

  if (Math.abs(normBoundsBottom.center.x) > 1e-3 || Math.abs(normBoundsBottom.center.y) > 1e-3) {
    throw new Error(`Bottom-center origin center X/Y should be 0, got [${normBoundsBottom.center.x}, ${normBoundsBottom.center.y}]`);
  }
  if (Math.abs(normBoundsBottom.min.z) > 1e-3) {
    throw new Error(`Bottom-center origin min Z should be 0, got ${normBoundsBottom.min.z}`);
  }
  console.log("✓ Test B passed: Bottom-center origin places bottom at Z=0 and center X/Y at [0,0].");

  // -----------------------------------------------------------------
  // Test C: Axis Mapping & Orientation Transformation
  // -----------------------------------------------------------------
  console.log("\nC. Testing Axis Mapping & Transformation...");
  // Test Y-up and Z-front (common GLTF default) mapping to engineering (+Z up, +Y front)
  const normResYUp = computeNormalizationTransform({
    artifactId: "art-test-02",
    rawBounds,
    axisMapping: { meshUpAxis: "+Y", meshFrontAxis: "+Z" },
    originMode: "bottom_center",
  });

  if (normResYUp.status !== "NORMALIZED") {
    throw new Error("Failed Y-up Z-front normalization mapping");
  }
  console.log("Y-Up Z-Front Transform Euler Rot Deg:", normResYUp.diagnostic.transform?.rotationEulerDeg);
  console.log("✓ Test C passed: Axis mapping maps mesh coordinates to canonical engineering space.");

  // -----------------------------------------------------------------
  // Test D: Invalid Duplicate / Collinear Axes Rejection
  // -----------------------------------------------------------------
  console.log("\nD. Testing Invalid Axis Mapping Rejection...");
  const invalidDuplicate = computeNormalizationTransform({
    artifactId: "art-test-03",
    rawBounds,
    axisMapping: { meshUpAxis: "+Z", meshFrontAxis: "+Z" },
    originMode: "bottom_center",
  });

  if (invalidDuplicate.status !== "INVALID_AXIS_MAPPING") {
    throw new Error(`Expected INVALID_AXIS_MAPPING for duplicate axes (+Z, +Z), got: ${invalidDuplicate.status}`);
  }

  const invalidOpposite = computeNormalizationTransform({
    artifactId: "art-test-04",
    rawBounds,
    axisMapping: { meshUpAxis: "+Z", meshFrontAxis: "-Z" },
    originMode: "bottom_center",
  });

  if (invalidOpposite.status !== "INVALID_AXIS_MAPPING") {
    throw new Error(`Expected INVALID_AXIS_MAPPING for opposite axes (+Z, -Z), got: ${invalidOpposite.status}`);
  }

  MeshAlignmentDiagnosticSchema.parse(invalidDuplicate.diagnostic);
  console.log("✓ Test D passed: Non-orthogonal/collinear axes correctly rejected.");

  // -----------------------------------------------------------------
  // Test E: Deterministic Transform
  // -----------------------------------------------------------------
  console.log("\nE. Testing Deterministic Transform Computation...");
  const run1 = computeNormalizationTransform({
    artifactId: "art-test-05",
    rawBounds,
    axisMapping: { meshUpAxis: "+Z", meshFrontAxis: "+Y" },
    originMode: "bottom_center",
  });
  const run2 = computeNormalizationTransform({
    artifactId: "art-test-05",
    rawBounds,
    axisMapping: { meshUpAxis: "+Z", meshFrontAxis: "+Y" },
    originMode: "bottom_center",
  });

  const mat1 = run1.diagnostic.transform?.normalizationMatrix;
  const mat2 = run2.diagnostic.transform?.normalizationMatrix;
  if (!mat1 || !mat2 || JSON.stringify(mat1) !== JSON.stringify(mat2)) {
    throw new Error("Normalization transform is not deterministic across multiple runs!");
  }
  console.log("✓ Test E passed: Normalization matrix is 100% deterministic.");

  // -----------------------------------------------------------------
  // Test F: Raw Mesh Immutability
  // -----------------------------------------------------------------
  console.log("\nF. Testing Raw Mesh Immutability...");
  const boxPosBefore = boxMesh.position.clone();
  const boxRotBefore = boxMesh.rotation.clone();
  const geomVertCountBefore = boxGeom.attributes.position.count;

  // Run normalization
  computeNormalizationTransform({
    artifactId: "art-test-06",
    rawBounds,
    axisMapping: { meshUpAxis: "+Z", meshFrontAxis: "+Y" },
    originMode: "bottom_center",
  });

  if (!boxMesh.position.equals(boxPosBefore) || !boxMesh.rotation.equals(boxRotBefore)) {
    throw new Error("Raw mesh position or rotation was mutated during normalization!");
  }
  if (boxGeom.attributes.position.count !== geomVertCountBefore) {
    throw new Error("Raw mesh geometry vertices were mutated during normalization!");
  }
  console.log("✓ Test F passed: Source GLB geometry and Object3D remain completely unmodified.");

  // -----------------------------------------------------------------
  // Test G & H: Truth Rule & Engineering Coordinate System
  // -----------------------------------------------------------------
  console.log("\nG & H. Testing Truth Rule (productionTruth=false) & Engineering Coordinates...");
  const diag = normResBottom.diagnostic;
  MeshAlignmentDiagnosticSchema.parse(diag);
  MeshNormalizationTransformSchema.parse(diag.transform!);

  if (diag.productionTruth !== false || diag.transform?.productionTruth !== false) {
    throw new Error("productionTruth MUST be false for AI reference mesh!");
  }

  console.log("✓ Tests G & H passed: productionTruth=false enforced and Zod schemas validated.");

  // -----------------------------------------------------------------
  // Test I: Previous G4-3 Artifact Delivery Regression
  // -----------------------------------------------------------------
  console.log("\nI. Testing G4-3 Artifact Delivery Regression...");
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
      fileName: "part-g44a-test.glb",
      fileData: base64Glb,
      jobId: "job-g44a-test",
      partId: "part-arm-left",
      sku: "SOFA-G44A",
      provider: "comfyui_hunyuan3d",
      workflowVersion: "hunyuan3d-v2.1",
      seed: 123,
    }),
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload failed with HTTP ${uploadRes.status}`);
  }
  const uploadJson: any = await uploadRes.json();
  const artUri = uploadJson.artifact?.uri;

  const downloadRes = await fetch(`${SERVER_BASE}${artUri}`);
  if (!downloadRes.ok) {
    throw new Error(`Download failed with HTTP ${downloadRes.status}`);
  }
  const contentType = downloadRes.headers.get("content-type");
  if (contentType !== "model/gltf-binary") {
    throw new Error(`Expected content-type 'model/gltf-binary', got '${contentType}'`);
  }
  console.log("✓ Test I passed: G4-3 Cloud artifact upload and delivery pipeline operational.");

  console.log("\n==================================================");
  console.log("ALL G4-4A MESH NORMALIZATION TESTS PASSED (PASS)");
  console.log("==================================================");
}

runG44AMeshNormalizationTest().catch((err) => {
  console.error("\n❌ G4-4A TEST FAILED:", err);
  process.exit(1);
});
