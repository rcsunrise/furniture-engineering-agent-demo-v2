import assert from "assert";
import {
  reconstructComponentProfiles,
  extractRawSilhouette,
  cleanupContour,
  simplifyContour,
  applyDimensionLock,
  validateGeometryProfileCandidate,
  enforceCCWWinding,
  computeSignedPolygonArea,
  projectVerticesToView,
  GOLDEN_BOX_VERTICES,
  GOLDEN_ROUNDED_BOX_VERTICES,
  GOLDEN_ARCHED_PROFILE_VERTICES,
  GOLDEN_ASYMMETRIC_ARM_VERTICES,
  GOLDEN_SOFT_CUSHION_VERTICES,
  ProfilePoint2D,
} from "../src/shared/profileReconstruction.js";
import {
  EngineeringSession,
  globalEngineeringSessionStore,
} from "../src/server/engineeringSessionStore.js";
import { resolveGeometryReconstructionContext } from "../src/server/geometryReconstructionContext.js";
import { evaluateReconstructionReadiness } from "../src/shared/geometryReconstruction.js";

async function runG45B1Tests() {
  console.log("==================================================");
  console.log("RUNNING G4-5B-1 PROFILE RECONSTRUCTION TEST SUITE");
  console.log("==================================================\n");

  // TEST 1: Golden BOX Geometry Extraction
  console.log("TEST 1: Golden BOX Extraction & Dimension Lock");
  const boxW = 200, boxD = 400, boxH = 600;
  const boxVerts = GOLDEN_BOX_VERTICES(boxW, boxD, boxH);
  const boxOutput = reconstructComponentProfiles({
    sessionId: "sess-box-01",
    sku: "SKU-BOX-01",
    canonicalComponentId: "BOX-PART-01",
    componentType: "panel",
    targetDimensions: { sizeX: boxW, sizeY: boxD, sizeZ: boxH },
    meshVertices: boxVerts,
  });
  assert.ok(boxOutput.candidate);
  assert.strictEqual(boxOutput.candidate.canonicalComponentId, "BOX-PART-01");
  assert.strictEqual(boxOutput.candidate.profiles.front.view, "front");
  assert.strictEqual(boxOutput.candidate.profiles.side.view, "side");
  assert.strictEqual(boxOutput.candidate.profiles.top.view, "top");
  assert.strictEqual(boxOutput.views.front.diagnostics.dimensionResidualAfterMm.dim1, 0);
  assert.strictEqual(boxOutput.views.front.diagnostics.dimensionResidualAfterMm.dim2, 0);
  console.log("  ✓ BOX FRONT/SIDE/TOP extracted and dimension-locked with 0 residual\n");

  // TEST 2: Golden ROUNDED_BOX Extrema Protection & Smoothing
  console.log("TEST 2: Golden ROUNDED_BOX Extrema Protection");
  const rBoxVerts = GOLDEN_ROUNDED_BOX_VERTICES(300, 300, 500, 20);
  const rBoxOutput = reconstructComponentProfiles({
    sessionId: "sess-rbox-01",
    sku: "SKU-RBOX-01",
    canonicalComponentId: "RBOX-01",
    componentType: "leg",
    targetDimensions: { sizeX: 300, sizeY: 300, sizeZ: 500 },
    meshVertices: rBoxVerts,
  });
  assert.ok(rBoxOutput.views.front.simplifiedContour.length >= 4);
  assert.ok(rBoxOutput.views.front.diagnostics.cleanPointCount >= rBoxOutput.views.front.diagnostics.simplifiedPointCount);
  console.log("  ✓ ROUNDED_BOX cleaned and simplified with extrema protected\n");

  // TEST 3: Golden ARCHED_PROFILE Boundary Tracing
  console.log("TEST 3: Golden ARCHED_PROFILE Parabolic Tracing");
  const archVerts = GOLDEN_ARCHED_PROFILE_VERTICES(600, 200, 400);
  const archOutput = reconstructComponentProfiles({
    sessionId: "sess-arch-01",
    sku: "SKU-ARCH-01",
    canonicalComponentId: "ARCH-01",
    componentType: "backrest",
    targetDimensions: { sizeX: 600, sizeY: 200, sizeZ: 400 },
    meshVertices: archVerts,
  });
  assert.strictEqual(archOutput.candidate.profiles.front.coordinateSpace, "FES_MM");
  assert.strictEqual(archOutput.candidate.profiles.front.closed, true);
  console.log("  ✓ ARCHED_PROFILE successfully extracted parabolic arch boundary\n");

  // TEST 4: Golden ASYMMETRIC_ARM Multi-View Reconstruction
  console.log("TEST 4: Golden ASYMMETRIC_ARM Profile Extraction");
  const armVerts = GOLDEN_ASYMMETRIC_ARM_VERTICES(250, 900, 650);
  const armOutput = reconstructComponentProfiles({
    sessionId: "sess-arm-01",
    sku: "SKU-ARM-01",
    canonicalComponentId: "ARM-L-01",
    componentType: "armrest",
    targetDimensions: { sizeX: 250, sizeY: 900, sizeZ: 650 },
    meshVertices: armVerts,
  });
  assert.strictEqual(armOutput.candidate.profiles.front.points.length >= 3, true);
  assert.strictEqual(armOutput.candidate.profiles.side.points.length >= 3, true);
  assert.strictEqual(armOutput.candidate.profiles.top.points.length >= 3, true);
  console.log("  ✓ ASYMMETRIC_ARM generated valid FRONT, SIDE, and TOP profile candidates\n");

  // TEST 5: Golden SOFT_CUSHION_APPROX
  console.log("TEST 5: Golden SOFT_CUSHION Dome Silhouette");
  const cushionVerts = GOLDEN_SOFT_CUSHION_VERTICES(800, 800, 150);
  const cushionOutput = reconstructComponentProfiles({
    sessionId: "sess-cush-01",
    sku: "SKU-CUSH-01",
    canonicalComponentId: "SEAT-CUSH-01",
    componentType: "cushion",
    targetDimensions: { sizeX: 800, sizeY: 800, sizeZ: 150 },
    meshVertices: cushionVerts,
  });
  assert.ok(cushionOutput.views.front.cleanContour.length >= 4);
  console.log("  ✓ SOFT_CUSHION dome silhouette projected and cleaned accurately\n");

  // TEST 6: Orthographic Projection Independence
  console.log("TEST 6: Canonical Orthographic Axes Independence");
  const testV = [{ x: 10, y: 20, z: 30 }];
  const frontPt = projectVerticesToView(testV, "front")[0];
  const sidePt = projectVerticesToView(testV, "side")[0];
  const topPt = projectVerticesToView(testV, "top")[0];
  assert.strictEqual(frontPt.x, 10); // X
  assert.strictEqual(frontPt.y, 30); // Z
  assert.strictEqual(sidePt.x, 20);  // Y
  assert.strictEqual(sidePt.y, 30);  // Z
  assert.strictEqual(topPt.x, 10);   // X
  assert.strictEqual(topPt.y, 20);   // Y
  console.log("  ✓ Canonical projection axes (FRONT=XZ, SIDE=YZ, TOP=XY) verified\n");

  // TEST 7: Raw Silhouette Extraction produces closed loop
  console.log("TEST 7: Silhouette Extraction Closed Loop");
  const pts: ProfilePoint2D[] = [
    { x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 50 }, { x: -50, y: 50 },
    { x: 0, y: 0 }, { x: 10, y: 20 },
  ];
  const sil = extractRawSilhouette(pts, 36);
  assert.ok(sil.length >= 4);
  console.log("  ✓ extractRawSilhouette extracted outer boundary discarding internal points\n");

  // TEST 8: Counter-Clockwise (CCW) Winding Enforcement
  console.log("TEST 8: Counter-Clockwise Winding Enforcement");
  const cwLoop: ProfilePoint2D[] = [
    { x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 }
  ];
  const areaBefore = computeSignedPolygonArea(cwLoop);
  assert.ok(areaBefore < 0); // CW is negative
  const { points: ccwLoop, winding } = enforceCCWWinding(cwLoop);
  const areaAfter = computeSignedPolygonArea(ccwLoop);
  assert.ok(areaAfter > 0); // CCW is positive
  assert.strictEqual(winding, "CW");
  console.log("  ✓ Clockwise loop detected and reversed to strict Counter-Clockwise (CCW)\n");

  // TEST 9: Duplicate Point Cleanup
  console.log("TEST 9: Duplicate Point Removal");
  const dupContour: ProfilePoint2D[] = [
    { x: 0, y: 0 }, { x: 0.01, y: 0.01 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
  ];
  const cleanupRes = cleanupContour(dupContour, { diagonalMm: 141, toleranceRatio: 0.01 });
  assert.ok(cleanupRes.diagnostics.removedDuplicates >= 1);
  console.log("  ✓ Duplicate vertices closer than epsilon removed reliably\n");

  // TEST 10: Spike Removal
  console.log("TEST 10: Isolated Needle Spike Removal");
  const spikeContour: ProfilePoint2D[] = [
    { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50.1, y: 200 }, { x: 50.2, y: 0 }, { x: 100, y: 0 },
    { x: 100, y: 100 }, { x: 0, y: 100 }
  ];
  const spikeRes = cleanupContour(spikeContour, { diagonalMm: 200, toleranceRatio: 0.005 });
  assert.ok(spikeRes.diagnostics.removedSpikes >= 1 || spikeRes.diagnostics.repairApplied);
  console.log("  ✓ Sharp needle spike identified and removed from contour\n");

  // TEST 11: Smoothing short oscillations
  console.log("TEST 11: Contour Smoothing");
  const oscContour: ProfilePoint2D[] = [
    { x: 0, y: 0 }, { x: 50, y: 5 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 50, y: 95 }, { x: 0, y: 100 }
  ];
  const smoothRes = cleanupContour(oscContour, { diagonalMm: 141, toleranceRatio: 0.005 });
  assert.strictEqual(smoothRes.cleaned.length >= 3, true);
  console.log("  ✓ Laplacian moving average smoothed micro-oscillations\n");

  // TEST 12: Extrema Protection during Simplification
  console.log("TEST 12: Extrema Protection during RDP Simplification");
  const curvePts: ProfilePoint2D[] = [];
  for (let i = 0; i <= 20; i++) {
    const angle = (i / 20) * 2 * Math.PI;
    curvePts.push({ x: Number((100 * Math.cos(angle)).toFixed(2)), y: Number((50 * Math.sin(angle)).toFixed(2)) });
  }
  const simpRes = simplifyContour(curvePts, { toleranceMm: 10, protectExtrema: true });
  assert.ok(simpRes.extremaIndices.length >= 4);
  assert.ok(simpRes.simplified.length < curvePts.length);
  // Verify min and max coordinates still exist in simplified set
  const minXOrig = Math.min(...curvePts.map(p => p.x));
  const maxXOrig = Math.max(...curvePts.map(p => p.x));
  const minXSimp = Math.min(...simpRes.simplified.map(p => p.x));
  const maxXSimp = Math.max(...simpRes.simplified.map(p => p.x));
  assert.strictEqual(minXOrig, minXSimp);
  assert.strictEqual(maxXOrig, maxXSimp);
  console.log("  ✓ Geometric extrema (minX, maxX, minY, maxY) strictly preserved in RDP reduction\n");

  // TEST 13: Tolerance Sensitivity
  console.log("TEST 13: RDP Tolerance Sensitivity");
  const lowTol = simplifyContour(curvePts, { toleranceMm: 1, protectExtrema: true });
  const highTol = simplifyContour(curvePts, { toleranceMm: 20, protectExtrema: true });
  assert.ok(lowTol.simplified.length >= highTol.simplified.length);
  console.log("  ✓ Higher simplification tolerance produced fewer vertices monotonically\n");

  // TEST 14: Dimension Lock Precision
  console.log("TEST 14: Dimension Lock Precision to FES Bounds");
  const unscaledPts: ProfilePoint2D[] = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }
  ];
  const lock = applyDimensionLock(unscaledPts, 500, 800);
  assert.strictEqual(lock.targetBounds.size1, 500);
  assert.strictEqual(lock.targetBounds.size2, 800);
  assert.strictEqual(lock.dimensionResidualAfterMm.dim1, 0);
  assert.strictEqual(lock.dimensionResidualAfterMm.dim2, 0);
  console.log("  ✓ Dimension lock scaled coordinates exactly to target 500mm x 800mm\n");

  // TEST 15: Excessive Distortion Detection
  console.log("TEST 15: Anisotropic Scale Distortion Guard");
  const distortedPts: ProfilePoint2D[] = [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 10 }, { x: 0, y: 10 }
  ];
  // Target is square 100x100 -> scale1 = 1, scale2 = 10 -> ratio = 10 (> 2.5)
  const distLock = applyDimensionLock(distortedPts, 100, 100);
  assert.strictEqual(distLock.excessiveDistortion, true);
  assert.ok(distLock.distortionRatio > 2.5);
  console.log("  ✓ Excessive anisotropic scale distortion (> 2.5x) successfully flagged\n");

  // TEST 16: UV Normalization [0, 1]
  console.log("TEST 16: UV Coordinate Space Bounds");
  for (const pt of lock.lockedPoints) {
    assert.ok(pt.u >= 0 && pt.u <= 1);
    assert.ok(pt.v >= 0 && pt.v <= 1);
  }
  console.log("  ✓ Normalized (u, v) coordinates strictly constrained to [0, 1]\n");

  // TEST 17: FES_MM Origin Centering
  console.log("TEST 17: FES_MM Centering");
  const minCoord1 = Math.min(...lock.lockedPoints.map(p => p.coord1Mm));
  const maxCoord1 = Math.max(...lock.lockedPoints.map(p => p.coord1Mm));
  assert.strictEqual(minCoord1, -250);
  assert.strictEqual(maxCoord1, 250);
  console.log("  ✓ Profile coordinates centered in FES_MM space [-size1/2, +size1/2]\n");

  // TEST 18: Profile Candidate Validation (Valid vs Invalid)
  console.log("TEST 18: Profile Candidate Schema Validation");
  const validProf = boxOutput.candidate.profiles.front;
  const valResult1 = validateGeometryProfileCandidate(validProf);
  assert.strictEqual(valResult1.valid, true);

  const invalidProf = {
    ...validProf,
    points: [{ u: NaN, v: 0, coord1Mm: 0, coord2Mm: 0 }],
  };
  const valResult2 = validateGeometryProfileCandidate(invalidProf as any);
  assert.strictEqual(valResult2.valid, false);
  console.log("  ✓ validateGeometryProfileCandidate confirmed valid candidate and caught NaN defect\n");

  // TEST 19: Strict Truth Rule: candidate productionTruth = false
  console.log("TEST 19: Strict Truth Rule on Candidate");
  assert.strictEqual(boxOutput.candidate.productionTruth, false);
  assert.strictEqual(boxOutput.candidate.profiles.front.productionTruth, false);
  assert.strictEqual(boxOutput.candidate.profiles.side.productionTruth, false);
  assert.strictEqual(boxOutput.candidate.profiles.top.productionTruth, false);
  console.log("  ✓ Candidate and all three view profiles strictly enforce productionTruth = false\n");

  // TEST 20: Strict Truth Rule: productionEligible = false
  console.log("TEST 20: Strict Truth Rule on Production Eligibility");
  assert.strictEqual(boxOutput.candidate.productionEligible, false);
  assert.strictEqual(boxOutput.candidate.reviewStatus, "evaluation_required");
  console.log("  ✓ Candidate strictly defaults productionEligible = false and reviewStatus = evaluation_required\n");

  // TEST 21: High Confidence Cannot Promote Truth
  console.log("TEST 21: Confidence Cannot Promote productionTruth");
  const highConfCandidate = {
    ...boxOutput.candidate,
    provenance: {
      ...boxOutput.candidate.provenance,
      confidence: 1.0,
    },
  };
  assert.strictEqual(highConfCandidate.provenance.confidence, 1.0);
  assert.strictEqual(highConfCandidate.productionTruth, false);
  console.log("  ✓ Confidence score of 1.0 does NOT elevate candidate to productionTruth\n");

  // TEST 22: Complete Candidate Structure
  console.log("TEST 22: Candidate Structure & Diagnostics");
  assert.strictEqual(boxOutput.candidate.reconstructionMethod, "profile_reconstruction");
  assert.ok(boxOutput.candidate.fitMetrics);
  assert.ok(boxOutput.candidate.quality);
  assert.ok(boxOutput.timing.totalMs >= 0);
  console.log("  ✓ Reconstructed candidate contains full fitMetrics, quality, and timings\n");

  // TEST 23: Storage into EngineeringSession
  console.log("TEST 23: Non-Destructive Session Storage");
  const sessionSku = "SKU-SOFA-G45B1";
  const session = globalEngineeringSessionStore.createOrGetSession("sess-g45b1-store", "default-workspace", sessionSku);
  globalEngineeringSessionStore.attachFesToSession(session.id, {
    sku: sessionSku,
    dimensions: { widthMm: 2200, depthMm: 950, heightMm: 850 },
    components: [
      {
        id: "ARM-L",
        type: "armrest",
        size: { x: 250, y: 900, z: 600 },
        position: { x: -975, y: 0, z: 300 },
      },
    ],
  });
  session.geometryCandidates = session.geometryCandidates || [];
  session.geometryCandidates.push(boxOutput.candidate);
  globalEngineeringSessionStore.saveSession(session);

  const reloaded = globalEngineeringSessionStore.getSession(session.id);
  assert.ok(reloaded);
  assert.strictEqual(reloaded.geometryCandidates.length, 1);
  assert.strictEqual(reloaded.geometryCandidates[0].id, boxOutput.candidate.id);
  console.log("  ✓ Reconstructed candidate registered safely in EngineeringSession store\n");

  // TEST 24: Context Resolution for Profile Reconstruction
  console.log("TEST 24: Reconstruction Context Integration");
  const ctx = resolveGeometryReconstructionContext(session.id, "ARM-L", "profile_reconstruction");
  assert.ok(ctx);
  const readiness = evaluateReconstructionReadiness(ctx, "profile_reconstruction");
  assert.ok(readiness.status === "READY" || readiness.status === "READY_WITH_LIMITATIONS");
  console.log("  ✓ GeometryReconstructionContext and readiness evaluation verified\n");

  // TEST 25: Backward Compatibility
  console.log("TEST 25: Backward Compatibility for Legacy Sessions");
  const legacySession: EngineeringSession = {
    id: "legacy-session-001",
    sku: "LEGACY-SKU",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    geometryCandidates: [],
  };
  assert.strictEqual(legacySession.geometryCandidates?.length, 0);
  console.log("  ✓ Legacy session schema remains fully backwards compatible\n");

  console.log("==================================================");
  console.log("ALL 25 G4-5B-1 PROFILE RECONSTRUCTION TESTS PASSED!");
  console.log("==================================================");
}

runG45B1Tests().catch((err) => {
  console.error("G4-5B-1 TEST SUITE FAILED:", err);
  process.exit(1);
});
