import assert from "assert";
import {
  resolveComponentBinding,
  validateComponentIdentityConsistency,
  ComponentIdentitySchema,
  ComponentArtifactBindingSchema,
  DEFAULT_COMPONENT_ALIAS_TABLE,
} from "../src/shared/engineeringSession.js";
import { createAlignmentSession } from "../src/shared/alignmentSession.js";
import { FurnitureEngineering } from "../src/shared/fes.js";

async function runR2TestSuite() {
  console.log("==================================================");
  console.log("RUNNING G4-SYSTEM-AUDIT-R2 CANONICAL IDENTITY SUITE");
  console.log("==================================================");

  const sampleFes: FurnitureEngineering = {
    schemaVersion: "1.0",
    sku: "TEST-SKU-R2",
    units: "mm",
    productType: "sofa",
    overall: { width: 2000, depth: 900, height: 800 },
    components: [
      {
        id: "ARM-L-OUT",
        name: "Left Arm Outer",
        type: "arm",
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
        profiles: { front: "profile_seat_f", side: "profile_seat_s", top: "profile_seat_t" },
      },
    ],
  };

  // TEST 1: Exact Canonical ID Binding (EXPLICIT_CANONICAL)
  console.log("TEST 1: Exact Canonical ID Binding (EXPLICIT_CANONICAL)");
  const res1 = resolveComponentBinding("ARM-L-OUT", "art-glb-001", sampleFes);
  assert.strictEqual(res1.status, "OK");
  assert.strictEqual(res1.binding?.componentId, "ARM-L-OUT");
  assert.strictEqual(res1.binding?.canonicalComponentId, "ARM-L-OUT");
  assert.strictEqual(res1.binding?.bindingMethod, "EXPLICIT_CANONICAL");
  console.log("  ✓ Exact ID 'ARM-L-OUT' bound to 'ARM-L-OUT' with EXPLICIT_CANONICAL\n");

  // TEST 2: Explicit Alias Table Binding (EXPLICIT_ALIAS)
  console.log("TEST 2: Explicit Alias Table Binding (EXPLICIT_ALIAS)");
  const res2 = resolveComponentBinding("part-arm-left", "art-glb-002", sampleFes);
  assert.strictEqual(res2.status, "OK");
  assert.strictEqual(res2.binding?.componentId, "ARM-L-OUT");
  assert.strictEqual(res2.binding?.canonicalComponentId, "ARM-L-OUT");
  assert.strictEqual(res2.binding?.bindingMethod, "EXPLICIT_ALIAS");
  console.log("  ✓ Alias 'part-arm-left' bound to 'ARM-L-OUT' with EXPLICIT_ALIAS\n");

  // TEST 3: Rejection of Fuzzy Substring Matches (UNRESOLVED_BINDING)
  console.log("TEST 3: Rejection of Fuzzy Substring Matches (UNRESOLVED_BINDING)");
  const res3a = resolveComponentBinding("arm", "art-glb-003", sampleFes);
  assert.strictEqual(res3a.status, "UNRESOLVED_BINDING");
  assert.strictEqual(res3a.binding, null);

  const res3b = resolveComponentBinding("panel-arm-left-random", "art-glb-004", sampleFes);
  assert.strictEqual(res3b.status, "UNRESOLVED_BINDING");
  assert.strictEqual(res3b.binding, null);
  console.log("  ✓ Unsafe fuzzy strings ('arm', 'panel-arm-left-random') strictly rejected without silent renaming\n");

  // TEST 4: ComponentIdentity Contract Schema Validation
  console.log("TEST 4: ComponentIdentity Contract Schema Validation");
  const identityData = ComponentIdentitySchema.parse({
    canonicalComponentId: "ARM-L-OUT",
    partId: "part-arm-left",
    aliases: ["part-arm-left", "armrest_left"],
    artifactIds: ["art-glb-001"],
    sessionId: "sess_r2_001",
    sku: "TEST-SKU-R2",
    bindingMethod: "EXPLICIT_ALIAS",
  });
  assert.strictEqual(identityData.canonicalComponentId, "ARM-L-OUT");
  assert.strictEqual(identityData.bindingMethod, "EXPLICIT_ALIAS");
  console.log("  ✓ ComponentIdentitySchema parsed successfully\n");

  // TEST 5: Alignment Session Integration & Identity Preservation
  console.log("TEST 5: Alignment Session Integration & Identity Preservation");
  const alignSess = createAlignmentSession({
    artifactId: "art-glb-001",
    partId: "part-arm-left",
    componentId: res2.binding!.componentId,
    canonicalComponentId: res2.binding!.canonicalComponentId,
    bindingMethod: res2.binding!.bindingMethod,
    sku: sampleFes.sku,
    engineeringDocumentId: `fes_${sampleFes.sku}`,
  });
  assert.strictEqual(alignSess.componentId, "ARM-L-OUT");
  assert.strictEqual(alignSess.canonicalComponentId, "ARM-L-OUT");
  assert.strictEqual(alignSess.bindingMethod, "EXPLICIT_ALIAS");
  console.log("  ✓ EngineeringAlignmentSession created with preserved canonical identity\n");

  // TEST 6: Session Consistency & Identity Matching Across Pipeline
  console.log("TEST 6: Session Consistency & Identity Matching Across Pipeline");
  const validCheck = validateComponentIdentityConsistency({
    canonicalComponentId: "ARM-L-OUT",
    partId: "part-arm-left",
    bindingComponentId: "ARM-L-OUT",
    alignmentComponentId: "ARM-L-OUT",
    fesComponentId: "ARM-L-OUT",
    assemblyComponentId: "ARM-L-OUT",
    selectedComponentId: "ARM-L-OUT",
  });
  assert.strictEqual(validCheck.consistent, true);
  assert.strictEqual(validCheck.issues.length, 0);
  console.log("  ✓ Consistent session validated across all 6 pipeline boundaries\n");

  // TEST 7: Detection of Identity Mismatch (COMPONENT_IDENTITY_MISMATCH)
  console.log("TEST 7: Detection of Identity Mismatch (COMPONENT_IDENTITY_MISMATCH)");
  const mismatchCheck = validateComponentIdentityConsistency({
    canonicalComponentId: "ARM-L-OUT",
    partId: "part-arm-left",
    bindingComponentId: "ARM-L", // Mismatch: ARM-L vs ARM-L-OUT
    alignmentComponentId: "ARM-L-OUT",
    fesComponentId: "ARM-L-OUT",
  });
  assert.strictEqual(mismatchCheck.consistent, false);
  assert.strictEqual(mismatchCheck.issues.length > 0, true);
  assert.strictEqual(mismatchCheck.issues[0].code, "COMPONENT_IDENTITY_MISMATCH");
  console.log(`  ✓ Identity mismatch caught: code='${mismatchCheck.issues[0].code}', message='${mismatchCheck.issues[0].message}'\n`);

  console.log("==================================================");
  console.log("ALL G4-SYSTEM-AUDIT-R2 CANONICAL IDENTITY TESTS PASSED!");
  console.log("==================================================");
}

runR2TestSuite().catch((err) => {
  console.error("G4-SYSTEM-AUDIT-R2 TEST FAILED:", err);
  process.exit(1);
});
