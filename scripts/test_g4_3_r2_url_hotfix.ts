import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import express from "express";
import { sanitizeServerOrigin, resolveInputImageUrl } from "../local-worker/src/adapters/inputImageResolver.js";
import { workerRouter } from "../src/server/routes/worker.js";
import { executeComfyHunyuan3dTask } from "../local-worker/src/adapters/comfyExecutor.js";
import { ComfyAdapterError } from "../local-worker/src/adapters/comfyClient.js";

async function runG43R2UrlHotfixTests() {
  console.log("=== G4-3-R2 ARTIFACT ABSOLUTE URL HOTFIX VERIFICATION ===");

  // 1. Unit Test: sanitizeServerOrigin
  console.log("\n1. Testing sanitizeServerOrigin...");
  const origin1 = sanitizeServerOrigin("https://jiajuagent-v1-292903497895.asia-east1.run.app");
  if (origin1 !== "https://jiajuagent-v1-292903497895.asia-east1.run.app") {
    console.error("   -> FAIL: origin1 mismatch:", origin1);
    process.exit(1);
  }

  const origin2 = sanitizeServerOrigin("http://127.0.0.1:3000/api/worker");
  if (origin2 !== "http://127.0.0.1:3000") {
    console.error("   -> FAIL: origin2 contained path:", origin2);
    process.exit(1);
  }
  console.log("   -> PASS: sanitizeServerOrigin cleanly removes /api/worker path and trailing slashes");

  // 2. Unit Test: absolute https URL
  console.log("\n2. Testing absolute https URL resolution...");
  const absUrl = "https://example.com/api/worker/artifacts/file/art-101";
  const resAbs = resolveInputImageUrl(absUrl, { serverOrigin: "https://origin.com" });
  if (resAbs !== absUrl) {
    console.error("   -> FAIL: Absolute URL modified:", resAbs);
    process.exit(1);
  }
  console.log("   -> PASS: absolute https URL preserved directly");

  // 3. Unit Test: relative /api/... URL
  console.log("\n3. Testing relative /api/... URL resolution...");
  const relUrl = "/api/worker/artifacts/file/art-102";
  const publicOrigin = "https://jiajuagent-v1-292903497895.asia-east1.run.app";
  const resRel = resolveInputImageUrl(relUrl, { serverOrigin: publicOrigin });
  if (resRel !== `${publicOrigin}${relUrl}`) {
    console.error("   -> FAIL: Relative URL resolution mismatch:", resRel);
    process.exit(1);
  }
  console.log("   -> PASS: relative URL resolved against public origin");

  // 4. Unit Test: resolved URL uses public origin & no duplicate /api/worker
  console.log("\n4. Testing no duplicate /api/worker when origin has path...");
  const originWithWorker = "https://jiajuagent-v1-292903497895.asia-east1.run.app/api/worker";
  const resNoDup = resolveInputImageUrl(relUrl, { serverOrigin: originWithWorker });
  if (resNoDup !== `${publicOrigin}${relUrl}`) {
    console.error("   -> FAIL: Duplicate /api/worker detected:", resNoDup);
    process.exit(1);
  }
  console.log("   -> PASS: no duplicate /api/worker path in resolved URL:", resNoDup);

  // 5. Unit Test: invalid relative URL rejected
  console.log("\n5. Testing rejection of invalid relative URLs...");
  const invalidRelUrl = "api/worker/artifacts/file/art-103";
  try {
    resolveInputImageUrl(invalidRelUrl, { serverOrigin: publicOrigin });
    console.error("   -> FAIL: Allowed invalid relative URL without leading /!");
    process.exit(1);
  } catch (err: any) {
    if (err instanceof ComfyAdapterError && err.code === "no_supported_input_image") {
      console.log("   -> PASS: Invalid relative URL without leading / correctly rejected");
    } else {
      console.error("   -> FAIL: Unexpected error for invalid relative URL:", err);
      process.exit(1);
    }
  }

  // 6. Integration Test: POST /api/worker/artifacts/upload-image returns absolute downloadUrl
  console.log("\n6. Testing POST /api/worker/artifacts/upload-image absolute downloadUrl response...");
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use("/api/worker", workerRouter);

  const SERVER_PORT = 19003;
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(SERVER_PORT, "127.0.0.1", () => resolve(s));
  });

  const gatewayUrl = `http://127.0.0.1:${SERVER_PORT}`;

  try {
    const validPngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    const uploadRes = await fetch(`${gatewayUrl}/api/worker/artifacts/upload-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-Proto": "https",
        "X-Forwarded-Host": "jiajuagent-v1-292903497895.asia-east1.run.app",
      },
      body: JSON.stringify({
        fileName: "test_sofa_r2.png",
        fileData: `data:image/png;base64,${validPngBuffer.toString("base64")}`,
        workspaceId: "ws-test-r2",
      }),
    });

    if (!uploadRes.ok) {
      console.error("   -> FAIL: upload-image status", uploadRes.status);
      process.exit(1);
    }

    const uploadJson = await uploadRes.json();
    const artifact = uploadJson.artifact;
    const expectedPrefix = "https://jiajuagent-v1-292903497895.asia-east1.run.app/api/worker/artifacts/file/";

    if (!artifact.downloadUrl.startsWith(expectedPrefix)) {
      console.error("   -> FAIL: downloadUrl does not start with public origin! Actual:", artifact.downloadUrl);
      process.exit(1);
    }

    console.log("   -> PASS: POST /api/worker/artifacts/upload-image returned absolute URL:", artifact.downloadUrl);

    // 7. End-to-End ComfyUI execution using absolute downloadUrl
    console.log("\n7. Testing End-to-End ComfyUI Execution with Absolute Download URL...");
    const COMFY_MOCK_PORT = 19004;
    let comfyReceivedFilename = "";

    // Upload artifact targeting local express server port so fetch succeeds
    const localUploadRes = await fetch(`${gatewayUrl}/api/worker/artifacts/upload-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "test_sofa_r2_local.png",
        fileData: `data:image/png;base64,${validPngBuffer.toString("base64")}`,
        workspaceId: "ws-test-r2",
      }),
    });

    const localArtifact = (await localUploadRes.json()).artifact;
    if (!localArtifact.downloadUrl.startsWith(`http://127.0.0.1:${SERVER_PORT}`)) {
      console.error("   -> FAIL: Local upload artifact missing local origin prefix:", localArtifact.downloadUrl);
      process.exit(1);
    }

    const comfyMockServer = http.createServer((req, res) => {
      const url = req.url || "";
      if (url === "/system_stats") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ system: { os: "win32" } }));
      } else if (url === "/upload/image") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ name: "comfy_r2_bound.png", subfolder: "", type: "input" }));
      } else if (url === "/prompt") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          const parsed = JSON.parse(body);
          comfyReceivedFilename = parsed.prompt?.["20"]?.inputs?.image;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ prompt_id: "prompt-r2-pass" }));
        });
      } else if (url === "/history/prompt-r2-pass") {
        const dummyGlbDir = path.join(process.cwd(), "local-worker/temp/output/mesh/ws-test-r2/job-r2-001/part-backrest");
        fs.mkdirSync(dummyGlbDir, { recursive: true });
        const dummyGlbPath = path.join(dummyGlbDir, "mesh_ws-test-r2_job-r2-001_part-backrest_00001_.glb");
        fs.writeFileSync(dummyGlbPath, Buffer.from("glTF header dummy binary content for R2 test"));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            "prompt-r2-pass": {
              status: { completed: true },
              outputs: {
                "21": {
                  gltf: [
                    {
                      filename: "mesh_ws-test-r2_job-r2-001_part-backrest_00001_.glb",
                      subfolder: "mesh/ws-test-r2/job-r2-001/part-backrest",
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

    await new Promise<void>((resolve) => comfyMockServer.listen(COMFY_MOCK_PORT, "127.0.0.1", resolve));

    try {
      const jobWithAbsArtifact = {
        id: "job-r2-001",
        workspaceId: "ws-test-r2",
        provider: "comfyui_hunyuan3d",
        inputPayload: {
          partId: "part-backrest",
          sku: "SOFA-R2",
          inputArtifacts: [localArtifact],
          seed: 888,
        },
      };

      const execRes = await executeComfyHunyuan3dTask(jobWithAbsArtifact, "worker-r2", {
        enabled: true,
        baseUrl: `http://127.0.0.1:${COMFY_MOCK_PORT}`,
        gatewayUrl,
      });

      if (!execRes.success) {
        console.error("   -> FAIL: Execution failed:", execRes);
        process.exit(1);
      }

      if (comfyReceivedFilename !== "comfy_r2_bound.png") {
        console.error("   -> FAIL: ComfyUI image binding failed:", comfyReceivedFilename);
        process.exit(1);
      }

      console.log("   -> PASS: End-to-end task execution with resolved absolute URL succeeded!");
    } finally {
      comfyMockServer.close();
    }

    console.log("\n=== ALL G4-3-R2 HOTFIX VERIFICATION TESTS PASSED ===");
  } finally {
    server.close();
  }
}

runG43R2UrlHotfixTests().catch((err) => {
  console.error("G4-3-R2 Test Execution Error:", err);
  process.exit(1);
});
