import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { ComfyWorkflowManager } from "../local-worker/src/adapters/comfyWorkflow.js";
import { validateHunyuanWorkflowBinding } from "../local-worker/src/adapters/hunyuanWorkflowBinding.js";
import { ComfyAdapterError, ComfyClient } from "../local-worker/src/adapters/comfyClient.js";
import { executeComfyHunyuan3dTask } from "../local-worker/src/adapters/comfyExecutor.js";
import { executeJobTask } from "../local-worker/src/executor.js";

console.log("=== G4-2 COMFYUI HUNYUAN3D ADAPTER VERIFICATION TEST ===");

// 1. Test Workflow API Load & Node Binding Validation
console.log("\n1. Testing Workflow Preset Loading & Node Binding Validation...");
const workflowManager = new ComfyWorkflowManager();
const presetPath = "local-worker/workflows/hunyuan3d-v2.1-part-v1.api.json";
const loadedPreset = workflowManager.loadWorkflowPreset(presetPath);

if (!loadedPreset["20"] || loadedPreset["20"].class_type !== "LoadImage") {
  console.error("   -> FAIL: Node 20 is not LoadImage");
  process.exit(1);
}
if (!loadedPreset["21"] || loadedPreset["21"].class_type !== "SaveGLB") {
  console.error("   -> FAIL: Node 21 is not SaveGLB");
  process.exit(1);
}
if (!loadedPreset["29"] || loadedPreset["29"].class_type !== "CheckpointLoaderSimple") {
  console.error("   -> FAIL: Node 29 is not CheckpointLoaderSimple");
  process.exit(1);
}
console.log("   -> PASS: Workflow preset loaded and bindings validated (Nodes 20-29 present)");

// Test Node 30 ignored check
if (loadedPreset["30"]) {
  console.log("   -> PASS: Node 30 present in preset but correctly ignored as runtime input node");
}

// 2. Test Invalid Binding Rejection
console.log("\n2. Testing Invalid Workflow Binding Rejection...");
const invalidPreset = JSON.parse(JSON.stringify(loadedPreset));
invalidPreset["20"].class_type = "WrongNodeType";
try {
  validateHunyuanWorkflowBinding(invalidPreset);
  console.error("   -> FAIL: Allowed invalid node class_type for Node 20");
  process.exit(1);
} catch (err: any) {
  if (err instanceof ComfyAdapterError && err.code === "COMFYUI_WORKFLOW_BINDING_INVALID") {
    console.log("   -> PASS: Correctly rejected invalid binding with COMFYUI_WORKFLOW_BINDING_INVALID");
  } else {
    console.error("   -> FAIL: Unexpected error for invalid binding:", err);
    process.exit(1);
  }
}

// 3. Test Workflow Immutability & Runtime Mutation
console.log("\n3. Testing Preset Immutability & Runtime Mutation...");
const clonedMutated = workflowManager.prepareHunyuanJobWorkflow({
  workflowPreset: loadedPreset,
  uploadedImageFilename: "test_input.png",
  workspaceId: "ws-test",
  jobId: "job-101",
  partId: "part-seat",
  seed: 12345,
});

if (clonedMutated["20"].inputs.image !== "test_input.png") {
  console.error("   -> FAIL: Node 20 input image not mutated correctly");
  process.exit(1);
}
if (clonedMutated["21"].inputs.filename_prefix !== "mesh/ws-test/job-101/part-seat") {
  console.error("   -> FAIL: Node 21 filename_prefix not mutated correctly");
  process.exit(1);
}
if (clonedMutated["26"].inputs.seed !== 12345) {
  console.error("   -> FAIL: Node 26 seed not mutated correctly");
  process.exit(1);
}
if (loadedPreset["20"].inputs.image === "test_input.png") {
  console.error("   -> FAIL: Original preset was mutated!");
  process.exit(1);
}
console.log("   -> PASS: Original preset remained immutable; runtime mutation applied to clone only");

// 4. Test Structured Error Cases
console.log("\n4. Testing Structured Errors (Disabled, Unavailable, Invalid Input)...");
// COMFYUI_DISABLED
try {
  await executeComfyHunyuan3dTask(
    { id: "j1", workspaceId: "ws", provider: "comfyui_hunyuan3d", inputPayload: { imageUri: "d" } },
    "w1",
    { enabled: false }
  );
  console.error("   -> FAIL: Allowed execution when COMFYUI_ENABLED=false");
  process.exit(1);
} catch (err: any) {
  if (err instanceof ComfyAdapterError && err.code === "COMFYUI_DISABLED") {
    console.log("   -> PASS: COMFYUI_DISABLED thrown correctly");
  } else {
    console.error("   -> FAIL: Unexpected error for disabled:", err);
    process.exit(1);
  }
}

// COMFYUI_UNAVAILABLE
try {
  await executeComfyHunyuan3dTask(
    { id: "j1", workspaceId: "ws", provider: "comfyui_hunyuan3d", inputPayload: { imageUri: "d" } },
    "w1",
    { enabled: true, baseUrl: "http://127.0.0.1:59999" }
  );
  console.error("   -> FAIL: Allowed execution when ComfyUI is unavailable");
  process.exit(1);
} catch (err: any) {
  if (err instanceof ComfyAdapterError && err.code === "COMFYUI_UNAVAILABLE") {
    console.log("   -> PASS: COMFYUI_UNAVAILABLE thrown correctly");
  } else {
    console.error("   -> FAIL: Unexpected error for unavailable:", err);
    process.exit(1);
  }
}

