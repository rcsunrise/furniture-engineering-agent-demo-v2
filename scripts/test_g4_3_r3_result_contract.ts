import * as http from "http";
import express from "express";
import { workerRuntimeRouter } from "../src/server/routes/workerRuntime.js";
import { WorkerJobResultRequestSchema } from "../src/shared/workerRuntime.js";
import { createEngineeringArtifact } from "../src/shared/artifact.js";
import { GatewayClient } from "../local-worker/src/gatewayClient.js";

import { getExpectedWorkerToken } from "../src/server/worker/workerAuth.js";

async function runG43R3ResultContractTests() {
  console.log("=== G4-3-R3 WORKER RESULT CONTRACT ALIGNMENT VERIFICATION ===");

  // 1. Local Pre-Send Validation Test: Valid Completed Result
  console.log("\n1. Testing local pre-send validation with valid completed result...");
  const validArtifact = createEngineeringArtifact({
    id: "art-mesh-r3-001",
    type: "ai_reference_mesh",
    name: "Test Sofa Armrest Mesh",
    uri: "http://127.0.0.1:3000/api/worker/artifacts/file/art-mesh-r3-001",
    provenance: {
      provider: "comfyui_hunyuan3d",
      workflowVersion: "hunyuan3d-v2.1-part-v1.api.json",
      modelOrCheckpoint: "hunyuan_3d_v2.1.safetensors",
      seed: 12345,
      createdAt: new Date().toISOString(),
    },
    productionTruth: false,
  });

  const validCompletedPayload = {
    status: "completed" as const,
    outputArtifacts: [validArtifact],
  };

  const parsedValid = WorkerJobResultRequestSchema.safeParse(validCompletedPayload);
  if (!parsedValid.success) {
    console.error("   -> FAIL: Valid completed payload failed Zod parse:", parsedValid.error);
    process.exit(1);
  }
  console.log("   -> PASS: Valid completed payload parsed successfully");

  // 2. Local Pre-Send Validation Test: Valid Failed Result
  console.log("\n2. Testing local pre-send validation with valid failed result...");
  const validFailedPayload = {
    status: "failed" as const,
    error: "ComfyUI execution timed out after 300000ms",
  };

  const parsedFailed = WorkerJobResultRequestSchema.safeParse(validFailedPayload);
  if (!parsedFailed.success) {
    console.error("   -> FAIL: Valid failed payload failed Zod parse:", parsedFailed.error);
    process.exit(1);
  }
  console.log("   -> PASS: Valid failed payload parsed successfully");

  // 3. Local Pre-Send Validation Test: Reject Wrong Field Aliases (e.g. "artifacts" instead of "outputArtifacts")
  console.log("\n3. Testing local pre-send rejection of wrong field alias 'artifacts'...");
  const aliasedPayload = {
    status: "completed",
    artifacts: [validArtifact], // WRONG ALIAS
  };

  const clientMock = new GatewayClient({
    workerId: "worker-r3-test",
    workerName: "R3 Test Worker",
    gatewayUrl: "http://127.0.0.1:19005",
    pollIntervalMs: 1000,
    jobTimeoutMs: 30000,
    comfyui: { enabled: false, baseUrl: "http://127.0.0.1:8188" },
  });

  try {
    await clientMock.reportResult("job-r3-alias", "completed", (aliasedPayload as any).artifacts);
    // Note: clientMock.reportResult expects outputArtifacts as 3rd param, but if someone passes unvalidated object:
  } catch (err: any) {
    console.log("   -> Local client reportResult executed with typed signature");
  }

  const parsedAliased = WorkerJobResultRequestSchema.safeParse(aliasedPayload);
  if (parsedAliased.success) {
    console.error("   -> FAIL: Wrong alias 'artifacts' was accepted!");
    process.exit(1);
  }
  console.log("   -> PASS: Payload with wrong field alias 'artifacts' correctly rejected by schema");

  // 4. Local Pre-Send Validation Test: Reject Invalid AI Mesh Artifact
  console.log("\n4. Testing local pre-send rejection of invalid artifact (missing provenance)...");
  const badArtifact = {
    id: "art-bad-001",
    type: "ai_reference_mesh",
    name: "Bad Mesh",
    productionTruth: false,
    // missing provenance!
  };

  const badArtifactPayload = {
    status: "completed" as const,
    outputArtifacts: [badArtifact as any],
  };

  const parsedBadArtifact = WorkerJobResultRequestSchema.safeParse(badArtifactPayload);
  if (parsedBadArtifact.success) {
    console.error("   -> FAIL: Bad artifact without provenance was accepted!");
    process.exit(1);
  }
  console.log("   -> PASS: Invalid artifact missing provenance correctly rejected");

  // 5. Server Endpoint Test with Express App
  console.log("\n5. Testing Server POST /api/worker/runtime/:workerId/jobs/:jobId/result diagnostics...");
  const app = express();
  app.use(express.json());
  app.use("/api/worker/runtime", workerRuntimeRouter);

  const SERVER_PORT = 19005;
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(SERVER_PORT, "127.0.0.1", () => resolve(s));
  });

  try {
    // Register w-1 and create j-1 for invalid test
    const { globalWorkerRegistry } = await import("../src/server/worker/workerRegistry.js");
    const { globalWorkerJobStore } = await import("../src/server/worker/workerJobStore.js");
    globalWorkerRegistry.registerWorker({
      workerId: "w-1",
      workerName: "Worker 1",
      platform: "win32",
      arch: "x64",
      capabilities: [{ capabilityId: "image_to_mesh", provider: "comfyui_hunyuan3d" }],
    });
    const job1 = globalWorkerJobStore.createJob({
      workspaceId: "ws-1",
      capabilityId: "image_to_mesh",
      provider: "comfyui_hunyuan3d",
      inputPayload: {},
    });
    globalWorkerJobStore.updateJobStatus(job1.id, "claimed", { workerId: "w-1" });
    globalWorkerJobStore.updateJobStatus(job1.id, "running", { workerId: "w-1" });

    // 5a. Test Invalid Payload to Server returns 400 with structured Zod issue details
    const invalidRes = await fetch(`http://127.0.0.1:${SERVER_PORT}/api/worker/runtime/w-1/jobs/${job1.id}/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-token": getExpectedWorkerToken(),
      },
      body: JSON.stringify({
        status: "unknown_status",
      }),
    });

    if (invalidRes.status !== 400) {
      console.error("   -> FAIL: Server returned status", invalidRes.status, "instead of 400");
      process.exit(1);
    }

    const invalidJson = await invalidRes.json();
    if (invalidJson.error?.code !== "INVALID_RESULT_PAYLOAD" || !Array.isArray(invalidJson.error?.details)) {
      console.error("   -> FAIL: Server response structure missing INVALID_RESULT_PAYLOAD or details array:", invalidJson);
      process.exit(1);
    }

    console.log("   -> PASS: Server returned HTTP 400 with structured Zod details:");
    console.log("      Error Code:", invalidJson.error.code);
    console.log("      Issue Details Count:", invalidJson.error.details.length);
    console.log("      First Issue:", invalidJson.error.details[0]);

    // Verify detail fields: path, code, message
    const firstIssue = invalidJson.error.details[0];
    if (typeof firstIssue.path !== "string" || !firstIssue.code || !firstIssue.message) {
      console.error("   -> FAIL: Issue detail format mismatch (expected path, code, message):", firstIssue);
      process.exit(1);
    }
    console.log("   -> PASS: Issue detail path/code/message contract verified");

    // 5b. Test Legacy Payload Normalization by Server
    console.log("\n6. Testing Server normalization of legacy worker result payload...");
    const legacyPayload = {
      status: "completed",
      outputArtifacts: [
        {
          workspaceId: "default-ws",
          partId: "part-arm-left",
          kind: "ai_reference_mesh",
          format: "glb",
          source: "comfyui_hunyuan3d",
          metadata: {
            kind: "ai_reference_mesh",
            format: "glb",
            source: "comfyui_hunyuan3d",
            url: "http://127.0.0.1:19005/api/worker/artifacts/file/art-101",
          },
        },
      ],
      metadata: {
        workerId: "worker-win-01",
      },
    };

    // First register worker and claim a job so endpoint proceeds to success
    globalWorkerRegistry.registerWorker({
      workerId: "w-legacy-test",
      workerName: "Legacy Test Worker",
      platform: "win32",
      arch: "x64",
      capabilities: [{ capabilityId: "image_to_mesh", provider: "comfyui_hunyuan3d" }],
    });

    const job = globalWorkerJobStore.createJob({
      workspaceId: "ws-legacy",
      capabilityId: "image_to_mesh",
      provider: "comfyui_hunyuan3d",
      inputPayload: { sku: "SKU1", partId: "part-arm-left" },
    });
    globalWorkerJobStore.updateJobStatus(job.id, "claimed", { workerId: "w-legacy-test" });
    globalWorkerJobStore.updateJobStatus(job.id, "running", { workerId: "w-legacy-test" });

    const legacyRes = await fetch(`http://127.0.0.1:${SERVER_PORT}/api/worker/runtime/w-legacy-test/jobs/${job.id}/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-token": getExpectedWorkerToken(),
      },
      body: JSON.stringify(legacyPayload),
    });

    if (legacyRes.status !== 200) {
      const legacyJson = await legacyRes.json();
      console.error("   -> FAIL: Legacy payload rejected with status", legacyRes.status, legacyJson);
      process.exit(1);
    }
    const legacyJson = await legacyRes.json();
    if (!legacyJson.success || legacyJson.data?.status !== "completed") {
      console.error("   -> FAIL: Job state was not updated to completed:", legacyJson);
      process.exit(1);
    }
    const savedArtifact = legacyJson.data.outputArtifacts?.[0];
    if (savedArtifact?.type !== "ai_reference_mesh" || savedArtifact?.productionTruth !== false) {
      console.error("   -> FAIL: Saved artifact did not normalize to canonical EngineeringArtifact:", savedArtifact);
      process.exit(1);
    }
    console.log("   -> PASS: Server successfully normalized legacy worker result payload to canonical EngineeringArtifact!");

  } finally {
    server.close();
  }

  console.log("\n=== ALL G4-3-R3 WORKER RESULT CONTRACT TESTS PASSED ===");
}

runG43R3ResultContractTests().catch((err) => {
  console.error("G4-3-R3 Test Execution Error:", err);
  process.exit(1);
});
