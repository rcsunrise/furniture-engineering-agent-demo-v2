import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { globalGcsClient } from "../storage/gcsClient.js";
import { globalSignedUrlService } from "../storage/signedUrlService.js";
import { globalUploadSessionService } from "../storage/uploadSessionService.js";
import { globalEngineeringArtifactStorage } from "../storage/engineeringArtifactStorage.js";
import type {
  CreateUploadSessionRequest,
  EngineeringArtifact,
  StorageConfigResponse,
} from "../../shared/engineeringArtifact.js";

export const engineeringStorageRouter = Router();

function classifyStorageError(err: any, fallbackCode: string): { code: string; message: string } {
  const msg = (err?.message || "").toLowerCase();
  const code = err?.code || err?.status;
  if (code === 401 || msg.includes("unauthenticated") || msg.includes("credentials") || msg.includes("oauth") || msg.includes("auth")) {
    return { code: "AUTH_ERROR", message: err.message };
  }
  if (code === 403 || msg.includes("permission denied") || msg.includes("forbidden") || msg.includes("iam") || msg.includes("access denied")) {
    return { code: "BUCKET_PERMISSION_DENIED", message: err.message };
  }
  if (code === 404 || msg.includes("not found") || msg.includes("bucket does not exist") || msg.includes("no such object")) {
    return { code: "BUCKET_NOT_FOUND", message: err.message };
  }
  if (msg.includes("sign") || fallbackCode === "SIGNED_URL_ERROR") {
    return { code: "SIGNED_URL_ERROR", message: err.message };
  }
  return { code: fallbackCode, message: err.message || "Storage operation failed" };
}

// 1. Health & Config endpoint
engineeringStorageRouter.get("/config", async (_req: Request, res: Response) => {
  try {
    const config = globalGcsClient.getConfig();
    const isGcs = globalGcsClient.isEnabled();
    const bucketsCheck = isGcs
      ? await globalGcsClient.verifyBuckets()
      : {
          assetBucket: false,
          tempBucket: false,
          error: "Operating in local filesystem fallback mode (GCS_ENABLED=false)",
        };
    const backendServiceIdentity = await globalGcsClient.getServiceIdentity();
    const isBlocked = isGcs && (!bucketsCheck.assetBucket || !bucketsCheck.tempBucket);
    const provider: "gcs" | "local_fallback" = isGcs ? "gcs" : "local_fallback";
    const fallbackMode = !isGcs || isBlocked;

    const responseData: StorageConfigResponse = {
      success: true,
      gcsEnabled: isGcs && !isBlocked,
      provider,
      fallbackMode,
      backendServiceIdentity,
      config: {
        projectId: config.projectId,
        assetBucket: config.assetBucket,
        tempBucket: config.tempBucket,
        signedUrlTtlSeconds: config.signedUrlTtlSeconds,
        uploadMode: config.uploadMode,
      },
      bucketsCheck: {
        assetBucket: Boolean(bucketsCheck.assetBucket),
        tempBucket: Boolean(bucketsCheck.tempBucket),
        error: bucketsCheck.error,
        errorCode: bucketsCheck.errorCode,
      },
    };

    res.json(responseData);
  } catch (err: any) {
    const classified = classifyStorageError(err, "STORAGE_ERROR");
    res.status(500).json({ success: false, error: classified.message, errorCode: classified.code });
  }
});

// 2. Create Upload Session
engineeringStorageRouter.post(
  "/upload-session",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectId,
        skuCode,
        componentId,
        kind,
        fileName,
        mimeType,
        sizeBytes,
        sourceArtifactId,
        revision,
        provider,
        coordinateSystem,
        metadata,
        isTemp,
      } = req.body as CreateUploadSessionRequest;

      if (!projectId || !kind || !fileName || sizeBytes === undefined) {
        res.status(400).json({
          error: {
            code: "INVALID_ARGUMENTS",
            message: "projectId, kind, fileName, and sizeBytes are required",
          },
        });
        return;
      }

      const session = await globalUploadSessionService.createSession(
        {
          projectId,
          skuCode,
          componentId,
          kind,
          fileName,
          mimeType,
          sizeBytes,
          sourceArtifactId,
          revision,
          provider,
          coordinateSystem,
          metadata,
          isTemp,
        },
        req.headers.origin
      );

      const ext = path.extname(fileName).replace(/^\./, "").toLowerCase() || "bin";
      const now = new Date().toISOString();

      // Register initial artifact entry
      const tentativeArtifact: EngineeringArtifact = {
        id: session.artifactId,
        projectId,
        skuCode,
        componentId,
        kind,
        provider: provider || "manual_upload",
        format: ext,
        mimeType: mimeType || "application/octet-stream",
        sizeBytes,
        storage: {
          provider: session.storageProvider,
          bucket: session.bucket,
          objectPath: session.objectPath,
        },
        sourceArtifactId,
        revision: revision || 1,
        coordinateSystem: coordinateSystem || { unit: "mm", upAxis: "Y" },
        productionTruth: false,
        metadata: metadata || {},
        createdAt: now,
        updatedAt: now,
      };

      await globalEngineeringArtifactStorage.saveArtifact(tentativeArtifact);

      res.status(201).json(session);
    } catch (err: any) {
      console.error("[StorageRoutes] Create upload session error:", err);
      const classified = classifyStorageError(err, "UPLOAD_ERROR");
      res.status(500).json({ error: classified });
    }
  }
);