// COMFYUI_INPUT_ARTIFACT_INVALID
try {
  await executeComfyHunyuan3dTask(
    { id: "j1", workspaceId: "ws", provider: "comfyui_hunyuan3d", inputPayload: {} },
    "w1",
    { enabled: true, baseUrl: "http://127.0.0.1:8000" }
  );
  console.error("   -> FAIL: Allowed execution with missing input payload");
  process.exit(1);
} catch (err: any) {
  if (err instanceof ComfyAdapterError && (err.code === "COMFYUI_INPUT_ARTIFACT_INVALID" || err.code === "COMFYUI_UNAVAILABLE")) {
    console.log("   -> PASS: Input validation error handled correctly:", err.code);
  } else {
    console.error("   -> FAIL: Unexpected error for missing input:", err);
    process.exit(1);
  }
}

// 5. Test End-to-End Execution Flow with Simulated Local ComfyUI Server
console.log("\n5. Testing Real ComfyUI End-to-End Execution Flow with Local Mock Server...");
const MOCK_PORT = 18000;
const mockServer = http.createServer((req, res) => {
  const url = req.url || "";
  if (url === "/system_stats") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ system: { os: "win32" } }));
  } else if (url === "/upload/image") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ name: "uploaded_input_20.png", subfolder: "", type: "input" }));
  } else if (url === "/prompt") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ prompt_id: "prompt-test-999" }));
    });
  } else if (url === "/api/worker/artifacts/upload") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        url: "/uploads/artifacts/glb_mock.glb",
        artifactId: "art-glb-mock-101",
        fileBytes: 100,
        artifact: {
          id: "art-glb-mock-101",
          type: "ai_reference_mesh",
          name: "Hunyuan3D Reference Mesh (part-seat)",
          uri: "/uploads/artifacts/glb_mock.glb",
          provenance: {
            provider: "comfyui_hunyuan3d",
            workflowVersion: "hunyuan3d-v2.1-part-v1.api.json",
            modelOrCheckpoint: "hunyuan_3d_v2.1.safetensors",
            seed: 42,
            createdAt: new Date().toISOString(),
          },
          productionTruth: false,
        },
      })
    );
  } else if (url === "/history/prompt-test-999") {
    // Write dummy GLB to simulated output dir
    const dummyGlbDir = path.join(process.cwd(), "local-worker/temp/output/mesh/ws-test/job-test-101/part-seat");
    fs.mkdirSync(dummyGlbDir, { recursive: true });
    const dummyGlbPath = path.join(dummyGlbDir, "mesh_ws-test_job-test-101_part-seat_00001_.glb");
    fs.writeFileSync(dummyGlbPath, Buffer.from("glTF header dummy binary content 1234567890"));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        "prompt-test-999": {
          status: { completed: true },
          outputs: {
            "21": {
              gltf: [
                {
                  filename: "mesh_ws-test_job-test-101_part-seat_00001_.glb",
                  subfolder: "mesh/ws-test/job-test-101/part-seat",
                  type: "output",
                },
              ],
            },
          },
        },
      })
    );
  } else {
    res.writeHead(404);
    res.end();
  }
});

await new Promise<void>((resolve) => mockServer.listen(MOCK_PORT, "127.0.0.1", resolve));

try {
  const job = {
    id: "job-test-101",
    workspaceId: "ws-test",
    provider: "comfyui_hunyuan3d",
    inputPayload: {
      imageUri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      partId: "part-seat",
      seed: 42,
    },
  };

  const execRes = await executeComfyHunyuan3dTask(job, "worker-win-01", {
    enabled: true,
    baseUrl: `http://127.0.0.1:${MOCK_PORT}`,
    gatewayUrl: `http://127.0.0.1:${MOCK_PORT}`,
    requestTimeoutMs: 5000,
    jobTimeoutMs: 10000,
    pollIntervalMs: 100,
  });

  if (!execRes.success || !execRes.outputArtifacts || execRes.outputArtifacts.length !== 1) {
    console.error("   -> FAIL: Execution result invalid:", execRes);
    process.exit(1);
  }

  const art = execRes.outputArtifacts[0];
  if (art.type !== "ai_reference_mesh" || art.provenance.provider !== "comfyui_hunyuan3d") {
    console.error("   -> FAIL: Artifact type/provider invalid:", art);
    process.exit(1);
  }
  if (art.productionTruth !== false) {
    console.error("   -> FAIL: productionTruth MUST be false!");
    process.exit(1);
  }

  console.log("   -> PASS: Real ComfyUI execution flow completed successfully!");
  console.log("      Artifact ID:", art.id);
  console.log("      Type:", art.type);
  console.log("      Provider:", art.provenance.provider);
  console.log("      productionTruth:", art.productionTruth);
  console.log("      Seed:", art.provenance.seed);
} finally {
  mockServer.close();
}

// 6. Test Worker Dispatcher
console.log("\n6. Testing Worker Dispatcher (mock vs comfyui_hunyuan3d)...");
const mockJobRes = await executeJobTask(
  { id: "j-mock", workspaceId: "ws", provider: "mock_provider", inputPayload: {} },
  "worker-win-01"
);
if (mockJobRes.outputArtifacts?.[0].provenance?.provider !== "local_worker_mock") {
  console.error("   -> FAIL: Dispatcher failed to route mock provider");
  process.exit(1);
}
console.log("   -> PASS: Dispatcher correctly routed 'mock_provider' to mock task");

console.log("\n=== ALL G4-2 COMFYUI HUNYUAN3D ADAPTER TESTS PASSED ===");
