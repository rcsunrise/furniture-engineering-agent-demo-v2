import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { workerAuthMiddleware } from "../worker/workerAuth.js";
import { globalWorkerRegistry, UnknownWorkerError } from "../worker/workerRegistry.js";
import { globalWorkerLeaseService, LeaseConflictError } from "../worker/workerLeaseService.js";
import { globalWorkerJobStore, JobNotFoundError, WorkspaceMismatchError } from "../worker/workerJobStore.js";
import { IllegalWorkerStateTransitionError } from "../worker/workerStateMachine.js";
import {
  WorkerRegistrationRequestSchema,
  WorkerHeartbeatRequestSchema,
  WorkerJobResultRequestSchema,
} from "../../shared/workerRuntime.js";
import { createEngineeringArtifact } from "../../shared/artifact.js";
import { globalEngineeringSessionStore } from "../engineeringSessionStore.js";
import { rateLimiterMiddleware } from "../limiter/parseLimiter.js";

export const workerRuntimeRouter = Router();

// Apply dedicated rate limiter for worker runtime (heartbeat/jobs) bucket
workerRuntimeRouter.use(
  rateLimiterMiddleware({
    bucketName: "worker_runtime",
    windowMs: 60000,
    maxRequests: 120,
    code: "WORKER_RUNTIME_RATE_LIMITED",
    message: "Worker runtime rate limit exceeded",
  })
);

// Apply worker authentication middleware to all /api/worker/runtime routes
workerRuntimeRouter.use(workerAuthMiddleware);

// 1. POST /api/worker/runtime/register - Worker registration
workerRuntimeRouter.post("/register", (req: Request, res: Response) => {
  const parseResult = WorkerRegistrationRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: {
        code: "INVALID_REGISTRATION",
        message: "Failed to parse WorkerRegistrationRequest",
        details: parseResult.error.format(),
      },
    });
    return;
  }

  const worker = globalWorkerRegistry.registerWorker(parseResult.data);
  res.status(200).json({
    worker,
    heartbeatIntervalMs: 5000,
  });
});

