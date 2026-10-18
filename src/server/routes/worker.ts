import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { globalWorkerService } from "../worker/workerService.js";
import { CreateWorkerJobRequestSchema, WorkerJobStatusSchema } from "../../shared/worker.js";
import { createEngineeringArtifact } from "../../shared/artifact.js";
import { IllegalWorkerStateTransitionError } from "../worker/workerStateMachine.js";
import { WorkspaceMismatchError, JobNotFoundError } from "../worker/workerJobStore.js";
import { getSanitizedWorkerStatus } from "../worker/workerStatus.js";
import { workerAuthMiddleware } from "../worker/workerAuth.js";
import { rateLimiterMiddleware } from "../limiter/parseLimiter.js";

export const workerRouter = Router();

const artifactUpload = multer({
  limits: { fileSize: 250 * 1024 * 1024 }, // 250MB
  storage: multer.memoryStorage(),
});

const workerStatusLimiter = rateLimiterMiddleware({
  bucketName: "worker_status",
  windowMs: 60000,
  maxRequests: 120,
  code: "WORKER_STATUS_RATE_LIMITED",
  message: "Worker status polling rate limited",
});

const workerArtifactsLimiter = rateLimiterMiddleware({
  bucketName: "worker_artifacts",
  windowMs: 60000,
  maxRequests: 60,
  code: "WORKER_ARTIFACTS_RATE_LIMITED",
  message: "Worker artifacts upload rate limited",
});

// GET /api/worker/status - Return sanitized runtime status information
workerRouter.get("/status", workerStatusLimiter, (_req: Request, res: Response) => {
  try {
    const statusData = getSanitizedWorkerStatus();
    res.json({
      success: true,
      data: statusData,
    });
  } catch (err: any) {
    res.status(500).json({
      error: {
        code: "WORKER_STATUS_FAILED",
        message: err?.message || "Failed to fetch worker status",
      },
    });
  }
});

// 1. POST /api/worker/jobs - Submit a compute job
workerRouter.post("/jobs", (req: Request, res: Response) => {
  const parseResult = CreateWorkerJobRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "Failed to parse CreateWorkerJobRequest",
        details: parseResult.error.format(),
      },
    });
    return;
  }

  try {
    const job = globalWorkerService.createJob(parseResult.data);
    res.status(201).json({
      success: true,
      data: job,
    });
  } catch (err: any) {
    res.status(500).json({
      error: {
        code: err?.code || "JOB_CREATION_FAILED",
        message: err?.message || "Failed to create worker job",
      },
    });
  }
});

// 2. GET /api/worker/jobs/:jobId - Fetch single job detail
workerRouter.get("/jobs/:jobId", (req: Request, res: Response) => {
  const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const workspaceId = req.query.workspaceId as string | undefined;

  try {
    const job = globalWorkerService.getJob(jobId, workspaceId);
    if (!job) {
      res.status(404).json({
        error: {
          code: "JOB_NOT_FOUND",
          message: `Worker job '${jobId}' not found`,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: job,
    });
  } catch (err: any) {
    if (err instanceof WorkspaceMismatchError) {
      res.status(403).json({
        error: {
          code: err.code,
          message: err.message,
        },
      });
      return;
    }
    res.status(500).json({
      error: {
        code: err?.code || "SERVER_ERROR",
        message: err?.message || String(err),
      },
    });
  }
});

// 3. GET /api/worker/jobs - List jobs with optional status/workspace filter
workerRouter.get("/jobs", (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string | undefined;
  const statusParam = req.query.status as string | undefined;

  let status: any = undefined;
  if (statusParam) {
    const parsedStatus = WorkerJobStatusSchema.safeParse(statusParam);
    if (!parsedStatus.success) {
      res.status(400).json({
        error: {
          code: "INVALID_STATUS_FILTER",
          message: `Invalid status filter '${statusParam}'`,
        },
      });
      return;
    }
    status = parsedStatus.data;
  }

  const jobs = globalWorkerService.listJobs({ workspaceId, status });
  res.json({
    success: true,
    data: jobs,
  });
});

// 4. POST /api/worker/jobs/:jobId/cancel - Cancel a queued, claimed, or running job
workerRouter.post("/jobs/:jobId/cancel", (req: Request, res: Response) => {
  const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const workspaceId = (req.body?.workspaceId || req.query.workspaceId) as string | undefined;
  const reason = (req.body?.reason || req.query.reason) as string | undefined;

  try {
    const job = globalWorkerService.cancelJob(jobId, workspaceId, reason);
    res.json({
      success: true,
      data: job,
    });
  } catch (err: any) {
    if (err instanceof JobNotFoundError) {
      res.status(404).json({
        error: {
          code: err.code,
          message: err.message,
        },
      });
      return;
    }
    if (err instanceof WorkspaceMismatchError) {
      res.status(403).json({
        error: {
          code: err.code,
          message: err.message,
        },
      });
      return;
    }
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
        code: err?.code || "CANCEL_FAILED",
        message: err?.message || String(err),
      },
    });
  }
});

