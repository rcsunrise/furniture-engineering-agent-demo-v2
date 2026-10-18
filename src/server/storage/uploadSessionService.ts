import crypto from "crypto";
import path from "path";
import fs from "fs";
import { globalGcsClient } from "./gcsClient.js";
import { globalSignedUrlService } from "./signedUrlService.js";
import {
  type CreateUploadSessionRequest,
  type CreateUploadSessionResponse,
  buildCanonicalGcsObjectPath,
} from "../../shared/engineeringArtifact.js";

const RESUMABLE_THRESHOLD_BYTES = 20 * 1024 * 1024; // 20MB threshold as specified in Section 13

export class UploadSessionService {
  /**
   * Creates an upload session for a binary engineering artifact.
   * Large files (>=20MB) default to resumable upload.
   */
  public async createSession(
    req: CreateUploadSessionRequest,
    origin?: string
  ): Promise<CreateUploadSessionResponse> {
    const artifactId = `art_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const bucket = req.isTemp
      ? globalGcsClient.getTempBucketName()
      : globalGcsClient.getAssetBucketName();

    const objectPath = buildCanonicalGcsObjectPath({
      projectId: req.projectId,
      skuCode: req.skuCode,
      kind: req.kind,
      fileName: req.fileName,
      revision: req.revision,
    });

    const configMode = globalGcsClient.getUploadMode();
    const preferResumable =
      configMode === "resumable" ||
      (configMode === "auto" && req.sizeBytes >= RESUMABLE_THRESHOLD_BYTES);
    const mimeType = req.mimeType || "application/octet-stream";

    // 1. If GCS is enabled, attempt GCS native upload session
    if (globalGcsClient.isEnabled()) {
      const storage = globalGcsClient.getStorage();
      if (storage) {
        try {
          const file = storage.bucket(bucket).file(objectPath);

          if (preferResumable) {
            // Create Google Cloud Storage Resumable Upload Session
            const [sessionUri] = await file.createResumableUpload({
              origin: origin || "*",
              metadata: {
                contentType: mimeType,
                metadata: {
                  artifactId,
                  projectId: req.projectId,
                  skuCode: req.skuCode || "",
                  kind: req.kind,
                  componentId: req.componentId || "",
                  productionTruth: "false",
                },
              },
            });

            const ttl = globalGcsClient.getSignedUrlTtlSeconds();
            return {
              artifactId,
              uploadMode: "resumable",
              sessionUrl: sessionUri,
              objectPath,
              bucket,
              expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
              storageProvider: "gcs",
            };
          } else {
            // Single PUT Signed URL
            const signed = await globalSignedUrlService.getSignedUploadUrl(
              bucket,
              objectPath,
              mimeType
            );
            return {
              artifactId,
              uploadMode: "single",
              sessionUrl: signed.url,
              objectPath,
              bucket,
              expiresAt: signed.expiresAt,
              storageProvider: signed.storageProvider,
            };
          }
        } catch (err: any) {
          console.warn("[UploadSession] GCS session creation failed, using local fallback:", err.message);
        }
      }
    }

    // 2. Local fallback upload session
    const signed = await globalSignedUrlService.getSignedUploadUrl(
      bucket,
      objectPath,
      mimeType
    );

    return {
      artifactId,
      uploadMode: preferResumable ? "resumable" : "single",
      sessionUrl: signed.url,
      objectPath,
      bucket,
      expiresAt: signed.expiresAt,
      storageProvider: "local_fallback",
    };
  }

  /**
   * Helper to ensure local fallback target directory exists
   */
  public getLocalTargetFilePath(bucket: string, objectPath: string): string {
    const rootDir = path.resolve(process.cwd(), "uploads", "storage", bucket);
    const target = path.join(rootDir, objectPath);
    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return target;
  }
}

export const globalUploadSessionService = new UploadSessionService();