// 2. POST /api/worker/runtime/:workerId/heartbeat - Heartbeat check-in
workerRuntimeRouter.post("/:workerId/heartbeat", (req: Request, res: Response) => {
  const workerId = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
  const parseResult = WorkerHeartbeatRequestSchema.safeParse(req.body || {});
  if (!parseResult.success) {
    const details = parseResult.error.issues.map((issue) => {
      const fieldPath = issue.path.join(".") || "body";
      let expected = issue.message;
      if ((issue as any).code === "invalid_enum_value") {
        expected = (issue as any).options?.join(" | ") || issue.message;
      } else if (issue.code === "invalid_type") {
        expected = issue.expected;
      }
      const rawVal = issue.path.length > 0 ? (req.body as Record<string, any>)?.[issue.path[0] as string] : req.body;
      let received = rawVal === null ? "null" : typeof rawVal === "object" ? "object" : String(rawVal);
      if (fieldPath.toLowerCase().includes("token") || fieldPath.toLowerCase().includes("secret") || fieldPath.toLowerCase().includes("key")) {
        received = "[REDACTED]";
      }
      return {
        path: fieldPath,
        expected,
        received,
      };
    });

    res.status(400).json({
      error: {
        code: "INVALID_HEARTBEAT",
        message: "Failed to parse WorkerHeartbeatRequest",
        details,
      },
    });
    return;
  }

  try {
    const { worker, isOnline } = globalWorkerRegistry.heartbeatWorker(workerId, parseResult.data);
    res.status(200).json({
      success: true,
      worker,
      isOnline,
      serverTime: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err instanceof UnknownWorkerError) {
      res.status(404).json({
        error: {
          code: err.code,
          message: err.message,
        },
      });
      return;
    }
    res.status(500).json({
      error: {
        code: "HEARTBEAT_FAILED",
        message: String(err),
      },
    });
  }
});

// 3. GET /api/worker/runtime/:workerId/jobs/next - Poll next available job for worker
workerRuntimeRouter.get("/:workerId/jobs/next", (req: Request, res: Response) => {
  const workerId = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
  const worker = globalWorkerRegistry.getWorker(workerId);
  if (!worker) {
    res.status(404).json({
      error: {
        code: "UNKNOWN_WORKER",
        message: `Worker '${workerId}' is not registered`,
      },
    });
    return;
  }

  if (!globalWorkerRegistry.isWorkerOnline(worker)) {
    res.status(400).json({
      error: {
        code: "WORKER_OFFLINE",
        message: `Worker '${workerId}' is offline (heartbeat timeout)`,
      },
    });
    return;
  }

  // Find queued job matching worker capabilities
  const queuedJobs = globalWorkerJobStore.listJobs({ status: "queued" });
  const eligibleJob = queuedJobs.find((j) => {
    const hasCap = worker.capabilities.includes(j.capabilityId);
    const hasLease = globalWorkerLeaseService.hasActiveLease(j.id);
    return hasCap && !hasLease;
  });

  res.status(200).json({
    job: eligibleJob || null,
  });
});

// 4. POST /api/worker/runtime/:workerId/jobs/:jobId/claim - Claim job
workerRuntimeRouter.post("/:workerId/jobs/:jobId/claim", (req: Request, res: Response) => {
  const workerId = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
  const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const worker = globalWorkerRegistry.getWorker(workerId);
  if (!worker) {
    res.status(404).json({
      error: {
        code: "UNKNOWN_WORKER",
        message: `Worker '${workerId}' is not registered`,
      },
    });
    return;
  }

  const job = globalWorkerJobStore.getJob(jobId);
  if (!job) {
    res.status(404).json({
      error: {
        code: "JOB_NOT_FOUND",
        message: `Job '${jobId}' not found`,
      },
    });
    return;
  }

  if (!worker.capabilities.includes(job.capabilityId)) {
    res.status(400).json({
      error: {
        code: "CAPABILITY_MISMATCH",
        message: `Worker '${workerId}' does not support job capability '${job.capabilityId}'`,
      },
    });
    return;
  }

  // Check active lease or non-queued status
  if (globalWorkerLeaseService.hasActiveLease(jobId)) {
    const existingLease = globalWorkerLeaseService.getLease(jobId);
    if (existingLease && existingLease.workerId !== workerId) {
      res.status(409).json({
        error: {
          code: "DOUBLE_CLAIM",
          message: `Job '${jobId}' is already claimed by worker '${existingLease.workerId}'`,
        },
      });
      return;
    }
  }

  try {
    const updatedJob = globalWorkerJobStore.updateJobStatus(jobId, "claimed", { workerId });
    const lease = globalWorkerLeaseService.createLease(jobId, workerId);

    res.status(200).json({
      success: true,
      data: updatedJob,
      lease,
    });
  } catch (err: any) {
    if (err instanceof IllegalWorkerStateTransitionError) {
      res.status(400).json({
        error: {
          code: err.code,
          message: err.message,
        },
      });
      return;
    }
    if (err instanceof LeaseConflictError) {
      res.status(409).json({
        error: {
          code: err.code,
          message: err.message,
        },
      });
      return;
    }
    res.status(500).json({
      error: {
        code: "CLAIM_FAILED",
        message: String(err),
      },
    });
  }
});

// 5. POST /api/worker/runtime/:workerId/jobs/:jobId/start - Mark job running
workerRuntimeRouter.post("/:workerId/jobs/:jobId/start", (req: Request, res: Response) => {
  const workerId = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
  const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const worker = globalWorkerRegistry.getWorker(workerId);
  if (!worker) {
    res.status(404).json({
      error: {
        code: "UNKNOWN_WORKER",
        message: `Worker '${workerId}' is not registered`,
      },
    });
    return;
  }

  const job = globalWorkerJobStore.getJob(jobId);
  if (!job) {
    res.status(404).json({
      error: {
        code: "JOB_NOT_FOUND",
        message: `Job '${jobId}' not found`,
      },
    });
    return;
  }

  if (job.claimedByWorkerId && job.claimedByWorkerId !== workerId) {
    res.status(403).json({
      error: {
        code: "WRONG_WORKER",
        message: `Job '${jobId}' was claimed by worker '${job.claimedByWorkerId}', not '${workerId}'`,
      },
    });
    return;
  }

  try {
    const updatedJob = globalWorkerJobStore.updateJobStatus(jobId, "running", { workerId });
    res.status(200).json({
      success: true,
      data: updatedJob,
    });
  } catch (err: any) {
    if (err instanceof IllegalWorkerStateTransitionError) {
      res.status(400).json({
        error: {
          code: err.code,
          message: err.message,
        },
      });
      return;
    }
    res.status(500).json({
      error: {
        code: "START_FAILED",
        message: String(err),
      },
    });
  }
});

function normalizeWorkerJobResultBody(rawBody: any): any {
  if (!rawBody || typeof rawBody !== "object") return rawBody;

  const body = { ...rawBody };
  delete body.metadata;

  const rawArtifacts = body.outputArtifacts || body.artifacts;
  if (Array.isArray(rawArtifacts)) {
    body.outputArtifacts = rawArtifacts.map((art: any) => {
      if (!art || typeof art !== "object") return art;

      const id = typeof art.id === "string" && art.id ? art.id : `art-glb-${Date.now()}`;
      const type = typeof art.type === "string" && art.type ? art.type : (art.kind === "reference_image" ? "preview_image" : "ai_reference_mesh");
      const name = typeof art.name === "string" && art.name ? art.name : `Hunyuan3D Reference Mesh (${art.partId || "part"})`;
      let uri = typeof art.uri === "string" && art.uri ? art.uri : (art.downloadUrl || art.url || art.metadata?.url || "");

      // Sanitize unsafe local worker filesystem paths (C:\, D:\, file://, etc.)
      if (
        /^[a-zA-Z]:[\\/]/.test(uri) ||
        uri.startsWith("file://") ||
        uri.includes("\\ComfyUI\\") ||
        uri.includes("/ComfyUI/")
      ) {
        console.warn(`[WorkerRuntime] Sanitized local filesystem path in artifact uri: ${uri}`);
        uri = `/api/worker/artifacts/file/${id}`;
      }

      const provenance = art.provenance && typeof art.provenance === "object" ? art.provenance : {
        provider: art.source || art.metadata?.source || "comfyui_hunyuan3d",
        workflowVersion: art.metadata?.workflow || "hunyuan3d-v2.1-part-v1.api.json",
        modelOrCheckpoint: art.metadata?.model || "hunyuan_3d_v2.1.safetensors",
        seed: typeof art.metadata?.seed === "number" ? art.metadata.seed : undefined,
        createdAt: new Date().toISOString(),
      };

      return createEngineeringArtifact({
        id,
        type,
        name,
        uri,
        provenance,
        productionTruth: false,
      });
    });
    delete body.artifacts;
  }

  return body;
}

// 6. POST /api/worker/runtime/:workerId/jobs/:jobId/result - Report job completed or failed
workerRuntimeRouter.post("/:workerId/jobs/:jobId/result", (req: Request, res: Response) => {
  const workerId = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
  const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const normalizedBody = normalizeWorkerJobResultBody(req.body || {});
  const parseResult = WorkerJobResultRequestSchema.safeParse(normalizedBody);
  if (!parseResult.success) {
    const details = parseResult.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      code: issue.code,
      message: issue.message,
    }));
    res.status(400).json({
      error: {
        code: "INVALID_RESULT_PAYLOAD",
        message: "Failed to parse WorkerJobResultRequest",
        details,
      },
    });
    return;
  }

  const worker = globalWorkerRegistry.getWorker(workerId);
  if (!worker) {
    res.status(404).json({
      error: {
        code: "UNKNOWN_WORKER",
        message: `Worker '${workerId}' is not registered`,
      },
    });
    return;
  }

  const job = globalWorkerJobStore.getJob(jobId);
  if (!job) {
    res.status(404).json({
      error: {
        code: "JOB_NOT_FOUND",
        message: `Job '${jobId}' not found`,
      },
    });
    return;
  }

  if (job.claimedByWorkerId && job.claimedByWorkerId !== workerId) {
    res.status(403).json({
      error: {
        code: "WRONG_WORKER",
        message: `Job '${jobId}' was claimed by worker '${job.claimedByWorkerId}', not '${workerId}'`,
      },
    });
    return;
  }

  const { status, outputArtifacts, error } = parseResult.data;

  // Enforce productionTruth = false for all output artifacts
  const safeArtifacts = outputArtifacts?.map((art) =>
    createEngineeringArtifact({
      ...art,
      productionTruth: false,
    })
  );

  try {
    const updatedJob = globalWorkerJobStore.updateJobStatus(jobId, status, {
      workerId,
      artifacts: safeArtifacts,
      error,
    });

    // Attach GLB artifacts to active engineering session
    if (safeArtifacts && safeArtifacts.length > 0) {
      for (const art of safeArtifacts) {
        globalEngineeringSessionStore.attachMeshArtifactToSession({
          workspaceId: updatedJob?.workspaceId || "default-workspace",
          partId: art.name || "part-mesh",
          artifactId: art.id,
        });
      }
    }

    // Release lease
    globalWorkerLeaseService.releaseLease(jobId, workerId);

    res.status(200).json({
      success: true,
      data: updatedJob,
    });
  } catch (err: any) {
    if (err instanceof IllegalWorkerStateTransitionError) {
      res.status(400).json({
        error: {
          code: err.code,
          message: err.message,
        },
      });
      return;
    }
    res.status(500).json({
      error: {
        code: "RESULT_FAILED",
        message: String(err),
      },
    });
  }
});