// 3. Complete Upload Confirmation
engineeringStorageRouter.post(
  "/assets/:artifactId/complete",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const artifactId = req.params.artifactId as string;
      const { actualSize, actualMimeType } = req.body || {};

      const result = await globalEngineeringArtifactStorage.completeUpload(artifactId, {
        actualSize: actualSize ? Number(actualSize) : undefined,
        actualMimeType,
      });

      if (!result.success || !result.artifact) {
        res.status(400).json({
          error: {
            code: "COMPLETE_ERROR",
            message: result.error || "Failed to verify asset in storage",
          },
        });
        return;
      }

      res.json({
        success: true,
        artifact: result.artifact,
        artifactId: result.artifact.id,
        storageProvider: result.artifact.storage.provider,
        uploadStorageProvider: result.artifact.storage.provider,
        bucket: result.artifact.storage.bucket,
        objectPath: result.artifact.storage.objectPath,
      });
    } catch (err: any) {
      console.error("[StorageRoutes] Complete upload error:", err);
      const classified = classifyStorageError(err, "COMPLETE_ERROR");
      res.status(500).json({ error: classified });
    }
  }
);

// Diagnostic: Probe GCS Signing & Bucket Permissions
engineeringStorageRouter.get(
  "/debug/signing",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const gcsEnabled = globalGcsClient.isEnabled();
      const storage = globalGcsClient.getStorage();
      const config = globalGcsClient.getConfig();
      const identity = await globalGcsClient.getRuntimeAndSigningIdentity();

      if (!gcsEnabled || !storage) {
        res.json({
          success: false,
          provider: "gcs",
          projectId: config.projectId,
          bucket: config.assetBucket,
          runtimeIdentity: identity.runtimeIdentity,
          canAccessBucket: false,
          canSignBlob: false,
          errorCode: "GCS_DISABLED",
          errorMessage: "GCS client is not enabled (operating in local fallback mode)",
        });
        return;
      }

      let canAccessBucket = false;
      let canSignBlob = false;
      let errorCode: string | undefined;
      let errorMessage: string | undefined;

      // Probe A: GCS bucket / object access
      try {
        const [exists] = await storage.bucket(config.assetBucket).exists();
        canAccessBucket = Boolean(exists);
      } catch (bucketErr: any) {
        canAccessBucket = false;
        errorCode = bucketErr.code || "BUCKET_ACCESS_DENIED";
        errorMessage = `[GCS Object Access Error] ${bucketErr.message}`;
      }

      // Probe B: Service Account signing / iam.serviceAccounts.signBlob
      try {
        const probeFile = storage.bucket(config.assetBucket).file("diagnostics/signing-probe.tmp");
        await probeFile.getSignedUrl({
          version: "v4",
          action: "read",
          expires: Date.now() + 60 * 1000,
        });
        canSignBlob = true;
      } catch (signErr: any) {
        canSignBlob = false;
        const signMsg = `[Service Account Signing Error] ${signErr.message}`;
        errorCode = errorCode || signErr.name || "SIGNING_FAILED";
        errorMessage = errorMessage ? `${errorMessage} | ${signMsg}` : signMsg;
      }

      const success = canAccessBucket && canSignBlob;

      res.json({
        success,
        provider: "gcs",
        projectId: config.projectId,
        bucket: config.assetBucket,
        runtimeIdentity: identity.runtimeIdentity,
        canAccessBucket,
        canSignBlob,
        ...(errorCode ? { errorCode } : {}),
        ...(errorMessage ? { errorMessage } : {}),
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        provider: "gcs",
        projectId: globalGcsClient.getConfig().projectId,
        bucket: globalGcsClient.getConfig().assetBucket,
        runtimeIdentity: "unknown",
        canAccessBucket: false,
        canSignBlob: false,
        errorCode: "INTERNAL_ERROR",
        errorMessage: err.message,
      });
    }
  }
);

