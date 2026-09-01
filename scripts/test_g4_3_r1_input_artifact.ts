import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import express from "express";
import { workerRouter } from "../src/server/routes/worker.js";
import { executeComfyHunyuan3dTask } from "../local-worker/src/adapters/comfyExecutor.js";
import { ComfyAdapterError } from "../local-worker/src/adapters/comfyClient.js";

async function runG43R1Tests() {
  console.log("=== G4-3-R1 INPUT ARTIFACT CONTRACT HOTFIX VERIFICATION ===");

  // Setup local express server for server routes testing
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use("/api/worker", workerRouter);

  const SERVER_PORT = 19001;
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(SERVER_PORT, "127.0.0.1", () => resolve(s));
  });

  const gatewayUrl = `http://127.0.0.1:${SERVER_PORT}`;

  try {
    // 1. Test POST /api/worker/artifacts/upload-image (Canonical Artifact)
    console.log("\n1. Testing POST /api/worker/artifacts/upload-image...");
    // Create a 1x1 valid PNG buffer
    const validPngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    const uploadRes = await fetch(`${gatewayUrl}/api/worker/artifacts/upload-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "test_sofa_part.png",
        fileData: `data:image/png;base64,${validPngBuffer.toString("base64")}`,
        workspaceId: "ws-test-r1",
      }),
    });

    if (!uploadRes.ok) {
      console.error("   -> FAIL: upload-image HTTP status", uploadRes.status);
      process.exit(1);
    }

    const uploadJson = await uploadRes.json();
    if (!uploadJson.success || !uploadJson.artifact) {
      console.error("   -> FAIL: upload-image missing artifact response:", uploadJson);
      process.exit(1);
    }

    const art = uploadJson.artifact;
    if (
      !art.id ||
      art.kind !== "reference_image" ||
      art.format !== "png" ||
      art.mimeType !== "image/png" ||
      !art.downloadUrl ||
      art.productionTruth !== false ||
      art.bytes !== validPngBuffer.length
    ) {
      console.error("   -> FAIL: Canonical artifact format invalid:", art);
      process.exit(1);
    }

    console.log("   -> PASS: Canonical artifact structure verified:", art);

    // 2. Test GET /api/worker/artifacts/file/:artifactId (Raw binary download)
    console.log("\n2. Testing GET /api/worker/artifacts/file/:artifactId...");
    const fetchUrl = art.downloadUrl.startsWith("http://") || art.downloadUrl.startsWith("https://")
      ? art.downloadUrl
      : `${gatewayUrl}${art.downloadUrl}`;
    const rawFileRes = await fetch(fetchUrl);

    if (!rawFileRes.ok) {
      console.error("   -> FAIL: Raw file fetch HTTP status", rawFileRes.status);
      process.exit(1);
    }

    const fetchedContentType = rawFileRes.headers.get("content-type");
    if (!fetchedContentType?.includes("image/png")) {
      console.error("   -> FAIL: Content-Type is not image/png:", fetchedContentType);
      process.exit(1);
    }

    const fetchedBuffer = Buffer.from(await rawFileRes.arrayBuffer());
    if (Buffer.compare(fetchedBuffer, validPngBuffer) !== 0) {
      console.error("   -> FAIL: Fetched raw binary buffer does not match uploaded buffer!");
      process.exit(1);
    }

    console.log("   -> PASS: Raw binary file served with correct Content-Type & length:", fetchedBuffer.length, "bytes");

    // 3. Test Local Worker Artifact Resolution & ComfyUI Integration Flow
    console.log("\n3. Testing Local Worker Artifact Resolution & ComfyUI Flow...");
    const COMFY_MOCK_PORT = 19002;
    let comfyReceivedFilename = "";
    let comfyReceivedPrompt: any = null;

    const comfyMockServer = http.createServer((req, res) => {
      const url = req.url || "";
      if (url === "/system_stats") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ system: { os: "win32" } }));
      } else if (url === "/upload/image") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ name: "comfy_bound_image_101.png", subfolder: "", type: "input" }));
      } else if (url === "/prompt") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          comfyReceivedPrompt = JSON.parse(body);
          comfyReceivedFilename = comfyReceivedPrompt.prompt?.["20"]?.inputs?.image;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ prompt_id: "prompt-r1-pass" }));
        });
      } else if (url === "/history/prompt-r1-pass") {
        const dummyGlbDir = path.join(process.cwd(), "local-worker/temp/output/mesh/ws-test-r1/job-r1-001/part-arm");
        fs.mkdirSync(dummyGlbDir, { recursive: true });
        const dummyGlbPath = path.join(dummyGlbDir, "mesh_ws-test-r1_job-r1-001_part-arm_00001_.glb");
        fs.writeFileSync(dummyGlbPath, Buffer.from("glTF header dummy binary content for R1 test"));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            "prompt-r1-pass": {
              status: { completed: true },
              outputs: {
                "21": {
                  gltf: [
                    {
                      filename: "mesh_ws-test-r1_job-r1-001_part-arm_00001_.glb",
                      subfolder: "mesh/ws-test-r1/job-r1-001/part-arm",
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
      const jobWithArtifact = {
        id: "job-r1-001",
        workspaceId: "ws-test-r1",
        provider: "comfyui_hunyuan3d",
        inputPayload: {
          partId: "part-arm",
          sku: "SOFA-R1",
          inputArtifacts: [art],
          seed: 999,
        },
      };

      const execRes = await executeComfyHunyuan3dTask(jobWithArtifact, "worker-r1", {
        enabled: true,
        baseUrl: `http://127.0.0.1:${COMFY_MOCK_PORT}`,
        gatewayUrl,
        requestTimeoutMs: 5000,
        jobTimeoutMs: 5000,
        pollIntervalMs: 50,
      });

      if (!execRes.success || !execRes.outputArtifacts || execRes.outputArtifacts.length !== 1) {
        console.error("   -> FAIL: Execution failed or missing artifact:", execRes);
        process.exit(1);
      }

      if (comfyReceivedFilename !== "comfy_bound_image_101.png") {
        console.error("   -> FAIL: LoadImage node was not bound with ComfyUI uploaded filename!", comfyReceivedFilename);
        process.exit(1);
      }

      console.log("   -> PASS: Local Worker resolved inputArtifacts.downloadUrl and successfully bound filename to LoadImage node:", comfyReceivedFilename);

      // 4. Test Error Code Rejections
      console.log("\n4. Testing Specific Error Code Rejections...");

      // 4a. Missing image -> no_supported_input_image
      try {
        await executeComfyHunyuan3dTask(
          { id: "j-err1", workspaceId: "ws", provider: "comfyui_hunyuan3d", inputPayload: {} },
          "worker-r1",
          { enabled: true, baseUrl: `http://127.0.0.1:${COMFY_MOCK_PORT}`, gatewayUrl }
        );
        console.error("   -> FAIL: Failed to reject missing input image!");
        process.exit(1);
      } catch (err: any) {
        if (err instanceof ComfyAdapterError && err.code === "no_supported_input_image") {
          console.log("   -> PASS: Correctly threw 'no_supported_input_image' when input payload is missing image");
        } else {
          console.error("   -> FAIL: Unexpected error code for missing image:", err.code);
          process.exit(1);
        }
      }

      // 4b. Non-image HTML/JSON masquerading -> non_image_response
      const htmlArtifactId = `art-img-fakehtml-${Date.now()}`;
      const uploadsDir = path.join(process.cwd(), "uploads", "artifacts");
      fs.writeFileSync(path.join(uploadsDir, `${htmlArtifactId}.raw`), Buffer.from("<html><body>Error 500</body></html>"));
      fs.writeFileSync(
        path.join(uploadsDir, `${htmlArtifactId}.json`),
        JSON.stringify({
          id: htmlArtifactId,
          downloadUrl: `/api/worker/artifacts/file/${htmlArtifactId}`,
          mimeType: "text/html",
        })
      );

      try {
        await executeComfyHunyuan3dTask(
          {
            id: "j-err2",
            workspaceId: "ws",
            provider: "comfyui_hunyuan3d",
            inputPayload: {
              inputArtifacts: [{ downloadUrl: `/api/worker/artifacts/file/${htmlArtifactId}` }],
            },
          },
          "worker-r1",
          { enabled: true, baseUrl: `http://127.0.0.1:${COMFY_MOCK_PORT}`, gatewayUrl }
        );
        console.error("   -> FAIL: Allowed HTML masquerading as image!");
        process.exit(1);
      } catch (err: any) {
        if (err instanceof ComfyAdapterError && err.code === "non_image_response") {
          console.log("   -> PASS: Correctly threw 'non_image_response' for HTML payload");
        } else {
          console.error("   -> FAIL: Unexpected error for HTML payload:", err);
          process.exit(1);
        }
      }

      // 4c. Invalid magic bytes -> magic_bytes_mismatch
      const invalidBytesArtifactId = `art-img-badbytes-${Date.now()}`;
      fs.writeFileSync(path.join(uploadsDir, `${invalidBytesArtifactId}.raw`), Buffer.from("abcdef1234567890qwertyuiop"));
      fs.writeFileSync(
        path.join(uploadsDir, `${invalidBytesArtifactId}.json`),
        JSON.stringify({
          id: invalidBytesArtifactId,
          downloadUrl: `/api/worker/artifacts/file/${invalidBytesArtifactId}`,
        })
      );

      try {
        await executeComfyHunyuan3dTask(
          {
            id: "j-err3",
            workspaceId: "ws",
            provider: "comfyui_hunyuan3d",
            inputPayload: {
              inputArtifacts: [{ downloadUrl: `/api/worker/artifacts/file/${invalidBytesArtifactId}` }],
            },
          },
          "worker-r1",
          { enabled: true, baseUrl: `http://127.0.0.1:${COMFY_MOCK_PORT}`, gatewayUrl }
        );
        console.error("   -> FAIL: Allowed invalid magic bytes!");
        process.exit(1);
      } catch (err: any) {
        if (err instanceof ComfyAdapterError && err.code === "magic_bytes_mismatch") {
          console.log("   -> PASS: Correctly threw 'magic_bytes_mismatch' for invalid magic bytes");
        } else {
          console.error("   -> FAIL: Unexpected error for invalid magic bytes:", err);
          process.exit(1);
        }
      }

      // 4d. Empty body -> empty_body
      const emptyArtifactId = `art-img-empty-${Date.now()}`;
      fs.writeFileSync(path.join(uploadsDir, `${emptyArtifactId}.raw`), Buffer.alloc(0));
      fs.writeFileSync(
        path.join(uploadsDir, `${emptyArtifactId}.json`),
        JSON.stringify({
          id: emptyArtifactId,
          downloadUrl: `/api/worker/artifacts/file/${emptyArtifactId}`,
        })
      );

      try {
        await executeComfyHunyuan3dTask(
          {
            id: "j-err4",
            workspaceId: "ws",
            provider: "comfyui_hunyuan3d",
            inputPayload: {
              inputArtifacts: [{ downloadUrl: `/api/worker/artifacts/file/${emptyArtifactId}` }],
            },
          },
          "worker-r1",
          { enabled: true, baseUrl: `http://127.0.0.1:${COMFY_MOCK_PORT}`, gatewayUrl }
        );
        console.error("   -> FAIL: Allowed empty body!");
        process.exit(1);
      } catch (err: any) {
        if (err instanceof ComfyAdapterError && err.code === "empty_body") {
          console.log("   -> PASS: Correctly threw 'empty_body' for 0-byte file");
        } else {
          console.error("   -> FAIL: Unexpected error for empty body:", err);
          process.exit(1);
        }
      }
    } finally {
      comfyMockServer.close();
    }

    console.log("\n=== ALL G4-3-R1 HOTFIX VERIFICATION TESTS PASSED ===");
  } finally {
    server.close();
  }
}

runG43R1Tests().catch((err) => {
  console.error("G4-3-R1 Test Execution Error:", err);
  process.exit(1);
});
