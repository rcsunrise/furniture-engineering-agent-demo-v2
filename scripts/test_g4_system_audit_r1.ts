import assert from "assert";
import { globalEngineeringSessionStore } from "../src/server/engineeringSessionStore.js";
import { parseWorkbook } from "../src/server/excel.js";
import { isProductionEligible, resolveComponentBinding } from "../src/shared/engineeringSession.js";
import { alignmentSessionStore } from "../src/server/alignment/alignmentSessionStore.js";
import fs from "fs";
import path from "path";

async function runR1TestSuite() {
  console.log("==================================================");
  console.log("RUNNING G4-SYSTEM-AUDIT-R1 RUNTIME SESSION TEST SUITE");
  console.log("==================================================\n");

  globalEngineeringSessionStore.clear();
  alignmentSessionStore.clear();

  // TEST 1: Initial Session Creation
  console.log("TEST 1: Initial Engineering Session Creation");
  const session1 = globalEngineeringSessionStore.getActiveSession("workspace-r1");
  assert.strictEqual(session1.workspaceId, "workspace-r1");
  assert.strictEqual(session1.status, "created");
  assert.strictEqual(session1.aiMeshArtifactIds.length, 0);
  assert.strictEqual(session1.componentBindings.length, 0);
  console.log("  ✓ Session created with clean initial state\n");

  // TEST 2: Mesh Completion Without FES -> Unresolved Binding
  console.log("TEST 2: Mesh Completion Without FES (Strict Unresolved State)");
  const meshAttachResult = globalEngineeringSessionStore.attachMeshArtifactToSession({
    workspaceId: "workspace-r1",
    sessionId: session1.id,
    partId: "ARM-L-OUT",
    artifactId: "art-glb-1001",
  });

  assert.strictEqual(meshAttachResult.status, "UNRESOLVED_BINDING");
  assert.strictEqual(meshAttachResult.binding, null);
  assert.strictEqual(meshAttachResult.session.aiMeshArtifactIds.includes("art-glb-1001"), true);
  assert.strictEqual(meshAttachResult.session.status, "mesh_ready");
  console.log("  ✓ Mesh attached to session; binding safely remains UNRESOLVED_BINDING without FES\n");

  // TEST 3: FES Upload -> Attach to Same Session & Auto-Resolve Binding
  console.log("TEST 3: FES Upload -> Same Session Attachment & Automatic Binding Resolution");
  const samplePath = path.join(process.cwd(), "sample", "est_sofa_roundarm_2650.xlsx");
  assert.strictEqual(fs.existsSync(samplePath), true, "Sample Excel file must exist");

  const buf = fs.readFileSync(samplePath);
  const parseResult = parseWorkbook(buf, "sofa_standard_v1.xlsx");
  assert.strictEqual(parseResult.success, true, "Excel parse must succeed");
  const fesDoc = parseResult.fes;

  console.log("  Components in FES:", fesDoc.components.map((c: any) => c.id));

  const fesAttachResult = globalEngineeringSessionStore.attachFesToSession(session1.id, fesDoc, "workspace-r1");
  assert.strictEqual(fesAttachResult.session.fesDocumentId, `${fesDoc.sku}_FES`);
  assert.strictEqual(fesAttachResult.session.sku, fesDoc.sku);
  assert.strictEqual(fesAttachResult.resolvedBindings.length > 0, true, "Existing mesh must auto-resolve against newly attached FES");

  const resolved = fesAttachResult.resolvedBindings[0];
  assert.strictEqual(resolved.componentId, "ARM-L");
  assert.strictEqual(resolved.artifactId, "art-glb-1001");
  assert.strictEqual(resolved.productionTruth, false, "AI mesh binding must NEVER set productionTruth = true");
  console.log(`  ✓ FES attached (${fesDoc.sku}); auto-resolved '${resolved.partId}' -> component '${resolved.componentId}'\n`);

  // TEST 4: Alignment Session Auto-Creation
  console.log("TEST 4: Alignment Session Auto-Creation");
  assert.strictEqual(fesAttachResult.session.alignmentSessions.length > 0, true, "Alignment session must be auto-created");
  const alignSessionId = fesAttachResult.session.alignmentSessions[0];
  const alignSession = alignmentSessionStore.getSession(alignSessionId);

  assert.notStrictEqual(alignSession, undefined, "Alignment session must exist in alignmentSessionStore");
  assert.strictEqual(alignSession?.artifactId, "art-glb-1001");
  assert.strictEqual(alignSession?.componentId, "ARM-L");
  assert.strictEqual(alignSession?.productionTruth, false);
  assert.strictEqual(fesAttachResult.session.status, "alignment_ready");
  console.log(`  ✓ Auto-created Alignment Session '${alignSessionId}' for component '${alignSession?.componentId}'\n`);

  // TEST 5: Ambiguous Mesh Binding -> UNRESOLVED_BINDING
  console.log("TEST 5: Ambiguous Mesh Binding Handling");
  const ambigResult = globalEngineeringSessionStore.attachMeshArtifactToSession({
    workspaceId: "workspace-r1",
    sessionId: session1.id,
    partId: "panel", // Ambiguous part name
    artifactId: "art-glb-1002",
    fesDocument: fesDoc,
  });

  assert.strictEqual(ambigResult.status, "UNRESOLVED_BINDING");
  assert.strictEqual(ambigResult.binding, null);
  console.log("  ✓ Ambiguous partId 'panel' safely returned UNRESOLVED_BINDING without guessing\n");

  // TEST 6: Production Eligibility Gate
  console.log("TEST 6: Production Eligibility Gate Check");
  const eligibility = isProductionEligible(fesAttachResult.session, fesDoc);
  assert.strictEqual(eligibility.eligible, false, "Session with AI mesh or proxy geometries must NOT be production eligible");
  assert.strictEqual(eligibility.issues.length > 0, true, "Diagnostic issues must be reported");
  console.log(`  ✓ Gate strictly blocked production status: '${eligibility.reason}'\n`);

  console.log("==================================================");
  console.log("ALL G4-SYSTEM-AUDIT-R1 RUNTIME SESSION TESTS PASSED!");
  console.log("==================================================");
}

runR1TestSuite().catch((err) => {
  console.error("G4-SYSTEM-AUDIT-R1 TEST FAILED:", err);
  process.exit(1);
});