// 7. POST /api/worker/runtime/artifacts/upload - Upload generated GLB artifact from local worker
workerRuntimeRouter.post("/artifacts/upload", (req: Request, res: Response) => {
  try {
    const { fileName, fileData, jobId, partId, sku, provider, workflowVersion, modelOrCheckpoint, seed } = req.body || {};
    if (!fileData || typeof fileData !== "string") {
      res.status(400).json({
        error: {
          code: "INVALID_ARTIFACT_PAYLOAD",
          message: "Missing or invalid 'fileData' (base64 string expected)",
        },
      });
      return;
    }

    let base64Content = fileData;
    if (fileData.startsWith("data:")) {
      base64Content = fileData.split(",")[1] || fileData;
    }

    const buffer = Buffer.from(base64Content, "base64");
    if (buffer.length === 0) {
      res.status(400).json({
        error: {
          code: "INVALID_ARTIFACT_PAYLOAD",
          message: "Decoded buffer is empty",
        },
      });
      return;
    }

    const uploadsDir = path.join(process.cwd(), "uploads", "artifacts");
    fs.mkdirSync(uploadsDir, { recursive: true });

    const safeJobId = (jobId || "job").replace(/[^a-zA-Z0-9_-]/g, "");
    const safePartId = (partId || "part").replace(/[^a-zA-Z0-9_-]/g, "");
    const cleanFileName = (fileName || `mesh_${safePartId}.glb`).replace(/[^a-zA-Z0-9._-]/g, "");

    const artifactId = `art-glb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const fileId = `${artifactId}.glb`;
    const filePath = path.join(uploadsDir, fileId);
    const metaPath = path.join(uploadsDir, `${artifactId}.json`);

    fs.writeFileSync(filePath, buffer);

    const artifactUrl = `/api/worker/artifacts/file/${artifactId}`;

    const canonicalArtifactMeta = {
      id: artifactId,
      workspaceId: req.body.workspaceId || "default-ws",
      kind: "ai_reference_mesh",
      format: "glb",
      mimeType: "model/gltf-binary",
      downloadUrl: artifactUrl,
      originalName: cleanFileName,
      bytes: buffer.length,
      productionTruth: false,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(metaPath, JSON.stringify(canonicalArtifactMeta, null, 2), "utf-8");

    const artifact = createEngineeringArtifact({
      id: artifactId,
      type: "ai_reference_mesh",
      name: `Hunyuan3D Reference Mesh (${partId || "part"})`,
      uri: artifactUrl,
      provenance: {
        provider: provider || "comfyui_hunyuan3d",
        workflowVersion: workflowVersion || "hunyuan3d-v2.1-part-v1.api.json",
        modelOrCheckpoint: modelOrCheckpoint || "hunyuan_3d_v2.1.safetensors",
        seed: typeof seed === "number" ? seed : undefined,
        createdAt: new Date().toISOString(),
      },
      productionTruth: false,
    });

    const sessionAttach = globalEngineeringSessionStore.attachMeshArtifactToSession({
      workspaceId: req.body.workspaceId || "default-workspace",
      sessionId: req.body.sessionId,
      sku: req.body.sku,
      partId: partId || "part-mesh",
      artifactId,
    });

    res.status(200).json({
      success: true,
      url: artifactUrl,
      downloadUrl: artifactUrl,
      artifactId,
      fileBytes: buffer.length,
      artifact,
      session: sessionAttach.session,
      binding: sessionAttach.binding,
      alignmentSessionId: sessionAttach.alignmentSessionId,
    });
  } catch (err: any) {
    res.status(500).json({
      error: {
        code: "GLB_UPLOAD_FAILED",
        message: err?.message || String(err),
      },
    });
  }
});