// 4. Access Asset (Get short-lived Signed URL)
engineeringStorageRouter.get(
  "/assets/:artifactId/access",
  async (req: Request, res: Response): Promise<void> => {
    const artifactId = req.params.artifactId as string;
    try {
      const artifact = await globalEngineeringArtifactStorage.getArtifact(artifactId);

      if (!artifact) {
        res.status(404).json({
          success: false,
          error: {
            code: "ARTIFACT_NOT_FOUND",
            message: `Artifact "${artifactId}" does not exist`,
          },
        });
        return;
      }

      // If artifact was stored in GCS, MUST generate real GCS Signed URL.
      // Absolutely forbidden to silently fall back to local proxy!
      const isGcsArtifact =
        artifact.storage.provider === "gcs" ||
        (globalGcsClient.isEnabled() && artifact.storage.provider !== "local_fallback");

      if (isGcsArtifact) {
        try {
          const signed = await globalSignedUrlService.generateGcsSignedUrl({
            bucketName: artifact.storage.bucket,
            objectPath: artifact.storage.objectPath,
            action: "read",
            ttlSeconds: globalGcsClient.getSignedUrlTtlSeconds(),
          });

          res.json({
            success: true,
            artifactId: artifact.id,
            url: signed.url,
            expiresAt: signed.expiresAt,
            storageProvider: "gcs",
            signedUrlProvider: "gcs",
          });
          return;
        } catch (error: any) {
          const identity = await globalGcsClient.getRuntimeAndSigningIdentity();

          // Differentiate between A: GCS object access vs B: Service Account signing (iam.serviceAccounts.signBlob)
          const errMsg = (error?.message || "").toLowerCase();
          const errName = (error?.name || "").toLowerCase();
          const errStack = (error?.stack || "").toLowerCase();
          const isSignBlobIssue =
            errMsg.includes("signblob") ||
            errMsg.includes("signing") ||
            errName.includes("signingerror") ||
            errMsg.includes("serviceaccounttokencreator") ||
            errStack.includes("signblob");

          console.error("[GCS_SIGNED_URL_ERROR]", {
            artifactId,
            provider: "gcs",
            bucket: artifact.storage.bucket,
            objectPath: artifact.storage.objectPath,
            projectId: identity.projectId,
            runtimeIdentity: identity.runtimeIdentity,
            signingIdentity: identity.signingIdentity,
            errorName: error.name || "Error",
            errorMessage: error.message || String(error),
            errorCode: error.code || error.status || "SIGNING_FAILED",
            errorStatus: error.status || (typeof error.code === "number" ? error.code : 502),
            errorStack: error.stack || "",
          });

          console.error("[GCS_PERMISSION_DIAGNOSIS]", {
            permissionIssueType: isSignBlobIssue
              ? "SERVICE_ACCOUNT_SIGNING_BLOB"
              : "GCS_OBJECT_ACCESS",
            explanation: isSignBlobIssue
              ? "Failure occurs at IAM signBlob stage. The runtime identity lacks 'roles/iam.serviceAccountTokenCreator' (permission: iam.serviceAccounts.signBlob) on the target service account."
              : "Failure occurs at Google Cloud Storage object/bucket access level.",
          });

          res.status(502).json({
            success: false,
            code: "GCS_SIGNED_URL_ERROR",
            provider: "gcs",
            fallbackUsed: false,
            message: "Failed to generate GCS signed URL: " + (error?.message || String(error)),
            permissionIssueType: isSignBlobIssue
              ? "SERVICE_ACCOUNT_SIGNING_BLOB"
              : "GCS_OBJECT_ACCESS",
          });
          return;
        }
      }

      // Local fallback artifact path
      const signed = globalSignedUrlService.generateLocalSignedUrl({
        bucketName: artifact.storage.bucket,
        objectPath: artifact.storage.objectPath,
        action: "read",
      });

      res.json({
        success: true,
        artifactId: artifact.id,
        url: signed.url,
        expiresAt: signed.expiresAt,
        storageProvider: "local_fallback",
        signedUrlProvider: "local_fallback",
      });
    } catch (err: any) {
      console.error("[StorageRoutes] Get access url error:", err);
      const classified = classifyStorageError(err, "SIGNED_URL_ERROR");
      res.status(500).json({ error: classified });
    }
  }
);

