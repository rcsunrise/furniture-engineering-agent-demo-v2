import * as fs from "fs";
import * as path from "path";
import { createEngineeringArtifact, EngineeringArtifactSchema, type EngineeringArtifact } from "../../../src/shared/artifact.js";
import { type ExecutionResult } from "../executor.js";
import { ComfyClient, ComfyAdapterError } from "./comfyClient.js";
import { ComfyWorkflowManager } from "./comfyWorkflow.js";
import { resolveDeterministicGlbOutput } from "./comfyOutputResolver.js";
import { HUNYUAN_NODE_BINDING } from "./hunyuanWorkflowBinding.js";
import { resolveInputImageUrl } from "./inputImageResolver.js";

export interface ComfyExecutorOptions {
  enabled?: boolean;
  baseUrl?: string;
  workflowPath?: string;
  inputDir?: string;
  outputDir?: string;
  requestTimeoutMs?: number;
  jobTimeoutMs?: number;
  pollIntervalMs?: number;
  gatewayUrl?: string;
  serverOrigin?: string;
  gatewayClient?: any;
}

export async function executeComfyHunyuan3dTask(
  job: any,
  workerId: string,
  options: ComfyExecutorOptions = {}
): Promise<ExecutionResult> {
  const startTime = new Date().toISOString();
  const startMs = Date.now();

  const enabled = options.enabled ?? (process.env.COMFYUI_ENABLED === "true" || process.env.COMFYUI_ENABLED === "1");
  if (!enabled) {
    throw new ComfyAdapterError("COMFYUI_DISABLED", "ComfyUI integration is disabled in worker environment (COMFYUI_ENABLED=false)");
  }

  const baseUrl = options.baseUrl || process.env.COMFYUI_BASE_URL || "http://127.0.0.1:8000";
  const workflowPath =
    options.workflowPath ||
    process.env.COMFYUI_WORKFLOW ||
    "local-worker/workflows/hunyuan3d-v2.1-part-v1.api.json";
  const inputDir = (options.inputDir || process.env.COMFYUI_INPUT_DIR || "local-worker/temp/input").trim().replace(/^["']|["']$/g, "");
  const outputDir = (options.outputDir || process.env.COMFYUI_OUTPUT_DIR || "local-worker/temp/output").trim().replace(/^["']|["']$/g, "");
  const requestTimeoutMs =
    options.requestTimeoutMs || parseInt(process.env.COMFYUI_REQUEST_TIMEOUT_MS || "10000", 10);
  const jobTimeoutMs =
    options.jobTimeoutMs || parseInt(process.env.COMFYUI_JOB_TIMEOUT_MS || "120000", 10);
  const pollIntervalMs =
    options.pollIntervalMs || parseInt(process.env.COMFYUI_POLL_INTERVAL_MS || "2000", 10);
  const gatewayUrl = (options.gatewayUrl || process.env.WORKER_GATEWAY_URL || "http://127.0.0.1:3000").trim().replace(/^["']|["']$/g, "");
  const serverOrigin = (options.serverOrigin || process.env.SERVER_ORIGIN || gatewayUrl).trim().replace(/^["']|["']$/g, "");

  // 1. Initialize Client & Check Health
  const client = new ComfyClient({ baseUrl, requestTimeoutMs });
  await client.checkHealth(); // throws COMFYUI_UNAVAILABLE on failure

  // 2. Load Workflow Preset & Validate Binding
  const workflowManager = new ComfyWorkflowManager();
  const workflowPreset = workflowManager.loadWorkflowPreset(workflowPath);

  // 3. Extract & Validate Input Artifact / Image
  const payload = job.inputPayload || {};
  const inputArtifacts = Array.isArray(payload.inputArtifacts) ? payload.inputArtifacts : [];
  const firstArtifact = inputArtifacts[0];

  let imageUri: string | undefined = undefined;
  let sourceName = "none";

  if (firstArtifact && typeof firstArtifact.downloadUrl === "string" && firstArtifact.downloadUrl) {
    imageUri = firstArtifact.downloadUrl;
    sourceName = "inputArtifacts.downloadUrl";
  } else if (firstArtifact && (typeof firstArtifact.uri === "string" || typeof firstArtifact.url === "string")) {
    imageUri = firstArtifact.uri || firstArtifact.url;
    sourceName = "inputArtifacts.uri";
  } else if (typeof payload.inputImageUrl === "string" && payload.inputImageUrl) {
    imageUri = payload.inputImageUrl;
    sourceName = "inputPayload.inputImageUrl";
  } else if (typeof payload.imageUrl === "string" && payload.imageUrl) {
    imageUri = payload.imageUrl;
    sourceName = "inputPayload.imageUrl";
  } else if (typeof payload.imageUri === "string" && payload.imageUri) {
    imageUri = payload.imageUri;
    sourceName = "inputPayload.imageUri";
  } else if (typeof payload.localPath === "string" && payload.localPath) {
    imageUri = payload.localPath;
    sourceName = "inputPayload.localPath";
  }

  if (!imageUri || typeof imageUri !== "string") {
    throw new ComfyAdapterError(
      "no_supported_input_image",
      "No supported input image found in job inputPayload (checked inputArtifacts.downloadUrl -> uri -> inputImageUrl -> imageUrl -> imageUri -> localPath)"
    );
  }

  const resolvedUrl = resolveInputImageUrl(imageUri, { serverOrigin, gatewayUrl });

  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  let imageBuffer: Buffer | null = null;
  let httpStatus = 200;
  let contentType = "";

  try {
    if (resolvedUrl.startsWith("data:")) {
      const parts = resolvedUrl.split(",");
      const metaPart = parts[0] || "";
      contentType = metaPart.split(";")[0]?.replace("data:", "") || "image/png";
      imageBuffer = Buffer.from(parts[1] || "", "base64");
    } else if (resolvedUrl.startsWith("http://") || resolvedUrl.startsWith("https://")) {
      const res = await fetch(resolvedUrl);
      httpStatus = res.status;
      contentType = res.headers.get("content-type") || "";

      if (!res.ok) {
        throw new ComfyAdapterError(
          "non_image_response",
          `HTTP ${res.status} ${res.statusText} when downloading input artifact from ${resolvedUrl}`
        );
      }

      const arrayBuf = await res.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuf);
    } else if (fs.existsSync(resolvedUrl)) {
      imageBuffer = fs.readFileSync(resolvedUrl);
    } else {
      imageBuffer = Buffer.from(resolvedUrl, "base64");
    }
  } catch (err: any) {
    if (err instanceof ComfyAdapterError) throw err;
    throw new ComfyAdapterError(
      "INPUT_ARTIFACT_DOWNLOAD_FAILED",
      `Failed to download reference image artifact from '${resolvedUrl}': ${err.message}`
    );
  }

  if (!imageBuffer || imageBuffer.length === 0) {
    throw new ComfyAdapterError(
      "empty_body",
      `Downloaded input image artifact from '${sourceName}' is empty (0 bytes)`
    );
  }

  let detectedFormat: "png" | "jpeg" | "webp" | null = null;

  if (
    imageBuffer.length >= 8 &&
    imageBuffer[0] === 0x89 &&
    imageBuffer[1] === 0x50 &&
    imageBuffer[2] === 0x4e &&
    imageBuffer[3] === 0x47 &&
    imageBuffer[4] === 0x0d &&
    imageBuffer[5] === 0x0a &&
    imageBuffer[6] === 0x1a &&
    imageBuffer[7] === 0x0a
  ) {
    detectedFormat = "png";
  } else if (
    imageBuffer.length >= 3 &&
    imageBuffer[0] === 0xff &&
    imageBuffer[1] === 0xd8 &&
    imageBuffer[2] === 0xff
  ) {
    detectedFormat = "jpeg";
  } else if (
    imageBuffer.length >= 12 &&
    imageBuffer[0] === 0x52 &&
    imageBuffer[1] === 0x49 &&
    imageBuffer[2] === 0x46 &&
    imageBuffer[3] === 0x46 &&
    imageBuffer[8] === 0x57 &&
    imageBuffer[9] === 0x45 &&
    imageBuffer[10] === 0x42 &&
    imageBuffer[11] === 0x50
  ) {
    detectedFormat = "webp";
  }

  if (!detectedFormat) {
    const textPreview = imageBuffer.toString("utf8", 0, 100).trim();
    if (
      textPreview.startsWith("<") ||
      textPreview.startsWith("{") ||
      contentType.includes("html") ||
      contentType.includes("json")
    ) {
      throw new ComfyAdapterError(
        "non_image_response",
        `Downloaded input artifact from '${sourceName}' is HTML/JSON instead of an image binary`
      );
    }
    throw new ComfyAdapterError(
      "magic_bytes_mismatch",
      `Downloaded input artifact from '${sourceName}' magic bytes do not match PNG, JPEG, or WEBP headers`
    );
  }

  if (contentType && (contentType.includes("text/html") || contentType.includes("application/json"))) {
    throw new ComfyAdapterError(
      "non_image_response",
      `Downloaded input artifact Content-Type '${contentType}' is non-image`
    );
  }

  // Observability diagnostics
  console.log(`[InputArtifact] source=${sourceName}`);
  console.log(`[InputArtifact] status=${httpStatus} contentType=${contentType || "image/" + detectedFormat}`);
  console.log(`[InputArtifact] bytes=${imageBuffer.length} detected=${detectedFormat}`);

  // Upload image to ComfyUI
  const imageName = `job_${job.id}_${Date.now()}.${detectedFormat}`;
  const uploadRes = await client.uploadImage(imageName, imageBuffer);
  console.log(`[ComfyUI] upload OK name=${uploadRes.name}`);

  // 4. Resolve Job Seed & Mutate Workflow
  const seed = typeof payload.seed === "number" ? payload.seed : 42;
  const workspaceId = job.workspaceId || "default-ws";
  const jobId = job.id;
  const partId = payload.partId || payload.componentId || "part-main";
  const sku = payload.sku || "DEMO-SKU-01";

  const mutatedWorkflow = workflowManager.prepareHunyuanJobWorkflow({
    workflowPreset,
    uploadedImageFilename: uploadRes.name,
    workspaceId,
    jobId,
    partId,
    seed,
  });
  console.log(`[Workflow] LoadImage image=${uploadRes.name}`);

  // 5. Submit Prompt
  const promptRes = await client.submitPrompt(mutatedWorkflow);
  const promptId = promptRes.prompt_id;

  // 6. Poll History until Completion or Timeout
  let historyData: any = null;
  const pollStart = Date.now();
  while (Date.now() - pollStart < jobTimeoutMs) {
    try {
      historyData = await client.getHistory(promptId);
      if (historyData && (historyData.status?.completed || historyData.outputs)) {
        break;
      }
    } catch (err: any) {
      if (err.code === "COMFYUI_NON_JSON_RESPONSE") throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  if (!historyData) {
    throw new ComfyAdapterError(
      "COMFYUI_JOB_TIMEOUT",
      `Job execution timed out after ${jobTimeoutMs}ms waiting for promptId '${promptId}'`
    );
  }

  // 7. Resolve Output GLB File
  const resolvedOutput = resolveDeterministicGlbOutput({
    historyData,
    saveGlbNodeId: HUNYUAN_NODE_BINDING.saveGlbNodeId,
    outputDir,
    workspaceId,
    jobId,
    partId,
    promptId,
  });

  const endTime = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  // Upload GLB artifact to server endpoint and retrieve canonical EngineeringArtifact
  let rawArtifact: any;

  try {
    if (options.gatewayClient && typeof options.gatewayClient.uploadArtifact === "function") {
      const uploadRes = await options.gatewayClient.uploadArtifact({
        fileName: `part_${partId}_${jobId}.glb`,
        fileData: resolvedOutput.fileBuffer.toString("base64"),
        jobId,
        partId,
        sku,
        provider: "comfyui_hunyuan3d",
        workflowVersion: "hunyuan3d-v2.1-part-v1.api.json",
        modelOrCheckpoint: "hunyuan_3d_v2.1.safetensors",
        seed,
      });
      rawArtifact = uploadRes.artifact;
    } else {
      // Direct fetch fallback to gatewayUrl
      let base = (gatewayUrl || "").trim().replace(/\/+$/, "");
      if (base.endsWith("/api/worker/runtime")) {
        base = base.substring(0, base.length - "/api/worker/runtime".length);
      } else if (base.endsWith("/api/worker")) {
        base = base.substring(0, base.length - "/api/worker".length);
      }
      const uploadRes = await fetch(`${base}/api/worker/artifacts/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-token": process.env.LOCAL_WORKER_TOKEN || "default-local-worker-token",
        },
        body: JSON.stringify({
          fileName: `part_${partId}_${jobId}.glb`,
          fileData: resolvedOutput.fileBuffer.toString("base64"),
          jobId,
          partId,
          sku,
          provider: "comfyui_hunyuan3d",
          workflowVersion: "hunyuan3d-v2.1-part-v1.api.json",
          modelOrCheckpoint: "hunyuan_3d_v2.1.safetensors",
          seed,
        }),
      });
      if (!uploadRes.ok) {
        throw new Error(`HTTP ${uploadRes.status} ${uploadRes.statusText}`);
      }
      const json = await uploadRes.json();
      rawArtifact = json.artifact;
    }
  } catch (err: any) {
    throw new ComfyAdapterError(
      "GLB_UPLOAD_FAILED",
      `Failed to upload generated GLB to server artifact storage: ${err.message}`
    );
  }

  // Parse server-returned canonical EngineeringArtifact
  const canonicalArtifact = EngineeringArtifactSchema.parse(rawArtifact);
  console.log("[G4-3-R3.1][CANONICAL_ARTIFACT_VALID]", JSON.stringify(canonicalArtifact));

  return {
    success: true,
    outputArtifacts: [canonicalArtifact],
  };
}
