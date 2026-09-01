import { sanitizeProvenance, isProductionTruthValid } from "../src/shared/provenance.js";
import {
  EngineeringSessionSchema,
  isProductionEligible,
  resolveComponentBinding,
  type EngineeringSession,
} from "../src/shared/engineeringSession.js";
import type { FESDocument } from "../src/shared/fes.js";

async function runSystemAudit01Tests() {
  console.log("=== GATE G4-SYSTEM-AUDIT-01: System Audit & Lineage Closure Test Suite ===");
  let passedCount = 0;
  let totalCount = 0;

  const assert = (condition: boolean, testName: string, detail: string = "") => {
    totalCount++;
    if (condition) {
      console.log(`✅ [PASS] Test ${totalCount}: ${testName} ${detail ? `- ${detail}` : ""}`);
      passedCount++;
    } else {
      console.error(`❌ [FAIL] Test ${totalCount}: ${testName} ${detail ? `- ${detail}` : ""}`);
    }
  };

  // Test A: Cross-boundary provenance rules enforce productionTruth=false for AI
  const aiProv = sanitizeProvenance({ sourceType: "ai_generated", confidence: 0.99, productionTruth: true, producer: "AI_VLM" });
  assert(
    aiProv.productionTruth === false && isProductionTruthValid("ai_generated", false) && !isProductionTruthValid("ai_generated", true),
    "A. AI generated data forcibly overrides productionTruth to false regardless of confidence",
    `confidence=0.99, productionTruth=${aiProv.productionTruth}`
  );

  // Test B: Proxy provenance rules enforce productionTruth=false
  const proxyProv = sanitizeProvenance({ sourceType: "proxy", confidence: 0.8, productionTruth: true, producer: "ThreeShapeFactory" });
  assert(
    proxyProv.productionTruth === false,
    "B. Proxy data forcibly overrides productionTruth to false",
    `sourceType=${proxyProv.sourceType}, productionTruth=${proxyProv.productionTruth}`
  );

  // Test C: Verified engineering input allows productionTruth=true
  const engProv = sanitizeProvenance({ sourceType: "engineering", confidence: 1.0, productionTruth: true, producer: "CAD_Kernel" });
  assert(
    engProv.productionTruth === true,
    "C. Verified engineering data permits productionTruth=true",
    `sourceType=${engProv.sourceType}, productionTruth=${engProv.productionTruth}`
  );

  // Test D: EngineeringSession schema initialization
  const sessionData: EngineeringSession = {
    id: "session-test-001",
    workspaceId: "test-ws",
    sku: "TEST-SOFA-SKU",
    status: "created",
    aiMeshArtifactIds: ["art-glb-100"],
    componentBindings: [],
    alignmentSessions: [],
    diagnostics: {
      image: "passed",
      localWorker: "ready",
      comfyui: "ready",
      hunyuan3d: "ready",
      glb: "ready",
      session: "ready",
      fes: "ready",
      alignment: "not_started",
      geometry: "not_started",
      assembly: "not_started",
      production: "blocked",
      issues: [],
    },
    productionTruth: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const parseResult = EngineeringSessionSchema.safeParse(sessionData);
  assert(parseResult.success, "D. EngineeringSession schema parses valid session payload");

  // Synthetic FES document for binding tests
  const sampleFes: FESDocument = {
    schemaVersion: "1.0",
    sku: "TEST-SOFA-SKU",
    components: [
      {
        id: "ARM-L-OUT",
        name: "Left Outer Armrest",
        type: "armrest",
        material: "wood",
        geometryMode: "soft_surface",
        size: { x: 250, y: 1000, z: 600 },
        position: { x: -1200, y: 0, z: 300 },
        productionTruth: true,
      },
      {
        id: "SEAT-CUSH-01",
        name: "Seat Cushion 1",
        type: "seat",
        material: "fabric",
        geometryMode: "box",
        size: { x: 800, y: 800, z: 150 },
        position: { x: 0, y: 0, z: 200 },
        productionTruth: false,
      },
    ],
    overallDimensions: { width: 2650, depth: 1050, height: 850 },
    cadProfiles: [],
  };

  // Test E: Component binding resolution for part-arm-left -> ARM-L-OUT
  const bindRes = resolveComponentBinding("part-arm-left", "art-glb-arm-01", sampleFes, "ai_reference_mesh", 0.92);
  assert(
    bindRes.status === "OK" && bindRes.binding !== null && bindRes.binding.componentId === "ARM-L-OUT" && bindRes.binding.productionTruth === false,
    "E. Component binding resolves 'part-arm-left' to 'ARM-L-OUT' with productionTruth=false",
    `Status: ${bindRes.status}, ComponentId: ${bindRes.binding?.componentId}`
  );

  // Test F: Unresolved component binding on missing/ambiguous part
  const missingBindRes = resolveComponentBinding("part-nonexistent", "art-glb-999", sampleFes);
  assert(
    missingBindRes.status === "UNRESOLVED_BINDING" && missingBindRes.binding === null,
    "F. Unmapped component returns UNRESOLVED_BINDING without silent fallback",
    `Status: ${missingBindRes.status}, Reason: ${missingBindRes.reason}`
  );

  // Test G: Production Eligibility - Proxy geometry blocks PRODUCTION_READY
  const eligibilityProxy = isProductionEligible(sessionData, sampleFes);
  assert(
    eligibilityProxy.eligible === false && eligibilityProxy.level === "DISPLAY_READY",
    "G. Proxy/box geometry blocks production eligibility",
    `Eligible: ${eligibilityProxy.eligible}, Level: ${eligibilityProxy.level}, Reason: ${eligibilityProxy.reason}`
  );

  // Test H: Production Eligibility - Missing FES document blocks
  const eligibilityNoFes = isProductionEligible(sessionData, null);
  assert(
    eligibilityNoFes.eligible === false && eligibilityNoFes.level === "DISPLAY_READY",
    "H. Missing FES document blocks production eligibility",
    `Eligible: ${eligibilityNoFes.eligible}, Level: ${eligibilityNoFes.level}`
  );

  // Test I: Verified CAD FES Document passes PRODUCTION_READY
  const verifiedFes: FESDocument = {
    schemaVersion: "1.0",
    sku: "TEST-SOFA-SKU",
    components: [
      {
        id: "ARM-L-OUT",
        name: "Left Outer Armrest",
        type: "armrest",
        material: "wood",
        geometryMode: "soft_surface",
        size: { x: 250, y: 1000, z: 600 },
        position: { x: -1200, y: 0, z: 300 },
        productionTruth: true,
      },
    ],
    overallDimensions: { width: 2650, depth: 1050, height: 850 },
    cadProfiles: [],
  };

  const verifiedSession: Partial<EngineeringSession> = {
    ...sessionData,
    productionTruth: true,
    componentBindings: [
      {
        partId: "ARM-L-OUT",
        componentId: "ARM-L-OUT",
        artifactId: "art-cad-001",
        bindingType: "cad_profile",
        confidence: 1.0,
        productionTruth: true,
        boundAt: new Date().toISOString(),
      },
    ],
  };

  const verifiedEligibility = isProductionEligible(verifiedSession, verifiedFes);
  assert(
    verifiedEligibility.eligible === true && verifiedEligibility.level === "PRODUCTION_READY",
    "I. Fully verified engineering session passes PRODUCTION_READY gate",
    `Eligible: ${verifiedEligibility.eligible}, Level: ${verifiedEligibility.level}`
  );

  console.log("--------------------------------------------------------------------------");
  console.log(`Summary: ${passedCount}/${totalCount} tests passed`);
  if (passedCount === totalCount) {
    console.log("RESULT: G4-SYSTEM-AUDIT-01 PASS");
    process.exit(0);
  } else {
    console.error("RESULT: G4-SYSTEM-AUDIT-01 FAIL");
    process.exit(1);
  }
}

runSystemAudit01Tests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
