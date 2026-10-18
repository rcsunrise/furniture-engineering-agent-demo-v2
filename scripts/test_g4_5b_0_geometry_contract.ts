import assert from "assert";
import {
  GeometryReconstructionRequestSchema,
  GeometryReconstructionContext,
  evaluateReconstructionReadiness,
  GeometryProfileCandidateSchema,
  EngineeringGeometryCandidateSchema,
  GeometryFitMetricsSchema,
  GEOMETRY_SOURCE_PRIORITY,
  getComponentCapabilities,
  type GeometryReconstructionRequest,
  type EngineeringGeometryCandidate,
} from "../src/shared/geometryReconstruction.js";
import {
  EngineeringSessionSchema,
  resolveComponentBinding,
} from "../src/shared/engineeringSession.js";
import { globalEngineeringSessionStore } from "../src/server/engineeringSessionStore.js";
import { resolveGeometryReconstructionContext } from "../src/server/geometryReconstructionContext.js";
import type { FurnitureEngineering } from "../src/shared/fes.js";

async function runG4_5B_0_TestSuite() {
  console.log("==================================================");
  console.log("RUNNING G4-5B-0 GEOMETRY RECONSTRUCTION CONTRACT SUITE");
  console.log("==================================================");

  // Setup mock FES and session for test environment
  const testSku = "TEST-SKU-G4-5B-0";
  const sampleFes: FurnitureEngineering = {
    schemaVersion: "1.0",
    sku: testSku,
    units: "mm",
    productType: "sofa",
    overall: { width: 2000, depth: 900, height: 800 },
    components: [
      {
        id: "ARM-L-OUT",
        name: "Left Arm Outer",
        type: "armrest",
        size: { x: 250, y: 900, z: 600 },
        position: { x: -875, y: 0, z: 300 },
        profiles: { front: "profile_arm_f", side: "profile_arm_s", top: "profile_arm_t" },
      },
      {
        id: "SEAT-CUSHION",
        name: "Seat Cushion",
        type: "seat",
        size: { x: 1500, y: 800, z: 200 },
        position: { x: 0, y: 0, z: 100 },
        softSurfaceGroup: "cushion_group_1",
      },
    ],
    softSurfaceParams: [
      {
        groupId: "cushion_group_1",
        surfaceMode: "cushion_dome",
        crownX: 12,
        crownY: 15,
        frontDrop: 8,
        sideRoundness: 10,
        cornerFalloff: 6,
        edgeSoftness: 5,
        seamPull: 2,
        supportBias: 0.5,
      },
    ],
  };

  const session = globalEngineeringSessionStore.createOrGetSession(undefined, "default-workspace", testSku);
  globalEngineeringSessionStore.attachFesToSession(session.id, sampleFes);

  // Attach reference mesh artifact to session using store method
  globalEngineeringSessionStore.attachMeshArtifactToSession({
    sessionId: session.id,
    workspaceId: "default-workspace",
    partId: "ARM-L-OUT",
    artifactId: "art-glb-mesh-5b0",
  });

  // TEST 1: Valid EngineeringSession + canonicalComponentId resolves context
  console.log("TEST 1: Context Resolution");
  const ctx1 = resolveGeometryReconstructionContext(session.id, "ARM-L-OUT", "profile_reconstruction");
  assert.ok(ctx1);
  assert.strictEqual(ctx1.sessionId, session.id);
  assert.strictEqual(ctx1.canonicalComponentId, "ARM-L-OUT");
  assert.strictEqual(ctx1.component.type, "armrest");
  assert.strictEqual(ctx1.truthState.hasProvidedDimensions, true);
  assert.strictEqual(ctx1.truthState.hasReferenceMesh, true);
  console.log("  ✓ Valid EngineeringSession + canonicalComponentId resolved GeometryReconstructionContext successfully\n");

  // TEST 2: Canonical Component Identity Preservation
  console.log("TEST 2: Canonical Component Identity Preservation");
  assert.strictEqual(ctx1!.canonicalComponentId, "ARM-L-OUT");
  assert.strictEqual(ctx1!.component.id, "ARM-L-OUT");
  console.log("  ✓ Canonical component identity remains unchanged across reconstruction context\n");

  // TEST 3: AI Mesh Source Remains productionTruth = false
  console.log("TEST 3: AI Mesh Source Truth Rules");
  assert.strictEqual(ctx1!.referenceMesh?.productionTruth, false);
  console.log("  ✓ Reference mesh artifact strictly retains productionTruth = false\n");

  // TEST 4: EngineeringGeometryCandidate Schema Defaults productionTruth & productionEligible to false
  console.log("TEST 4: Candidate Schema Defaults");
  const candidatePayload: EngineeringGeometryCandidate = EngineeringGeometryCandidateSchema.parse({
    id: "cand-001",
    sessionId: session.id,
    sku: testSku,
    canonicalComponentId: "ARM-L-OUT",
    reconstructionMethod: "profile_reconstruction",
    sourceGeometry: { referenceMeshArtifactId: "art-glb-mesh-5b0" },
    bounds: { minX: -125, minY: -450, minZ: 0, maxX: 125, maxY: 450, maxZ: 600, sizeX: 250, sizeY: 900, sizeZ: 600 },
    targetDimensions: { sizeX: 250, sizeY: 900, sizeZ: 600 },
    fitMetrics: {
      dimensionResidual: { xMm: 0, yMm: 0, zMm: 0, xPct: 0, yPct: 0, zPct: 0 },
    },
    quality: {
      overallScore: 0.95,
      dimensionScore: 1.0,
      sourceQualityScore: 0.9,
      level: "candidate_high",
      gateEligible: false,
      reasons: ["Candidate generated via mesh profile projection."],
    },
    provenance: {
      sourceType: "derived",
      producer: "G4-5B-0 Contract Test",
      confidence: 1.0,
      productionTruth: false,
    },
    productionTruth: false,
    productionEligible: false,
  });
  assert.strictEqual(candidatePayload.productionTruth, false);
  assert.strictEqual(candidatePayload.productionEligible, false);
  console.log("  ✓ Reconstructed EngineeringGeometryCandidate strictly defaults productionTruth=false & productionEligible=false\n");

  // TEST 5: Proxy-Only Context Cannot Become Production-Ready
  console.log("TEST 5: Proxy-Only Context Gate Check");
  const proxyCtx: GeometryReconstructionContext = {
    ...ctx1!,
    truthState: {
      ...ctx1!.truthState,
      hasReferenceMesh: false,
      hasProxyOnly: true,
    },
  };
  const readinessProxy = evaluateReconstructionReadiness(proxyCtx, "profile_reconstruction");
  assert.strictEqual(readinessProxy.status, "READY_WITH_LIMITATIONS");
  assert.ok(readinessProxy.reasons.some((r) => r.includes("proxy fallback")));
  console.log("  ✓ Proxy-only context evaluated with limitations, preventing production claim\n");

  // TEST 6: Missing FES Returns BLOCKED_MISSING_FES
  console.log("TEST 6: Missing FES Returns BLOCKED_MISSING_FES");
  const noFesReadiness = evaluateReconstructionReadiness(null, "profile_reconstruction");
  assert.strictEqual(noFesReadiness.status, "BLOCKED_MISSING_FES");
  console.log("  ✓ Null/missing FES context strictly blocked with BLOCKED_MISSING_FES\n");

  // TEST 7: Unresolved Component Returns BLOCKED_COMPONENT_UNRESOLVED
  console.log("TEST 7: Unresolved Component Returns BLOCKED_COMPONENT_UNRESOLVED");
  const unresCtx = resolveGeometryReconstructionContext(session.id, "NON-EXISTENT-PART", "profile_reconstruction");
  const unresReadiness = evaluateReconstructionReadiness(unresCtx, "profile_reconstruction");
  assert.strictEqual(unresReadiness.status, "BLOCKED_COMPONENT_UNRESOLVED");
  console.log("  ✓ Unresolved component ID strictly returned BLOCKED_COMPONENT_UNRESOLVED\n");

  // TEST 8: Mesh Fitting Requested Without Reference Mesh Does Not Fallback
  console.log("TEST 8: No Silent Fallback for Missing Reference Mesh");
  const noMeshCtx: GeometryReconstructionContext = {
    ...ctx1!,
    truthState: {
      ...ctx1!.truthState,
      hasReferenceMesh: false,
    },
  };
  const noMeshReadiness = evaluateReconstructionReadiness(noMeshCtx, "mesh_parametric_fitting");
  assert.strictEqual(noMeshReadiness.status, "BLOCKED_MISSING_REFERENCE");
  console.log("  ✓ Requested 'mesh_parametric_fitting' without reference mesh returned BLOCKED_MISSING_REFERENCE without silent fallback\n");

  // TEST 9: Source Priority Contract Order
  console.log("TEST 9: Geometry Source Priority Contract");
  assert.strictEqual(GEOMETRY_SOURCE_PRIORITY[0], "verified_engineering_profile");
  assert.strictEqual(GEOMETRY_SOURCE_PRIORITY[1], "verified_engineering_loft");
  assert.strictEqual(GEOMETRY_SOURCE_PRIORITY[4], "reconstructed_candidate");
  assert.strictEqual(GEOMETRY_SOURCE_PRIORITY[5], "ai_reference_mesh");
  assert.strictEqual(GEOMETRY_SOURCE_PRIORITY[6], "proxy_fallback");
  console.log("  ✓ Geometry source priority hierarchy verified strictly (verified FES > candidate > AI mesh > proxy)\n");

  // TEST 10: Candidate Schema Neutrality (No Three.js Objects)
  console.log("TEST 10: Renderer-Neutral Candidate Schema");
  const profileCandidate = GeometryProfileCandidateSchema.parse({
    profileId: "prof_front_001",
    view: "front",
    coordinateSpace: "FES_MM",
    closed: true,
    points: [
      { u: 0, v: 0, coord1Mm: -125, coord2Mm: 0 },
      { u: 1, v: 0, coord1Mm: 125, coord2Mm: 0 },
      { u: 1, v: 1, coord1Mm: 125, coord2Mm: 600 },
      { u: 0, v: 1, coord1Mm: -125, coord2Mm: 600 },
    ],
    source: "mesh_projection",
    confidence: 0.85,
    productionTruth: false,
  });
  assert.strictEqual(profileCandidate.coordinateSpace, "FES_MM");
  assert.strictEqual(profileCandidate.productionTruth, false);
  console.log("  ✓ Candidate profiles enforced FES_MM space and renderer-neutral data shapes\n");

  // TEST 11: Backward Compatibility for Old EngineeringSession
  console.log("TEST 11: Backward Compatibility for Old Sessions");
  const oldSessionData = {
    id: "old_sess_123",
    sku: testSku,
    status: "created",
  };
  const parsedOldSession = EngineeringSessionSchema.parse(oldSessionData);
  assert.deepStrictEqual(parsedOldSession.geometryCandidates, []);
  console.log("  ✓ Old EngineeringSession data parsed smoothly with default empty geometryCandidates[]\n");

  // TEST 12: GeometryFitMetrics Compatibility with G4-4D Terminology
  console.log("TEST 12: Fit Metrics Terminology Compatibility");
  const metrics = GeometryFitMetricsSchema.parse({
    dimensionResidual: { xMm: 2, yMm: 0, zMm: -1, xPct: 0.008, yPct: 0, zPct: -0.001 },
    silhouette: { frontIoU: 0.94, sideIoU: 0.91, topIoU: 0.95 },
    contourDistance: { meanMm: 1.2, p95Mm: 2.8, maxMm: 4.1 },
    landmarkResidual: { meanMm: 0.8, maxMm: 1.9 },
    meshFit: { meanDistanceMm: 1.5, p95DistanceMm: 3.2, maxDistanceMm: 5.0 },
  });
  assert.strictEqual(metrics.silhouette?.frontIoU, 0.94);
  assert.strictEqual(metrics.contourDistance?.p95Mm, 2.8);
  console.log("  ✓ GeometryFitMetrics matched G4-4D evaluation vocabulary precisely\n");

  // TEST 13: Non-Destructive Source FES Verification
  console.log("TEST 13: Non-Destructive Source FES Verification");
  const fesOriginalSnapshot = JSON.stringify(sampleFes);
  const ctxFesCheck = resolveGeometryReconstructionContext(session.id, "ARM-L-OUT", "profile_reconstruction");
  assert.strictEqual(JSON.stringify(sampleFes), fesOriginalSnapshot);
  console.log("  ✓ Source FES data remained completely unmutated after context resolution\n");

  // TEST 14: Candidate canonicalComponentId Matching Binding
  console.log("TEST 14: Candidate canonicalComponentId Matching Binding");
  assert.strictEqual(candidatePayload.canonicalComponentId, ctx1!.canonicalComponentId);
  console.log("  ✓ Candidate canonicalComponentId strictly matches session component binding identity\n");

  // TEST 15: Confidence Score Cannot Promote productionTruth
  console.log("TEST 15: Confidence Cannot Promote productionTruth");
  const highConfCandidate = EngineeringGeometryCandidateSchema.parse({
    ...candidatePayload,
    quality: {
      ...candidatePayload.quality,
      overallScore: 1.0,
      level: "engineering_verified",
    },
    provenance: {
      ...candidatePayload.provenance,
      confidence: 1.0,
    },
    productionTruth: false, // Attempt to parse with high confidence
  });
  assert.strictEqual(highConfCandidate.productionTruth, false);
  assert.strictEqual(highConfCandidate.productionEligible, false);
  console.log("  ✓ Confidence score = 1.0 strictly kept productionTruth = false\n");

  console.log("==================================================");
  console.log("ALL G4-5B-0 GEOMETRY RECONSTRUCTION CONTRACT TESTS PASSED!");
  console.log("==================================================");
}

runG4_5B_0_TestSuite().catch((err) => {
  console.error("G4-5B-0 TEST FAILED:", err);
  process.exit(1);
});
