import { Storage } from "@google-cloud/storage";
import fs from "fs";

export interface GcsConfig {
  enabled: boolean;
  projectId: string;
  assetBucket: string;
  tempBucket: string;
  signedUrlTtlSeconds: number;
  uploadMode: "auto" | "resumable" | "single";
  credentialsPath?: string;
}

export class GcsClientService {
  private storage: Storage | null = null;
  private config: GcsConfig;
  private isInitialized = false;

  constructor() {
    const enabled = process.env.GCS_ENABLED === "true";
    const projectId = process.env.GCS_PROJECT_ID || "gen-lang-client-0557963301";
    const assetBucket =
      process.env.GCS_ASSET_BUCKET || `fes-engineering-assets-${projectId}`;
    const tempBucket =
      process.env.GCS_TEMP_BUCKET || `fes-temp-assets-${projectId}`;
    const signedUrlTtlSeconds = parseInt(
      process.env.GCS_SIGNED_URL_TTL_SECONDS || "1800",
      10
    );
    const rawMode = process.env.GCS_UPLOAD_MODE;
    const uploadMode: "auto" | "resumable" | "single" =
      rawMode === "single" ? "single" : rawMode === "resumable" ? "resumable" : "auto";
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    this.config = {
      enabled,
      projectId,
      assetBucket,
      tempBucket,
      signedUrlTtlSeconds: Number.isNaN(signedUrlTtlSeconds) ? 1800 : signedUrlTtlSeconds,
      uploadMode,
      credentialsPath,
    };

    this.initStorage();
  }

