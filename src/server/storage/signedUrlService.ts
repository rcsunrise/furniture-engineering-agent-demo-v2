import crypto from "crypto";
import { globalGcsClient } from "./gcsClient.js";

const LOCAL_SIGNING_SECRET =
  process.env.STORAGE_SIGNING_SECRET ||
  process.env.GEMINI_API_KEY ||
  "fes-storage-internal-secret-2026";

export interface SignedUrlResult {
  url: string;
  expiresAt: string;
  storageProvider: "gcs" | "local_fallback";
}

export class SignedUrlService {
  /**
   * Generates a short-lived v4 signed URL directly on Google Cloud Storage.
   * Throws on failure and does NOT silently fall back to local proxy.
   */
  public async generateGcsSignedUrl(params: {
    bucketName: string;
    objectPath: string;
    action?: "read" | "write";
    ttlSeconds?: number;
    contentType?: string;
  }): Promise<SignedUrlResult> {
    if (!globalGcsClient.isEnabled()) {
      throw new Error("GCS client is not enabled or storage client is uninitialized");
    }
    const storage = globalGcsClient.getStorage();
    if (!storage) {
      throw new Error("GCS Storage client instance is null");
    }

    const ttl = params.ttlSeconds || globalGcsClient.getSignedUrlTtlSeconds();
    const expiresTimestamp = Date.now() + ttl * 1000;
    const expiresAt = new Date(expiresTimestamp).toISOString();

    const file = storage.bucket(params.bucketName).file(params.objectPath);
    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: params.action || "read",
      expires: expiresTimestamp,
      ...(params.contentType ? { contentType: params.contentType } : {}),
    });

    return {
      url: signedUrl,
      expiresAt,
      storageProvider: "gcs",
    };
  }

  /**
   * Generates an HMAC-SHA256 authenticated tokenized local proxy URL for local fallback storage.
   */
  public generateLocalSignedUrl(params: {
    bucketName: string;
    objectPath: string;
    action?: "read" | "write";
    ttlSeconds?: number;
    contentType?: string;
  }): SignedUrlResult {
    const ttl = params.ttlSeconds || globalGcsClient.getSignedUrlTtlSeconds();
    const expiresTimestamp = Date.now() + ttl * 1000;
    const expiresAt = new Date(expiresTimestamp).toISOString();
    const action = params.action || "read";

    const payloadObj: any = {
      b: params.bucketName,
      p: params.objectPath,
      a: action,
      exp: expiresTimestamp,
    };
    if (params.contentType) {
      payloadObj.c = params.contentType;
    }

    const payload = JSON.stringify(payloadObj);
    const hmac = crypto
      .createHmac("sha256", LOCAL_SIGNING_SECRET)
      .update(payload)
      .digest("hex");
    const token = Buffer.from(JSON.stringify({ payload, hmac })).toString("base64url");

    const endpoint =
      action === "write"
        ? `/api/engineering/storage/local-upload-session/${token}`
        : `/api/engineering/storage/local-access/${token}`;

    return {
      url: endpoint,
      expiresAt,
      storageProvider: "local_fallback",
    };
  }

  /**
   * Generates a short-lived signed URL for reading a binary engineering artifact.
   * If provider === "gcs" or noFallback is true, strictly uses GCS and will throw if signing fails.
   */
  public async getSignedDownloadUrl(
    bucketName: string,
    objectPath: string,
    customTtlSeconds?: number,
    options?: { provider?: "gcs" | "local_fallback"; noFallback?: boolean }
  ): Promise<SignedUrlResult> {
    const isGcs =
      options?.provider === "gcs" ||
      (options?.provider !== "local_fallback" && globalGcsClient.isEnabled());

    if (isGcs) {
      if (options?.provider === "gcs" || options?.noFallback) {
        // Strict GCS mode: NEVER fall back to local!
        return this.generateGcsSignedUrl({
          bucketName,
          objectPath,
          action: "read",
          ttlSeconds: customTtlSeconds,
        });
      }

      // Soft GCS attempt for untyped callers
      try {
        return await this.generateGcsSignedUrl({
          bucketName,
          objectPath,
          action: "read",
          ttlSeconds: customTtlSeconds,
        });
      } catch (err: any) {
        console.warn("[SignedUrl] Soft GCS signing attempt failed, using local token:", err.message);
      }
    }

    return this.generateLocalSignedUrl({
      bucketName,
      objectPath,
      action: "read",
      ttlSeconds: customTtlSeconds,
    });
  }

  /**
   * Generates a signed upload URL (for single PUT upload) or local upload proxy token
   */
  public async getSignedUploadUrl(
    bucketName: string,
    objectPath: string,
    contentType = "application/octet-stream",
    customTtlSeconds?: number
  ): Promise<SignedUrlResult> {
    const ttlSeconds = customTtlSeconds || globalGcsClient.getSignedUrlTtlSeconds();
    const expiresTimestamp = Date.now() + ttlSeconds * 1000;
    const expiresAt = new Date(expiresTimestamp).toISOString();

    if (globalGcsClient.isEnabled()) {
      const storage = globalGcsClient.getStorage();
      if (storage) {
        try {
          const file = storage.bucket(bucketName).file(objectPath);
          const [signedUrl] = await file.getSignedUrl({
            version: "v4",
            action: "write",
            contentType,
            expires: expiresTimestamp,
          });

          return {
            url: signedUrl,
            expiresAt,
            storageProvider: "gcs",
          };
        } catch (err: any) {
          console.warn("[SignedUrl] GCS upload signing failed, falling back to local upload URL:", err.message);
        }
      }
    }

    // Local fallback
    const payload = JSON.stringify({
      b: bucketName,
      p: objectPath,
      a: "write",
      c: contentType,
      exp: expiresTimestamp,
    });
    const hmac = crypto
      .createHmac("sha256", LOCAL_SIGNING_SECRET)
      .update(payload)
      .digest("hex");
    const token = Buffer.from(JSON.stringify({ payload, hmac })).toString("base64url");

    return {
      url: `/api/engineering/storage/local-upload-session/${token}`,
      expiresAt,
      storageProvider: "local_fallback",
    };
  }

  /**
   * Verifies local token and extracts bucket & objectPath
   */
  public verifyLocalToken(
    token: string,
    requiredAction: "read" | "write"
  ): { bucket: string; objectPath: string; contentType?: string } | null {
    try {
      const raw = Buffer.from(token, "base64url").toString("utf-8");
      const { payload, hmac } = JSON.parse(raw);

      const expectedHmac = crypto
        .createHmac("sha256", LOCAL_SIGNING_SECRET)
        .update(payload)
        .digest("hex");

      if (hmac !== expectedHmac) {
        console.warn("[SignedUrl] Invalid HMAC signature on local token");
        return null;
      }

      const data = JSON.parse(payload);
      if (data.exp < Date.now()) {
        console.warn("[SignedUrl] Local signed token has expired");
        return null;
      }

      if (data.a !== requiredAction) {
        console.warn(`[SignedUrl] Action mismatch. Expected ${requiredAction}, got ${data.a}`);
        return null;
      }

      return {
        bucket: data.b,
        objectPath: data.p,
        contentType: data.c,
      };
    } catch (err: any) {
      console.warn("[SignedUrl] Failed to verify local token:", err.message);
      return null;
    }
  }
}

export const globalSignedUrlService = new SignedUrlService();
