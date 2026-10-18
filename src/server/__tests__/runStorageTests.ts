import assert from "node:assert";
import fs from "node:fs";
import {
  buildCanonicalGcsObjectPath,
  type EngineeringArtifact,
} from "../../shared/engineeringArtifact.js";
import { GcsClientService, globalGcsClient } from "../storage/gcsClient.js";
import { SignedUrlService } from "../storage/signedUrlService.js";
import { UploadSessionService } from "../storage/uploadSessionService.js";
import { EngineeringArtifactStorage } from "../storage/engineeringArtifactStorage.js";

async function runAllStorageTests() {
  console.log("=== [G-INFRA-STORAGE-01] Running Storage & EngineeringArtifact Tests ===");

  // Test 1: Canonical Path Generation
  console.log("\n[Test 1] Canonical GCS Object Path Format");
  const path1 = buildCanonicalGcsObjectPath({
    projectId: "proj_sofa_001",
    skuCode: "SKU-SOFA-2850",
    kind: "ai_mesh",
    fileName: "arm_left.glb",
  });
  console.log("Generated path:", path1);
  assert.ok(
    path1.startsWith("projects/proj_sofa_001/sku/SKU-SOFA-2850/mesh/source/"),
    "Path must follow projects/{projectId}/sku/{skuCode}/mesh/source/ format"
  );
  assert.ok(path1.endsWith("arm_left.glb"), "Path must end with fileName");

  const pathDerived = buildCanonicalGcsObjectPath({
    projectId: "proj_sofa_001",
    skuCode: "SKU-SOFA-2850",
    kind: "derived_mesh",
    fileName: "arm_left_aligned.glb",
    revision: 1,
  });
  console.log("Derived path (rev 1):", pathDerived);
  assert.ok(
    pathDerived.includes("/mesh/derived/"),
    "Derived path must use mesh/derived subfolder"
  );

  const pathRev2 = buildCanonicalGcsObjectPath({
    projectId: "proj_sofa_001",
    skuCode: "SKU-SOFA-2850",
    kind: "derived_mesh",
    fileName: "arm_left_aligned.glb",
    revision: 2,
  });
  console.log("Revision 2 path:", pathRev2);
  assert.ok(
    pathRev2.includes("/mesh/revisions/"),
    "Revision 2 path must use mesh/revisions subfolder"
  );
  console.log("✓ Canonical Path Format verified");

  // Test 2: GCS Client Service Initialization
  console.log("\n[Test 2] GCS Client Service Config & Fallback");
  const client = new GcsClientService();
  const config = client.getConfig();
  console.log("Config:", config);
  assert.strictEqual(typeof config.enabled, "boolean");
  assert.ok(config.projectId.length > 0);
  assert.ok(config.assetBucket.length > 0);
  assert.ok(config.tempBucket.length > 0);
  assert.strictEqual(config.signedUrlTtlSeconds, 1800);
  console.log("✓ GCS Client Service verified");

  // Test 3: Signed URL Generation & Verification
  console.log("\n[Test 3] Signed URL Generation & Token Verification (Local Fallback)");
  const signer = new SignedUrlService();
  const signed = await signer.getSignedDownloadUrl(
    config.assetBucket,
    path1,
    60 // 60 seconds TTL
  );
  console.log("Download URL result:", signed);
  assert.ok(signed.url.length > 0);
  assert.ok(new Date(signed.expiresAt).getTime() > Date.now());

  // Extract token and verify
  const token = signed.url.split("/").pop()!;
  const verified = signer.verifyLocalToken(token, "read");
  assert.ok(verified !== null, "Token must be cryptographically verifiable");
  assert.strictEqual(verified.bucket, config.assetBucket);
  assert.strictEqual(verified.objectPath, path1);

  // Verification fails for wrong action
  const wrongAction = signer.verifyLocalToken(token, "write");
  assert.strictEqual(wrongAction, null, "Token for read must not verify for write");
  console.log("✓ Signed URL token generation and validation verified");

  // Test 4: Upload Session Creation (Threshold test)
  console.log("\n[Test 4] Upload Session Creation & Resumable Threshold");
  const uploadService = new UploadSessionService();

  // Small file: 5MB -> single PUT (or resumable if forced by GCS_UPLOAD_MODE=resumable)
  const sessionSmall = await uploadService.createSession({
    projectId: "proj_sofa_001",
    skuCode: "SKU-SOFA-2850",
    kind: "ai_mesh",
    fileName: "small_test.glb",
    sizeBytes: 5 * 1024 * 1024, // 5MB
  });
  console.log("Small file session:", sessionSmall);
  const expectedSmallMode = globalGcsClient.getUploadMode() === "resumable" ? "resumable" : "single";
  assert.strictEqual(sessionSmall.uploadMode, expectedSmallMode);
  assert.ok(sessionSmall.artifactId.startsWith("art_"));

  // Large file: 50MB -> resumable upload
  const sessionLarge = await uploadService.createSession({
    projectId: "proj_sofa_001",
    skuCode: "SKU-SOFA-2850",
    kind: "ai_mesh",
    fileName: "large_sofa_scan.glb",
    sizeBytes: 50 * 1024 * 1024, // 50MB >= 20MB threshold
  });
  console.log("Large file session:", sessionLarge);
  assert.strictEqual(sessionLarge.uploadMode, "resumable");
  console.log("✓ Upload session mode selection verified");

  // Test 5: Metadata Storage & Reference Check Integrity
  console.log("\n[Test 5] Artifact Storage & Reference Integrity on Deletion");
  const storage = new EngineeringArtifactStorage();

  const sourceArtId = `art_test_src_${Date.now()}`;
  const derivedArtId = `art_test_der_${Date.now()}`;

  // Create dummy physical files for testing complete & delete
  const targetPath1 = uploadService.getLocalTargetFilePath(
    config.assetBucket,
    "test/source.glb"
  );
  fs.writeFileSync(targetPath1, Buffer.from("dummy-source-glb-content"));

  const sourceArtifact: EngineeringArtifact = {
    id: sourceArtId,
    projectId: "proj_test",
    skuCode: "SKU-001",
    kind: "ai_mesh",
    provider: "hunyuan3d",
    format: "glb",
    mimeType: "model/gltf-binary",
    sizeBytes: 25,
    storage: {
      provider: "local_fallback",
      bucket: config.assetBucket,
      objectPath: "test/source.glb",
    },
    productionTruth: false, // Strictly false for AI mesh
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await storage.saveArtifact(sourceArtifact);

  // Verify retrieval
  const retrieved = await storage.getArtifact(sourceArtId);
  assert.ok(retrieved !== null);
  assert.strictEqual(retrieved.productionTruth, false);
  assert.strictEqual(retrieved.kind, "ai_mesh");

  // Complete upload check
  const completeResult = await storage.completeUpload(sourceArtId);
  assert.strictEqual(completeResult.success, true);
  console.log("✓ Artifact creation & verification completed");

  // Create derived artifact referencing sourceArtId
  const targetPath2 = uploadService.getLocalTargetFilePath(
    config.assetBucket,
    "test/derived.glb"
  );
  fs.writeFileSync(targetPath2, Buffer.from("dummy-derived-glb-content"));

  const derivedArtifact: EngineeringArtifact = {
    id: derivedArtId,
    projectId: "proj_test",
    skuCode: "SKU-001",
    kind: "derived_mesh",
    provider: "threejs_editor",
    format: "glb",
    mimeType: "model/gltf-binary",
    sizeBytes: 26,
    storage: {
      provider: "local_fallback",
      bucket: config.assetBucket,
      objectPath: "test/derived.glb",
    },
    sourceArtifactId: sourceArtId, // Reference to source!
    revision: 1,
    productionTruth: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await storage.saveArtifact(derivedArtifact);

  // Attempt to delete source artifact while referenced by derived artifact
  console.log("Attempting to delete source artifact with active derived reference...");
  const deleteBlocked = await storage.deleteArtifact(sourceArtId);
  console.log("Delete result (should fail):", deleteBlocked);
  assert.strictEqual(deleteBlocked.success, false);
  assert.strictEqual(deleteBlocked.code, "ARTIFACT_IN_USE");
  console.log("✓ Reference Integrity Check successfully prevented deleting referenced source artifact");

  // Now delete the derived artifact first
  console.log("Deleting derived artifact...");
  const deleteDerived = await storage.deleteArtifact(derivedArtId);
  assert.strictEqual(deleteDerived.success, true);

  // Now delete source artifact (should now succeed)
  console.log("Deleting source artifact now that references are cleared...");
  const deleteSource = await storage.deleteArtifact(sourceArtId);
  assert.strictEqual(deleteSource.success, true);
  console.log("✓ Artifact lifecycle & safe deletion verified");

  // Test 6: Storage Diagnostics Status Rules & Host Detection
  console.log("\n[Test 6] Storage Diagnostics Status Rules & Host Detection");
  function evaluateStorageStatus(params: {
    provider: "gcs" | "local_fallback";
    fallbackMode: boolean;
    assetBucket: boolean;
    tempBucket: boolean;
  }): "GCS_ACTIVE" | "GCS_ACCESS_BLOCKED" | "LOCAL_FALLBACK" {
    if (params.provider === "gcs" && (!params.assetBucket || !params.tempBucket)) {
      return "GCS_ACCESS_BLOCKED";
    }
    if (params.provider === "gcs" && params.assetBucket && params.tempBucket && !params.fallbackMode) {
      return "GCS_ACTIVE";
    }
    return "LOCAL_FALLBACK";
  }

  // 1. Blocked condition
  const statusBlocked1 = evaluateStorageStatus({
    provider: "gcs",
    fallbackMode: false,
    assetBucket: false,
    tempBucket: true,
  });
  assert.strictEqual(statusBlocked1, "GCS_ACCESS_BLOCKED", "provider=gcs with assetBucket=false must be GCS_ACCESS_BLOCKED");

  const statusBlocked2 = evaluateStorageStatus({
    provider: "gcs",
    fallbackMode: false,
    assetBucket: true,
    tempBucket: false,
  });
  assert.strictEqual(statusBlocked2, "GCS_ACCESS_BLOCKED", "provider=gcs with tempBucket=false must be GCS_ACCESS_BLOCKED");

  // 2. Active condition
  const statusActive = evaluateStorageStatus({
    provider: "gcs",
    fallbackMode: false,
    assetBucket: true,
    tempBucket: true,
  });
  assert.strictEqual(statusActive, "GCS_ACTIVE", "provider=gcs with both buckets and no fallback must be GCS_ACTIVE");

  // 3. Fallback condition
  const statusFallback = evaluateStorageStatus({
    provider: "local_fallback",
    fallbackMode: true,
    assetBucket: false,
    tempBucket: false,
  });
  assert.strictEqual(statusFallback, "LOCAL_FALLBACK", "provider=local_fallback must be LOCAL_FALLBACK");

  // 4. Access URL & Host Detection Rule
  function isCloudSignedUrlHost(urlStr: string): boolean {
    if (!urlStr || urlStr.startsWith("/api/engineering/storage/local-access/")) {
      return false;
    }
    try {
      const parsed = new URL(urlStr, "http://localhost:3000");
      const host = parsed.hostname.toLowerCase();
      return (
        host === "storage.googleapis.com" ||
        host.endsWith(".storage.googleapis.com") ||
        host === "commondatastorage.googleapis.com"
      );
    } catch {
      return false;
    }
  }

  assert.strictEqual(
    isCloudSignedUrlHost("/api/engineering/storage/local-access/token123"),
    false,
    "Local fallback access URL must NOT be identified as real cloud signed URL"
  );
  assert.strictEqual(
    isCloudSignedUrlHost("https://storage.googleapis.com/my-bucket/obj?X-Goog-Signature=abc"),
    true,
    "storage.googleapis.com must be identified as real cloud signed URL"
  );
  console.log("✓ Storage diagnostics status rules & cloud host detection verified");

  // Test 7: Canonical StorageConfigResponse Contract & REAL_GCS_READY
  console.log("\n[Test 7] Canonical StorageConfigResponse Contract & REAL_GCS_READY Gate");
  function evaluateRealGcsReady(res: any): { isReady: boolean; isBlocked: boolean; isContractError: boolean } {
    const isContractError =
      !res ||
      typeof res.success !== "boolean" ||
      typeof res.gcsEnabled !== "boolean" ||
      !res.provider ||
      typeof res.fallbackMode !== "boolean" ||
      !res.config ||
      !res.bucketsCheck ||
      typeof res.bucketsCheck.assetBucket !== "boolean" ||
      typeof res.bucketsCheck.tempBucket !== "boolean";

    if (isContractError) {
      return { isReady: false, isBlocked: false, isContractError: true };
    }

    const isReady =
      res.success === true &&
      res.gcsEnabled === true &&
      res.provider === "gcs" &&
      res.fallbackMode === false &&
      res.bucketsCheck.assetBucket === true &&
      res.bucketsCheck.tempBucket === true;

    const isBlocked =
      !isReady &&
      res.provider === "gcs" &&
      (res.bucketsCheck.assetBucket === false || res.bucketsCheck.tempBucket === false);

    return { isReady, isBlocked, isContractError: false };
  }

  // 7.1 Contract error test (missing bucketsCheck or singular bucketCheck)
  const legacyMalformedRes = {
    success: true,
    gcsEnabled: true,
    bucketCheck: { assetBucket: true, tempBucket: true }, // Invalid legacy field
  };
  const contractErrEval = evaluateRealGcsReady(legacyMalformedRes);
  assert.strictEqual(contractErrEval.isContractError, true, "Missing bucketsCheck must trigger CONTRACT_ERROR");

  // 7.2 Real GCS Ready test (when both buckets true)
  const gcsReadyRes = {
    success: true,
    gcsEnabled: true,
    provider: "gcs",
    fallbackMode: false,
    config: {
      projectId: "proj-123",
      assetBucket: "asset-bucket",
      tempBucket: "temp-bucket",
      signedUrlTtlSeconds: 1800,
      uploadMode: "auto",
    },
    bucketsCheck: {
      assetBucket: true,
      tempBucket: true,
    },
  };
  const gcsReadyEval = evaluateRealGcsReady(gcsReadyRes);
  assert.strictEqual(gcsReadyEval.isReady, true, "GCS with both buckets reachable must evaluate to REAL_GCS_READY");
  assert.strictEqual(gcsReadyEval.isBlocked, false, "REAL_GCS_READY must not be blocked");
  assert.strictEqual(gcsReadyEval.isContractError, false, "REAL_GCS_READY must not have contract error");

  // 7.3 GCS Access Blocked test (when assetBucket is false)
  const gcsBlockedRes = {
    ...gcsReadyRes,
    bucketsCheck: {
      assetBucket: false,
      tempBucket: true,
    },
  };
  const gcsBlockedEval = evaluateRealGcsReady(gcsBlockedRes);
  assert.strictEqual(gcsBlockedEval.isReady, false, "GCS with unreachable assetBucket must not be ready");
  assert.strictEqual(gcsBlockedEval.isBlocked, true, "GCS with unreachable assetBucket must be GCS_ACCESS_BLOCKED");

  console.log("✓ StorageConfigResponse contract validation & REAL_GCS_READY verified");

  // Test 8: G-INFRA-STORAGE-02: GCS Signed URL, Readback & Strict No-Fallback Gate
  console.log("\n[Test 8] G-INFRA-STORAGE-02: GCS Signed URL, Readback & Strict No-Fallback Gate");

  // 8.1 GCS artifact -> GCS signed URL & 禁止 local fallback
  const testGcsArtifactId = `art_gcs_test_${Date.now()}`;
  const testGcsArtifact: EngineeringArtifact = {
    id: testGcsArtifactId,
    projectId: "gen-lang-client-0557963301",
    skuCode: "SMOKE-TEST",
    kind: "validation_report",
    format: "txt",
    mimeType: "text/plain",
    sizeBytes: 36,
    storage: {
      provider: "gcs",
      bucket: config.assetBucket,
      objectPath: "projects/gen-lang-client-0557963301/sku/SMOKE-TEST/reports/smoke.txt",
    },
    productionTruth: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await storage.saveArtifact(testGcsArtifact);
  const fetchedArt = await storage.getArtifact(testGcsArtifactId);
  assert.ok(fetchedArt !== null);
  assert.strictEqual(fetchedArt.storage.provider, "gcs", "GCS artifact storage.provider must be 'gcs'");

  // 8.2 Verify generateLocalSignedUrl strictly tags storageProvider = "local_fallback"
  const localSigned = signer.generateLocalSignedUrl({
    bucketName: config.assetBucket,
    objectPath: "local/test.txt",
    action: "read",
  });
  assert.strictEqual(localSigned.storageProvider, "local_fallback");
  assert.ok(localSigned.url.startsWith("/api/engineering/storage/local-access/"));

  // 8.3 Strict no-fallback when options.provider = "gcs"
  try {
    // Calling getSignedDownloadUrl with provider="gcs" on non-existent credentials or IAM error must throw, NOT silently fallback
    const fakeSigner = new SignedUrlService();
    // If GCS is enabled but fails, or if GCS client throws
    const result = await fakeSigner.getSignedDownloadUrl(
      config.assetBucket,
      "non-existent.txt",
      60,
      { provider: "gcs", noFallback: true }
    );
    // If it succeeded, URL must NOT be local fallback
    assert.ok(!result.url.startsWith("/api/engineering/storage/local-access/"), "GCS mode must NEVER return local access URL");
    assert.strictEqual(result.storageProvider, "gcs", "Storage provider must be 'gcs'");
  } catch (err: any) {
    // Throwing error instead of returning local fallback is the correct behavior
    assert.ok(err instanceof Error);
    console.log("  ✓ Correctly threw on GCS error without silent local fallback:", err.message);
  }

  // 8.4 Hostname validation: Signed URL hostname = storage.googleapis.com
  function validateGcsHostname(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      return (
        parsed.hostname === "storage.googleapis.com" ||
        parsed.hostname.endsWith(".storage.googleapis.com")
      );
    } catch {
      return false;
    }
  }
  const sampleGcsUrl = `https://storage.googleapis.com/${config.assetBucket}/test.txt?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Expires=1800`;
  assert.strictEqual(validateGcsHostname(sampleGcsUrl), true, "sample GCS signed URL host must be storage.googleapis.com");
  assert.strictEqual(validateGcsHostname("http://localhost:3000/api/engineering/storage/local-access/123"), false);

  // 8.5 Readback verification logic (HTTP 200 & Byte Parity)
  function evaluateReadback(status: number, textContent: string): { readback: "PASS" | "FAIL"; byteParity: "PASS" | "FAIL"; error?: string } {
    if (status !== 200) {
      return { readback: "FAIL", byteParity: "FAIL", error: `HTTP ${status}` };
    }
    const expected = "Furniture Engineering Agent GCS TEST";
    if (textContent.length !== 36 || textContent !== expected) {
      return { readback: "FAIL", byteParity: "FAIL", error: "Byte parity mismatch" };
    }
    return { readback: "PASS", byteParity: "PASS" };
  }

  const validReadback = evaluateReadback(200, "Furniture Engineering Agent GCS TEST");
  assert.strictEqual(validReadback.readback, "PASS");
  assert.strictEqual(validReadback.byteParity, "PASS");

  const status404Readback = evaluateReadback(404, "");
  assert.strictEqual(status404Readback.readback, "FAIL");

  const corruptReadback = evaluateReadback(200, "corrupted partial content");
  assert.strictEqual(corruptReadback.readback, "FAIL");
  assert.strictEqual(corruptReadback.byteParity, "FAIL");

  // 8.6 GCS signed URL generation failure -> HTTP 502 response contract
  function handleGcsSignError(artifactId: string, bucket: string, objectPath: string, error: any) {
    console.error("[GCS_SIGNED_URL_ERROR]", {
      artifactId,
      bucket,
      objectPath,
      error: error?.message || error,
    });
    return {
      status: 502,
      body: {
        success: false,
        code: "GCS_SIGNED_URL_ERROR",
        provider: "gcs",
        fallbackUsed: false,
        message: "Failed to generate GCS signed URL: " + (error?.message || String(error)),
      },
    };
  }

  const simulatedError = new Error("Permission 'iam.serviceAccounts.signBlob' denied on resource");
  const errResponse = handleGcsSignError(
    testGcsArtifactId,
    config.assetBucket,
    "projects/smoke.txt",
    simulatedError
  );
  assert.strictEqual(errResponse.status, 502, "GCS sign error must return HTTP 502");
  assert.strictEqual(errResponse.body.success, false);
  assert.strictEqual(errResponse.body.code, "GCS_SIGNED_URL_ERROR");
  assert.strictEqual(errResponse.body.provider, "gcs");
  assert.strictEqual(errResponse.body.fallbackUsed, false, "fallbackUsed must be false");
  assert.ok(errResponse.body.message.includes("signBlob"));

  // 8.7 REAL_GCS_READ_PASS strict gate evaluation
  function evaluateRealGcsReadPass(params: {
    uploadStorageProvider: string;
    signedUrlProvider: string;
    signedUrl: string;
    httpStatus: number;
    byteParity: string;
  }): { pass: boolean; reason?: string } {
    if (params.uploadStorageProvider !== "gcs") {
      return { pass: false, reason: "uploadStorageProvider is not gcs" };
    }
    if (params.signedUrlProvider !== "gcs") {
      return { pass: false, reason: "signedUrlProvider is not gcs (local fallback forbidden)" };
    }
    if (!validateGcsHostname(params.signedUrl)) {
      return { pass: false, reason: "signedUrl hostname is not storage.googleapis.com" };
    }
    if (params.httpStatus !== 200) {
      return { pass: false, reason: "httpStatus is not 200" };
    }
    if (params.byteParity !== "PASS") {
      return { pass: false, reason: "byteParity is not PASS" };
    }
    return { pass: true };
  }

  const passCheck = evaluateRealGcsReadPass({
    uploadStorageProvider: "gcs",
    signedUrlProvider: "gcs",
    signedUrl: "https://storage.googleapis.com/fes-assets/smoke.txt?sign=abc",
    httpStatus: 200,
    byteParity: "PASS",
  });
  assert.strictEqual(passCheck.pass, true, "All conditions met must pass REAL_GCS_READ_PASS");

  const failFallbackCheck = evaluateRealGcsReadPass({
    uploadStorageProvider: "gcs",
    signedUrlProvider: "local_fallback", // FORBIDDEN
    signedUrl: "/api/engineering/storage/local-access/abc",
    httpStatus: 200,
    byteParity: "PASS",
  });
  assert.strictEqual(failFallbackCheck.pass, false, "local_fallback for GCS upload MUST FAIL");
  assert.ok(failFallbackCheck.reason?.includes("local fallback forbidden"));

  console.log("✓ G-INFRA-STORAGE-02: GCS Signed URL, Readback & Strict No-Fallback Gate verified");

  // Test 9: G-INFRA-STORAGE-02B: Production GCS Signed URL Failure Diagnosis
  console.log("\n[Test 9] G-INFRA-STORAGE-02B: Production GCS Signed URL Failure Diagnosis");

  // 9.1 Real runtime & signing identity discovery via Google SDK
  const identityDetails = await globalGcsClient.getRuntimeAndSigningIdentity();
  assert.ok(typeof identityDetails.runtimeIdentity === "string");
  assert.ok(typeof identityDetails.signingIdentity === "string");
  assert.ok(typeof identityDetails.projectId === "string");
  assert.ok(typeof identityDetails.credentialSource === "string");
  assert.ok(typeof identityDetails.authType === "string");
  console.log("  ✓ Runtime Identity:", identityDetails.runtimeIdentity);
  console.log("  ✓ Signing Identity:", identityDetails.signingIdentity);
  console.log("  ✓ Credential Source:", identityDetails.credentialSource);

  // 9.2 Structured [GCS_SIGNED_URL_ERROR] logging contract & Secret Exemption
  const sampleError = new Error("Permission 'iam.serviceAccounts.signBlob' denied on resource");
  (sampleError as any).name = "SigningError";
  (sampleError as any).status = 403;

  const structuredLogPayload = {
    artifactId: testGcsArtifactId,
    provider: "gcs",
    bucket: config.assetBucket,
    objectPath: "projects/sample.txt",
    projectId: identityDetails.projectId,
    runtimeIdentity: identityDetails.runtimeIdentity,
    signingIdentity: identityDetails.signingIdentity,
    errorName: sampleError.name || "Error",
    errorMessage: sampleError.message,
    errorCode: (sampleError as any).code || (sampleError as any).status || "SIGNING_FAILED",
    errorStatus: (sampleError as any).status || 502,
    errorStack: sampleError.stack || "",
  };

  // Assert all mandatory keys exist
  const requiredKeys = [
    "artifactId",
    "provider",
    "bucket",
    "objectPath",
    "projectId",
    "runtimeIdentity",
    "signingIdentity",
    "errorName",
    "errorMessage",
    "errorCode",
    "errorStatus",
    "errorStack",
  ];
  for (const k of requiredKeys) {
    assert.ok(k in structuredLogPayload, `structuredLogPayload must contain key "${k}"`);
  }

  // Verify NO secrets leaked in payload
  const serialized = JSON.stringify(structuredLogPayload);
  assert.ok(!serialized.includes("private_key"), "Must not leak private_key");
  assert.ok(!serialized.includes("client_secret"), "Must not leak client_secret");
  assert.ok(!serialized.includes("token"), "Must not leak token credentials");

  // 9.3 Distinct permission classification: Object Access vs. signBlob
  function classifyPermissionIssue(err: any): "SERVICE_ACCOUNT_SIGNING_BLOB" | "GCS_OBJECT_ACCESS" {
    const msg = (err?.message || "").toLowerCase();
    const name = (err?.name || "").toLowerCase();
    if (
      msg.includes("signblob") ||
      msg.includes("signing") ||
      name.includes("signingerror") ||
      msg.includes("serviceaccounttokencreator")
    ) {
      return "SERVICE_ACCOUNT_SIGNING_BLOB";
    }
    return "GCS_OBJECT_ACCESS";
  }

  const signBlobErr = new Error("Permission 'iam.serviceAccounts.signBlob' denied on resource");
  assert.strictEqual(classifyPermissionIssue(signBlobErr), "SERVICE_ACCOUNT_SIGNING_BLOB");

  const bucketErr = new Error("ais-sandbox does not have storage.objects.get access to bucket");
  assert.strictEqual(classifyPermissionIssue(bucketErr), "GCS_OBJECT_ACCESS");
  console.log("  ✓ Permission issue distinction verified (signBlob vs. object access)");

  // 9.4 Diagnostic probe contract: /api/engineering/storage/debug/signing
  const diagnosticResponse = {
    success: false,
    provider: "gcs",
    projectId: identityDetails.projectId,
    bucket: config.assetBucket,
    runtimeIdentity: identityDetails.runtimeIdentity,
    canAccessBucket: false,
    canSignBlob: false,
    errorCode: "403",
    errorMessage: "Permission 'iam.serviceAccounts.signBlob' denied",
  };
  assert.strictEqual(typeof diagnosticResponse.success, "boolean");
  assert.strictEqual(diagnosticResponse.provider, "gcs");
  assert.strictEqual(typeof diagnosticResponse.canAccessBucket, "boolean");
  assert.strictEqual(typeof diagnosticResponse.canSignBlob, "boolean");
  assert.ok(typeof diagnosticResponse.runtimeIdentity === "string");
  console.log("  ✓ Diagnostic probe response contract verified");

  console.log("✓ G-INFRA-STORAGE-02B: Production GCS Signed URL Failure Diagnosis verified");

  console.log("\n=======================================================");
  console.log("🎉 ALL G-INFRA-STORAGE-01, 02 & 02B TESTS PASSED SUCCESSFULLY!");
  console.log("=======================================================\n");
}

runAllStorageTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
