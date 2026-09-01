import fetch from "node-fetch";

const SERVER_BASE = process.env.SERVER_BASE_URL || "http://127.0.0.1:3000";

async function runG43R4MeshDeliveryTest() {
  console.log("==================================================");
  console.log("RUNNING G4-3-R4 MESH ARTIFACT DELIVERY TEST");
  console.log("==================================================");

  // 1. Construct minimal valid GLB binary buffer (glTF magic header: 0x47 0x6C 0x54 0x46)
  const header = Buffer.from([
    0x47, 0x6c, 0x54, 0x46, // magic: "glTF"
    0x02, 0x00, 0x00, 0x00, // version: 2
    0x18, 0x00, 0x00, 0x00, // length: 24
    0x00, 0x00, 0x00, 0x00, // chunk 0 length: 0
    0x4a, 0x53, 0x4f, 0x4e, // chunk 0 type: "JSON"
  ]);
  const base64Glb = header.toString("base64");

  console.log("1. Testing POST /api/worker/artifacts/upload...");
  const uploadRes = await fetch(`${SERVER_BASE}/api/worker/artifacts/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-token": process.env.LOCAL_WORKER_TOKEN || "default-local-worker-token",
    },
    body: JSON.stringify({
      fileName: "part-sofa-arm.glb",
      fileData: base64Glb,
      jobId: "job-g43-r4-test",
      partId: "part-arm-left",
      sku: "DEMO-SOFA-01",
      provider: "comfyui_hunyuan3d",
      workflowVersion: "hunyuan3d-v2.1-part-v1.api.json",
      modelOrCheckpoint: "hunyuan_3d_v2.1.safetensors",
      seed: 42,
    }),
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Upload failed with HTTP ${uploadRes.status}: ${text}`);
  }

  const uploadJson: any = await uploadRes.json();
  console.log("Upload response:", JSON.stringify(uploadJson, null, 2));

  if (!uploadJson.success || !uploadJson.artifact) {
    throw new Error("Upload response missing success flag or artifact object");
  }

  const artifact = uploadJson.artifact;
  if (!artifact.id || !artifact.uri) {
    throw new Error("Artifact missing required id or uri");
  }

  if (artifact.uri.includes("C:\\") || artifact.uri.includes("file://")) {
    throw new Error(`Artifact uri contains unsafe local path: ${artifact.uri}`);
  }

  if (!artifact.uri.startsWith("/api/worker/artifacts/file/")) {
    throw new Error(`Artifact uri does not start with Cloud endpoint: ${artifact.uri}`);
  }

  console.log("✓ Upload test passed. Canonical Cloud Artifact URI:", artifact.uri);

  // 2. Testing GET /api/worker/artifacts/file/:artifactId
  console.log("\n2. Testing GET /api/worker/artifacts/file/:artifactId...");
  const downloadUrl = `${SERVER_BASE}${artifact.uri}`;
  const fileRes = await fetch(downloadUrl);

  if (!fileRes.ok) {
    throw new Error(`GET artifact file failed with HTTP ${fileRes.status}`);
  }

  const contentType = fileRes.headers.get("content-type");
  const contentLength = fileRes.headers.get("content-length");
  const fileBuffer = await fileRes.buffer();

  console.log(`HTTP ${fileRes.status}`);
  console.log(`Content-Type: ${contentType}`);
  console.log(`Content-Length: ${contentLength}`);
  console.log(`Downloaded Bytes: ${fileBuffer.length}`);

  if (contentType !== "model/gltf-binary") {
    throw new Error(`Expected Content-Type 'model/gltf-binary', got '${contentType}'`);
  }

  if (fileBuffer.length !== header.length) {
    throw new Error(`Downloaded buffer length (${fileBuffer.length}) does not match uploaded length (${header.length})`);
  }

  console.log("✓ GET /api/worker/artifacts/file/:artifactId passed.");

  // 3. Testing GET /api/worker/artifacts/:artifactId/download alias
  console.log("\n3. Testing GET /api/worker/artifacts/:artifactId/download alias...");
  const aliasUrl = `${SERVER_BASE}/api/worker/artifacts/${artifact.id}/download`;
  const aliasRes = await fetch(aliasUrl);

  if (!aliasRes.ok) {
    throw new Error(`GET artifact download alias failed with HTTP ${aliasRes.status}`);
  }

  const aliasContentType = aliasRes.headers.get("content-type");
  if (aliasContentType !== "model/gltf-binary") {
    throw new Error(`Expected alias Content-Type 'model/gltf-binary', got '${aliasContentType}'`);
  }

  console.log("✓ GET /api/worker/artifacts/:artifactId/download alias passed.");

  // 4. Testing Server Local Path Sanitization Safeguard
  console.log("\n4. Testing result payload local path sanitization safeguard...");
  // First register a worker and create a running job to allow result submission
  const regRes = await fetch(`${SERVER_BASE}/api/worker/runtime/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-token": process.env.LOCAL_WORKER_TOKEN || "default-local-worker-token",
    },
    body: JSON.stringify({
      workerId: "wrk-g43-test",
      name: "G4-3 Test Worker",
      version: "1.0.0",
      capabilities: ["image_to_mesh"],
    }),
  });

  if (!regRes.ok) {
    const regText = await regRes.text();
    throw new Error(`Worker registration failed with HTTP ${regRes.status}: ${regText}`);
  }

  const createJobRes = await fetch(`${SERVER_BASE}/api/worker/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: "default-ws",
      capabilityId: "image_to_mesh",
      provider: "comfyui_hunyuan3d",
      inputPayload: { partId: "part-arm-left" },
    }),
  });
  const createJobJson: any = await createJobRes.json();
  const testJobId = createJobJson.data?.id;

  // Claim job
  await fetch(`${SERVER_BASE}/api/worker/runtime/wrk-g43-test/jobs/${testJobId}/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-token": process.env.LOCAL_WORKER_TOKEN || "default-local-worker-token",
    },
  });

  // Start job
  await fetch(`${SERVER_BASE}/api/worker/runtime/wrk-g43-test/jobs/${testJobId}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-token": process.env.LOCAL_WORKER_TOKEN || "default-local-worker-token",
    },
  });

  const rawLocalPath = "C:\\Users\\dev\\ComfyUI\\output\\mesh\\workspace1\\job1\\part-arm-left_00001_.glb";
  const sanitizeTestRes = await fetch(`${SERVER_BASE}/api/worker/runtime/wrk-g43-test/jobs/${testJobId}/result`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-token": process.env.LOCAL_WORKER_TOKEN || "default-local-worker-token",
    },
    body: JSON.stringify({
      status: "completed",
      outputArtifacts: [
        {
          id: artifact.id,
          type: "ai_reference_mesh",
          name: "Unsanitized Local Worker Result",
          uri: rawLocalPath,
          provenance: {
            provider: "comfyui_hunyuan3d",
            workflowVersion: "v1",
            createdAt: new Date().toISOString(),
          },
          productionTruth: false,
        },
      ],
    }),
  });

  if (!sanitizeTestRes.ok) {
    const text = await sanitizeTestRes.text();
    throw new Error(`Result endpoint failed with HTTP ${sanitizeTestRes.status}: ${text}`);
  }

  const jobFetchRes = await fetch(`${SERVER_BASE}/api/worker/jobs/${testJobId}`);
  const jobFetchJson: any = await jobFetchRes.json();
  const sanitizedArt = jobFetchJson.data?.outputArtifacts?.[0];

  console.log("Sanitized result artifact:", JSON.stringify(sanitizedArt, null, 2));

  if (!sanitizedArt || sanitizedArt.uri.includes("C:\\") || sanitizedArt.uri.includes("ComfyUI")) {
    throw new Error(`Failed to sanitize local filesystem path from result payload! Got uri: ${sanitizedArt?.uri}`);
  }

  if (!sanitizedArt.uri.startsWith("/api/worker/artifacts/file/")) {
    throw new Error(`Sanitized uri should be Cloud endpoint, got: ${sanitizedArt?.uri}`);
  }

  console.log("✓ Local path sanitization safeguard passed.");

  console.log("\n==================================================");
  console.log("ALL G4-3-R4 MESH DELIVERABILITY TESTS PASSED (PASS)");
  console.log("==================================================");
}

runG43R4MeshDeliveryTest().catch((err) => {
  console.error("\n❌ G4-3-R4 TEST FAILED:", err);
  process.exit(1);
});