  private initStorage(): void {
    if (!this.config.enabled) {
      console.log("[GCS] GCS_ENABLED is false. Operating in local storage fallback mode.");
      this.isInitialized = false;
      return;
    }

    try {
      const options: any = {
        projectId: this.config.projectId,
      };

      if (process.env.GCS_SERVICE_ACCOUNT_KEY) {
        try {
          const raw = process.env.GCS_SERVICE_ACCOUNT_KEY.trim();
          const jsonStr = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf-8");
          const parsed = JSON.parse(jsonStr);
          options.credentials = parsed;
          console.log("[GCS] Using service account credentials from GCS_SERVICE_ACCOUNT_KEY");
        } catch (e: any) {
          console.warn("[GCS] Failed to parse GCS_SERVICE_ACCOUNT_KEY:", e.message);
        }
      } else if (this.config.credentialsPath && fs.existsSync(this.config.credentialsPath)) {
        options.keyFilename = this.config.credentialsPath;
        console.log(`[GCS] Using credentials from GOOGLE_APPLICATION_CREDENTIALS: ${this.config.credentialsPath}`);
      } else if (process.env.GCS_KEY_FILE && fs.existsSync(process.env.GCS_KEY_FILE)) {
        options.keyFilename = process.env.GCS_KEY_FILE;
        console.log(`[GCS] Using credentials from GCS_KEY_FILE: ${process.env.GCS_KEY_FILE}`);
      } else if (process.env.GCS_CLIENT_EMAIL && process.env.GCS_PRIVATE_KEY) {
        options.credentials = {
          client_email: process.env.GCS_CLIENT_EMAIL,
          private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, "\n"),
        };
        console.log(`[GCS] Using credentials for service account: ${process.env.GCS_CLIENT_EMAIL}`);
      }

      this.storage = new Storage(options);
      this.isInitialized = true;
      console.log(`[GCS] Storage client initialized for project ${this.config.projectId} (Asset: ${this.config.assetBucket}, Temp: ${this.config.tempBucket})`);
    } catch (err: any) {
      console.warn("[GCS] Failed to initialize Google Cloud Storage client, falling back to local storage:", err.message);
      this.isInitialized = false;
      this.storage = null;
    }
  }

  public isEnabled(): boolean {
    return this.config.enabled && this.isInitialized && this.storage !== null;
  }

  public getStorage(): Storage | null {
    return this.storage;
  }

  public getConfig(): GcsConfig {
    return { ...this.config };
  }

  public getAssetBucketName(): string {
    return this.config.assetBucket;
  }

  public getTempBucketName(): string {
    return this.config.tempBucket;
  }

  public getSignedUrlTtlSeconds(): number {
    return this.config.signedUrlTtlSeconds;
  }

  public getUploadMode(): "auto" | "resumable" | "single" {
    return this.config.uploadMode;
  }

  /**
   * Identifies backend GCP Service Account / credentials
   */
  public async getServiceIdentity(): Promise<string> {
    const details = await this.getRuntimeAndSigningIdentity();
    return details.runtimeIdentity;
  }

  /**
   * Discovers exact runtime & signing identity directly from Google Auth SDK
   * Never prints secret keys or tokens.
   */
  public async getRuntimeAndSigningIdentity(): Promise<{
    runtimeIdentity: string;
    signingIdentity: string;
    credentialSource: string;
    authType: string;
    projectId: string;
  }> {
    const projectId = this.config.projectId;
    if (!this.isEnabled() || !this.storage) {
      return {
        runtimeIdentity: "Local Fallback Mode (Local Filesystem - GCS_ENABLED=false)",
        signingIdentity: "local_hmac_secret",
        credentialSource: "local_filesystem",
        authType: "none",
        projectId,
      };
    }

    let runtimeEmail: string | undefined;
    let authType = "unknown";
    let credentialSource = "Application Default Credentials";

    if (process.env.GCS_SERVICE_ACCOUNT_KEY) {
      credentialSource = "Environment (GCS_SERVICE_ACCOUNT_KEY)";
    } else if (this.config.credentialsPath) {
      credentialSource = `Key File (${this.config.credentialsPath})`;
    } else if (process.env.GCS_KEY_FILE) {
      credentialSource = `Key File (${process.env.GCS_KEY_FILE})`;
    } else if (process.env.GCS_CLIENT_EMAIL) {
      credentialSource = "Environment (GCS_CLIENT_EMAIL)";
    }

    try {
      const authClient = (this.storage as any).authClient;
      if (authClient) {
        if (authClient.keyFilename) {
          credentialSource = `Key File (${authClient.keyFilename})`;
        }
        try {
          const client = await authClient.getClient();
          authType = client?.constructor?.name || typeof client;
          if (client?.email && client.email !== "default") {
            runtimeEmail = client.email;
          }
        } catch {
          // Ignore
        }
        try {
          const creds = await authClient.getCredentials();
          if (creds?.client_email) {
            runtimeEmail = creds.client_email;
          }
        } catch {
          // Ignore
        }
      }
    } catch {
      // Ignore
    }

    if (!runtimeEmail && process.env.GCS_CLIENT_EMAIL) {
      runtimeEmail = process.env.GCS_CLIENT_EMAIL;
    }

    const resolvedRuntimeIdentity =
      runtimeEmail ||
      (authType !== "unknown"
        ? `GCP Attached Service Account (${authType}, Source: ${credentialSource})`
        : `GCP Identity (Project: ${projectId}, Source: ${credentialSource})`);

    const resolvedSigningIdentity = runtimeEmail || resolvedRuntimeIdentity;

    return {
      runtimeIdentity: resolvedRuntimeIdentity,
      signingIdentity: resolvedSigningIdentity,
      credentialSource,
      authType,
      projectId,
    };
  }

  /**
   * Health check / bucket verification
   */
  public async verifyBuckets(): Promise<{
    assetBucket: boolean;
    tempBucket: boolean;
    error?: string;
    errorCode?: "AUTH_ERROR" | "BUCKET_NOT_FOUND" | "BUCKET_PERMISSION_DENIED" | "STORAGE_ERROR";
  }> {
    if (!this.isEnabled() || !this.storage) {
      return {
        assetBucket: false,
        tempBucket: false,
        error: "GCS is not enabled or credentials unavailable (Operating in local fallback mode)",
      };
    }

    try {
      const [assetExists] = await this.storage.bucket(this.config.assetBucket).exists();
      const [tempExists] = await this.storage.bucket(this.config.tempBucket).exists();
      if (!assetExists || !tempExists) {
        return {
          assetBucket: Boolean(assetExists),
          tempBucket: Boolean(tempExists),
          error: `Bucket verification failed: ${!assetExists ? `Asset bucket "${this.config.assetBucket}" not found. ` : ""}${!tempExists ? `Temp bucket "${this.config.tempBucket}" not found.` : ""}`,
          errorCode: "BUCKET_NOT_FOUND",
        };
      }
      return { assetBucket: true, tempBucket: true };
    } catch (err: any) {
      let errorCode: "AUTH_ERROR" | "BUCKET_NOT_FOUND" | "BUCKET_PERMISSION_DENIED" | "STORAGE_ERROR" = "STORAGE_ERROR";
      const msg = (err.message || "").toLowerCase();
      const code = err.code || err.status;
      if (code === 401 || msg.includes("unauthenticated") || msg.includes("credentials") || msg.includes("auth")) {
        errorCode = "AUTH_ERROR";
      } else if (code === 403 || msg.includes("permission") || msg.includes("forbidden") || msg.includes("iam")) {
        errorCode = "BUCKET_PERMISSION_DENIED";
      } else if (code === 404 || msg.includes("not found")) {
        errorCode = "BUCKET_NOT_FOUND";
      }
      return { assetBucket: false, tempBucket: false, error: err.message, errorCode };
    }
  }
}

export const globalGcsClient = new GcsClientService();
