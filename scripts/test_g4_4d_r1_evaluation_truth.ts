import {
  CANONICAL_PROJECTION_AXES,
  getReferenceAdequacy,
  GeometryResidualReportSchema,
  ProjectionAxisContractSchema,
  ReferenceAdequacySchema,
} from "../src/shared/geometryEvaluation.js";
import {
  projectMeshToView,
  computeProjectionSanity,
} from "../src/client/utils/geometryEvaluation/meshProjector.js";
import { computeContourDistances } from "../src/client/utils/geometryEvaluation/contourDistance.js";
import { evaluateGeometryResidual } from "../src/client/utils/geometryEvaluation/geometryEvaluator.js";
import * as THREE from "three";

function runTests() {
  console.log("==================================================");
  console.log("G4-4D-R1 GEOMETRY EVALUATION TRUTH CLOSURE TEST");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${detail || "Assertion failed"}`);
      failed++;
    }
  }

  // A. Front Projection Axis Contract (XZ)
  const frontAxis = CANONICAL_PROJECTION_AXES.front;
  assert(
    frontAxis.horizontalAxis === "X" && frontAxis.verticalAxis === "Z",
    "Test A: Front projection contract enforces XZ (X horizontal, Z vertical)"
  );

  // B. Side Projection Axis Contract (YZ)
  const sideAxis = CANONICAL_PROJECTION_AXES.side;
  assert(
    sideAxis.horizontalAxis === "Y" && sideAxis.verticalAxis === "Z",
    "Test B: Side projection contract enforces YZ (Y horizontal, Z vertical)"
  );

  // C. Top Projection Axis Contract (XY)
  const topAxis = CANONICAL_PROJECTION_AXES.top;
  assert(
    topAxis.horizontalAxis === "X" && topAxis.verticalAxis === "Y",
    "Test C: Top projection contract enforces XY (X horizontal, Y vertical)"
  );

  // D. Reference Adequacy Mapping
  assert(
    getReferenceAdequacy("workbook_profile") === "ENGINEERING_PROFILE",
    "Test D1: workbook_profile maps to ENGINEERING_PROFILE"
  );
  assert(
    getReferenceAdequacy("workbook_loft") === "ENGINEERING_LOFT",
    "Test D2: workbook_loft maps to ENGINEERING_LOFT"
  );
  assert(
    getReferenceAdequacy("cad_component_contour") === "CAD_CONTOUR",
    "Test D3: cad_component_contour maps to CAD_CONTOUR"
  );
  assert(
    getReferenceAdequacy("proxy_fallback") === "PROXY_ONLY",
    "Test D4: proxy_fallback maps to PROXY_ONLY"
  );

  // E. Real Gate Rule - Proxy Fallback Rejection
  const proxyEval = evaluateGeometryResidual({
    artifactId: "art-arm-01",
    component: {
      id: "ARM-L-OUT",
      size: { x: 220, y: 920, z: 620 },
    },
  });
  assert(
    proxyEval.report.geometrySource === "proxy_fallback" &&
      proxyEval.report.gateEligible === false &&
      proxyEval.report.status === "REFERENCE_INSUFFICIENT",
    "Test E: proxy_fallback forces gateEligible=false and status=REFERENCE_INSUFFICIENT"
  );

  // F. Projected Width/Height Ratios
  const sanity = computeProjectionSanity(200, 600, 220, 620);
  assert(
    sanity.widthRatio === 1.1 && sanity.heightRatio === 1.033,
    "Test F: computeProjectionSanity calculates width/height ratios accurately",
    `Got widthRatio=${sanity.widthRatio}, heightRatio=${sanity.heightRatio}`
  );

  // G. Axis Mismatch Detection (axisSuspect)
  const badSanity = computeProjectionSanity(200, 600, 1000, 100);
  assert(
    badSanity.axisSuspect === true,
    "Test G: computeProjectionSanity sets axisSuspect=true for severe aspect/size mismatch"
  );

  // H. Symmetric Contour Distance Invariance (AI <-> Eng swap)
  const c1 = [
    { x: -100, y: -300 },
    { x: 100, y: -300 },
    { x: 100, y: 300 },
    { x: -100, y: 300 },
  ];
  const c2 = [
    { x: -110, y: -310 },
    { x: 110, y: -310 },
    { x: 110, y: 310 },
    { x: -110, y: 310 },
  ];
  const distForward = computeContourDistances(c1, c2, 50);
  const distReverse = computeContourDistances(c2, c1, 50);
  assert(
    distForward.meanSymmetricContourDistanceMm === distReverse.meanSymmetricContourDistanceMm,
    "Test H: Symmetric contour distance is equal when AI and Eng inputs are swapped",
    `Forward=${distForward.meanSymmetricContourDistanceMm}, Reverse=${distReverse.meanSymmetricContourDistanceMm}`
  );

  // I. Symmetric Contour Metrics Non-negative
  assert(
    distForward.meanSymmetricContourDistanceMm >= 0 &&
      distForward.p95ContourDistanceMm >= 0 &&
      distForward.maxContourDistanceMm >= 0,
    "Test I: Symmetric contour distance metrics are non-negative numbers"
  );

  // J. Cross-View Consistency Metric
  const authEval = evaluateGeometryResidual({
    artifactId: "art-arm-01",
    component: {
      id: "ARM-L-OUT",
      size: { x: 220, y: 920, z: 620 },
      workbookLoftGroup: "ARM_OUTER_LOFT",
    },
  });
  assert(
    typeof authEval.report.crossViewConsistency === "number" &&
      authEval.report.crossViewConsistency >= 0 &&
      authEval.report.crossViewConsistency <= 100,
    "Test J: Cross-view consistency metric is present and in [0, 100]",
    `Got ${authEval.report.crossViewConsistency}`
  );

  // K. GeometryResidualReportSchema Validation
  let schemaPassed = false;
  try {
    GeometryResidualReportSchema.parse(authEval.report);
    schemaPassed = true;
  } catch (err: any) {
    console.error("Schema validation failed:", err);
  }
  assert(schemaPassed, "Test K: Authoritative report strictly passes GeometryResidualReportSchema");

  // L. Mandatory productionTruth=false
  assert(
    authEval.report.productionTruth === false,
    "Test L: Mandatory productionTruth is false"
  );

  // M. Non-Proxy Reference Geometry Gate Eligibility
  assert(
    authEval.report.geometrySource === "workbook_loft" &&
      authEval.report.referenceAdequacy === "ENGINEERING_LOFT" &&
      authEval.report.gateEligible === true &&
      authEval.report.status === "EVALUATED",
    "Test M: workbook_loft sets referenceAdequacy=ENGINEERING_LOFT, gateEligible=true, status=EVALUATED"
  );

  // N. Immutability Verification
  const inputComponent = {
    id: "ARM-L-OUT",
    size: { x: 220, y: 920, z: 620 },
    workbookLoftGroup: "ARM_OUTER_LOFT",
  };
  const compCopy = JSON.stringify(inputComponent);
  evaluateGeometryResidual({ artifactId: "art-arm-01", component: inputComponent });
  assert(
    JSON.stringify(inputComponent) === compCopy,
    "Test N: Evaluation process does not mutate input component structure"
  );

  // O. Determinism Verification
  const eval1 = evaluateGeometryResidual({ artifactId: "art-arm-01", component: inputComponent });
  const eval2 = evaluateGeometryResidual({ artifactId: "art-arm-01", component: inputComponent });
  assert(
    JSON.stringify(eval1.report) === JSON.stringify(eval2.report),
    "Test O: Identical evaluation inputs produce 100% identical outputs"
  );

  // P. Real Acceptance Test: part-arm-left mapped to ARM-L-OUT
  const realAcceptance = evaluateGeometryResidual({
    artifactId: "part-arm-left",
    component: {
      id: "ARM-L-OUT",
      size: { x: 220, y: 920, z: 620 },
      workbookLoftGroup: "ARM_OUTER_LOFT_GROUP",
    },
    meshOptions: {
      bounds: {
        min: { x: -110, y: -460, z: 0 },
        max: { x: 110, y: 460, z: 620 },
      },
    },
  });

  console.log("\n==================================================");
  console.log("REAL ACCEPTANCE REPORT (part-arm-left -> ARM-L-OUT)");
  console.log("==================================================");
  console.log(`Component ID:        ${realAcceptance.report.componentId}`);
  console.log(`Artifact ID:         ${realAcceptance.report.artifactId}`);
  console.log(`Geometry Source:     ${realAcceptance.report.geometrySource}`);
  console.log(`Ref Adequacy:        ${realAcceptance.report.referenceAdequacy}`);
  console.log(`Gate Eligible:       ${realAcceptance.report.gateEligible}`);
  console.log(`Evaluation Status:   ${realAcceptance.report.status}`);
  console.log(`Overall Score:       ${realAcceptance.report.overallScore}/100`);
  console.log(`Quality Level:       ${realAcceptance.report.qualityLevel}`);
  console.log(`Cross-View Consist.: ${realAcceptance.report.crossViewConsistency}%`);
  console.log(`productionTruth:     ${realAcceptance.report.productionTruth}`);

  assert(
    realAcceptance.report.geometrySource !== "proxy_fallback" &&
      realAcceptance.report.gateEligible === true &&
      realAcceptance.report.status === "EVALUATED",
    "Test P: Real acceptance test resolves authoritative source, gateEligible=true, and status=EVALUATED"
  );

  console.log("\n==================================================");
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