// Helper GET /api/worker/capabilities
workerRouter.get("/capabilities", (_req: Request, res: Response) => {
  const capabilities = globalWorkerService.getSupportedCapabilities();
  res.json({
    success: true,
    data: capabilities,
  });
});

function detectImageFormat(
  buffer: Buffer,
  originalName?: string
): { format: "png" | "jpg" | "jpeg" | "webp"; mimeType: "image/png" | "image/jpeg" | "image/webp" } {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { format: "png", mimeType: "image/png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    const ext = originalName?.toLowerCase().endsWith(".jpg") ? "jpg" : "jpeg";
    return { format: ext, mimeType: "image/jpeg" };
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { format: "webp", mimeType: "image/webp" };
  }

  const ext = originalName?.toLowerCase().split(".").pop();
  if (ext === "jpg") return { format: "jpg", mimeType: "image/jpeg" };
  if (ext === "jpeg") return { format: "jpeg", mimeType: "image/jpeg" };
  if (ext === "webp") return { format: "webp", mimeType: "image/webp" };
  return { format: "png", mimeType: "image/png" };
}

// GET /api/worker/artifacts/file/:artifactId - Serve raw binary artifact (image/GLB)
// GET /api/worker/artifacts/:artifactId/download - Download endpoint alias
const serveArtifactFileHandler = (req: Request, res: Response) => {
  try {
    const artifactId = Array.isArray(req.params.artifactId) ? req.params.artifactId[0] : req.params.artifactId;
    const workspaceId = req.query.workspaceId as string | undefined;

    // Sanitize artifactId to prevent path traversal
    const safeArtifactId = artifactId.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeArtifactId) {
      res.status(400).json({
        error: {
          code: "INVALID_ARTIFACT_ID",
          message: "Artifact ID contains invalid characters",
        },
      });
      return;
    }

    const uploadsDir = path.join(process.cwd(), "uploads", "artifacts");
    const rawFilePath = path.join(uploadsDir, `${safeArtifactId}.raw`);
    const glbFilePath = path.join(uploadsDir, `${safeArtifactId}.glb`);
    const metaFilePath = path.join(uploadsDir, `${safeArtifactId}.json`);

    let targetFile = fs.existsSync(glbFilePath) ? glbFilePath : rawFilePath;
    let meta: any = null;

    if (fs.existsSync(metaFilePath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaFilePath, "utf-8"));
      } catch (e) {
        // ignore parse error
      }
    }

    // Workspace isolation check if metadata exists
    if (meta?.workspaceId && workspaceId && meta.workspaceId !== workspaceId) {
      res.status(403).json({
        error: {
          code: "WORKSPACE_MISMATCH",
          message: `Artifact does not belong to workspace '${workspaceId}'`,
        },
      });
      return;
    }

    // Fallback search in directory if exact filename is not found directly
    if (!fs.existsSync(targetFile)) {
      const files = fs.readdirSync(uploadsDir);
      const match = files.find(
        (f) => !f.endsWith(".json") && (f.startsWith(safeArtifactId) || f.includes(safeArtifactId))
      );
      if (match) {
        targetFile = path.join(uploadsDir, match);
      } else {
        res.status(404).json({
          error: {
            code: "ARTIFACT_NOT_FOUND",
            message: `Artifact '${artifactId}' not found`,
          },
        });
        return;
      }
    }

    const buffer = fs.readFileSync(targetFile);

    let mimeType = meta?.mimeType;
    if (!mimeType && buffer.length >= 4) {
      if (
        (buffer[0] === 0x47 && buffer[1] === 0x6c && buffer[2] === 0x54 && buffer[3] === 0x46) ||
        targetFile.toLowerCase().endsWith(".glb")
      ) {
        mimeType = "model/gltf-binary";
      } else {
        const detected = detectImageFormat(buffer, meta?.originalName || targetFile);
        mimeType = detected.mimeType;
      }
    }
    if (!mimeType) {
      mimeType = "application/octet-stream";
    }

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(buffer);
  } catch (err: any) {
    res.status(500).json({
      error: {
        code: "ARTIFACT_FETCH_FAILED",
        message: err?.message || String(err),
      },
    });
  }
};

workerRouter.get("/artifacts/file/:artifactId", serveArtifactFileHandler);
workerRouter.get("/artifacts/:artifactId/download", serveArtifactFileHandler);

function getRequestPublicOrigin(req: Request): string {
  const forwardedProto = req.get("x-forwarded-proto");
  const forwardedHost = req.get("x-forwarded-host");

  const proto = (forwardedProto ? forwardedProto.split(",")[0].trim() : req.protocol) || "http";
  const host = (forwardedHost ? forwardedHost.split(",")[0].trim() : req.get("host")) || "localhost:3000";

  return `${proto}://${host}`;
}