// 5. Query / List Engineering Artifacts
engineeringStorageRouter.get(
  "/assets",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, skuCode, componentId, kind, sourceArtifactId } = req.query;

      const assets = await globalEngineeringArtifactStorage.listArtifacts({
        projectId: projectId as string | undefined,
        skuCode: skuCode as string | undefined,
        componentId: componentId as string | undefined,
        kind: kind as any,
        sourceArtifactId: sourceArtifactId as string | undefined,
      });

      res.json({
        success: true,
        count: assets.length,
        assets,
      });
    } catch (err: any) {
      console.error("[StorageRoutes] List assets error:", err);
      res.status(500).json({ error: { code: "LIST_ERROR", message: err.message } });
    }
  }
);

// 6. Delete Asset (with Reference Integrity Check)
engineeringStorageRouter.delete(
  "/assets/:artifactId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const artifactId = req.params.artifactId as string;

      const result = await globalEngineeringArtifactStorage.deleteArtifact(artifactId);

      if (!result.success) {
        if (result.code === "NOT_FOUND") {
          res.status(404).json({ error: { code: "NOT_FOUND", message: result.error } });
          return;
        }
        if (result.code === "ARTIFACT_IN_USE") {
          res.status(409).json({
            error: {
              code: "ARTIFACT_IN_USE",
              message: result.error,
              details: result.details,
            },
          });
          return;
        }
        res.status(400).json({ error: { code: "DELETE_FAILED", message: result.error } });
        return;
      }

      res.json({ success: true, message: `Artifact ${artifactId} deleted successfully` });
    } catch (err: any) {
      console.error("[StorageRoutes] Delete asset error:", err);
      res.status(500).json({ error: { code: "DELETE_ERROR", message: err.message } });
    }
  }
);

// 7. Fallback: Stream upload directly to server disk without buffering 50MB+ in memory
engineeringStorageRouter.put(
  "/local-upload-session/:token",
  (req: Request, res: Response): void => {
    const token = req.params.token as string;
    const verified = globalSignedUrlService.verifyLocalToken(token, "write");

    if (!verified) {
      res.status(403).json({
        error: { code: "INVALID_TOKEN", message: "Upload token is invalid or expired" },
      });
      return;
    }

    const targetPath = globalUploadSessionService.getLocalTargetFilePath(
      verified.bucket,
      verified.objectPath
    );

    const writeStream = fs.createWriteStream(targetPath);

    req.pipe(writeStream);

    writeStream.on("finish", () => {
      res.json({ success: true, bytesWritten: writeStream.bytesWritten });
    });

    writeStream.on("error", (err) => {
      console.error("[StorageRoutes] Local stream upload error:", err);
      res.status(500).json({ error: { code: "STREAM_WRITE_FAILED", message: err.message } });
    });
  }
);

// 8. Fallback: Stream file download with token validation & range support
engineeringStorageRouter.get(
  "/local-access/:token",
  (req: Request, res: Response): void => {
    const token = req.params.token as string;
    const verified = globalSignedUrlService.verifyLocalToken(token, "read");

    if (!verified) {
      res.status(403).json({
        error: { code: "INVALID_TOKEN", message: "Signed access token is invalid or expired" },
      });
      return;
    }

    const targetPath = globalUploadSessionService.getLocalTargetFilePath(
      verified.bucket,
      verified.objectPath
    );

    if (!fs.existsSync(targetPath)) {
      res.status(404).json({
        error: { code: "FILE_NOT_FOUND", message: "File does not exist in local storage" },
      });
      return;
    }

    const stat = fs.statSync(targetPath);
    const range = req.headers.range;

    let mimeType = "application/octet-stream";
    const ext = path.extname(targetPath).toLowerCase();
    if (ext === ".glb") mimeType = "model/gltf-binary";
    else if (ext === ".gltf") mimeType = "model/gltf+json";
    else if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
    else if (ext === ".png") mimeType = "image/png";
    else if (ext === ".json") mimeType = "application/json";
    else if (ext === ".pdf") mimeType = "application/pdf";

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = end - start + 1;

      const file = fs.createReadStream(targetPath, { start, end });
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": mimeType,
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": stat.size,
        "Content-Type": mimeType,
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(targetPath).pipe(res);
    }
  }
);