// POST /api/worker/artifacts/upload-image - Upload reference image from UI & return canonical artifact
workerRouter.post("/artifacts/upload-image", workerArtifactsLimiter, (req: Request, res: Response) => {
  try {
    const { fileName, fileData, workspaceId = "default-ws" } = req.body || {};
    if (!fileData || typeof fileData !== "string") {
      res.status(400).json({
        error: {
          code: "INVALID_IMAGE_PAYLOAD",
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
          code: "INVALID_IMAGE_PAYLOAD",
          message: "Decoded image buffer is empty",
        },
      });
      return;
    }

    const uploadsDir = path.join(process.cwd(), "uploads", "artifacts");
    fs.mkdirSync(uploadsDir, { recursive: true });

    const cleanFileName = (fileName || "ref_image.png").replace(/[^a-zA-Z0-9._-]/g, "");
    const detected = detectImageFormat(buffer, cleanFileName);

    const artifactId = `art-img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const rawPath = path.join(uploadsDir, `${artifactId}.raw`);
    const metaPath = path.join(uploadsDir, `${artifactId}.json`);

    fs.writeFileSync(rawPath, buffer);

    const publicOrigin = getRequestPublicOrigin(req);
    const downloadUrl = `${publicOrigin}/api/worker/artifacts/file/${artifactId}`;

    const canonicalArtifact = {
      id: artifactId,
      workspaceId,
      kind: "reference_image" as const,
      format: detected.format,
      mimeType: detected.mimeType,
      downloadUrl,
      originalName: cleanFileName,
      bytes: buffer.length,
      productionTruth: false as const,
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(metaPath, JSON.stringify(canonicalArtifact, null, 2), "utf-8");

    res.status(200).json({
      success: true,
      artifact: canonicalArtifact,
      url: downloadUrl,
      downloadUrl,
      artifactId,
      fileBytes: buffer.length,
    });
  } catch (err: any) {
    res.status(500).json({
      error: {
        code: "IMAGE_UPLOAD_FAILED",
        message: err?.message || String(err),
      },
    });
  }
});

// POST /api/worker/artifacts/upload - Upload GLB artifact from worker or browser (supports multipart & base64)
workerRouter.post(
  "/artifacts/upload",
  workerAuthMiddleware,
  artifactUpload.single("file"),
  (req: Request, res: Response) => {
    try {
      const {
        fileName: bodyFileName,
        fileData,
        jobId,
        partId,
        sku,
        provider,
        workflowVersion,
        modelOrCheckpoint,
        seed,
        artifactId: requestedArtifactId,
      } = req.body || {};

      let buffer: Buffer | null = null;
      let effectiveFileName = bodyFileName || "model.glb";

      if (req.file) {
        buffer = req.file.buffer;
        effectiveFileName = req.file.originalname || bodyFileName || "model.glb";
      } else if (fileData && typeof fileData === "string") {
        let base64Content = fileData;
        if (fileData.startsWith("data:")) {
          base64Content = fileData.split(",")[1] || fileData;
        }
        buffer = Buffer.from(base64Content, "base64");
      }

      if (!buffer || buffer.length === 0) {
        res.status(400).json({
          error: {
            code: "INVALID_ARTIFACT_PAYLOAD",
            message: "Missing or empty file buffer (multipart 'file' or base64 'fileData' required)",
          },
        });
        return;
      }

      const uploadsDir = path.join(process.cwd(), "uploads", "artifacts");
      fs.mkdirSync(uploadsDir, { recursive: true });

      const safeJobId = (jobId || "job").replace(/[^a-zA-Z0-9_-]/g, "");
      const safePartId = (partId || "part").replace(/[^a-zA-Z0-9_-]/g, "");
      const cleanFileName = effectiveFileName.replace(/[^a-zA-Z0-9._-]/g, "");

      const artifactId =
        typeof requestedArtifactId === "string" && requestedArtifactId.trim().length > 0
          ? requestedArtifactId.trim().replace(/[^a-zA-Z0-9_-]/g, "")
          : `art-glb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const fileId = `${artifactId}.glb`;
      const filePath = path.join(uploadsDir, fileId);
      const metaPath = path.join(uploadsDir, `${artifactId}.json`);

      fs.writeFileSync(filePath, buffer);

      const artifactUrl = `/api/worker/artifacts/file/${artifactId}`;

      const canonicalArtifactMeta = {
        id: artifactId,
        workspaceId: req.body?.workspaceId || "default-ws",
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

      res.status(200).json({
        success: true,
        url: artifactUrl,
        downloadUrl: artifactUrl,
        artifactId,
        fileBytes: buffer.length,
        artifact,
      });
    } catch (err: any) {
      console.error("[Worker] Artifact upload error:", err);
      res.status(500).json({
        error: {
          code: "GLB_UPLOAD_FAILED",
          message: err?.message || String(err),
        },
      });
    }
  }
);
