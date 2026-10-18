import type {
  EngineeringArtifact,
  EngineeringArtifactKind,
  CreateUploadSessionRequest,
  CreateUploadSessionResponse,
  CompleteUploadResponse,
  ArtifactAccessResponse,
  ListArtifactsFilter,
  StorageConfigResponse,
} from "../../shared/engineeringArtifact.js";

export class EngineeringArtifactApi {
  public async getStorageConfig(): Promise<StorageConfigResponse> {
    const res = await fetch("/api/engineering/storage/config", {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({ success: false, error: res.statusText }));
    if (!res.ok) {
      const err: any = new Error(data.error || `Failed to fetch storage config: ${res.statusText}`);
      err.errorCode = data.errorCode || "STORAGE_ERROR";
      throw err;
    }
    return data;
  }

  public async createUploadSession(
    req: CreateUploadSessionRequest
  ): Promise<CreateUploadSessionResponse> {
    const res = await fetch("/api/engineering/storage/upload-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    const data = await res.json().catch(() => ({ error: { message: res.statusText } }));
    if (!res.ok) {
      const err: any = new Error(data.error?.message || "Failed to create upload session");
      err.errorCode = data.error?.code || "UPLOAD_ERROR";
      throw err;
    }
    return data;
  }

  public async completeUpload(
    artifactId: string,
    actualSize?: number,
    actualMimeType?: string
  ): Promise<CompleteUploadResponse> {
    const res = await fetch(`/api/engineering/storage/assets/${encodeURIComponent(artifactId)}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actualSize, actualMimeType }),
    });
    const data = await res.json().catch(() => ({ error: { message: res.statusText } }));
    if (!res.ok) {
      const err: any = new Error(data.error?.message || "Failed to complete upload");
      err.errorCode = data.error?.code || "COMPLETE_ERROR";
      throw err;
    }
    return data;
  }

  public async getAssetAccess(artifactId: string): Promise<ArtifactAccessResponse> {
    const res = await fetch(`/api/engineering/storage/assets/${encodeURIComponent(artifactId)}/access`);
    const data = await res.json().catch(() => ({ error: { message: res.statusText } }));
    if (!res.ok) {
      const code = data.code || data.error?.code || (res.status === 502 ? "GCS_SIGNED_URL_ERROR" : "SIGNED_URL_ERROR");
      const message = data.message || data.error?.message || (res.status === 502 ? "GCS_SIGNED_URL_ERROR" : "Failed to get asset access URL");
      const err: any = new Error(message);
      err.errorCode = code;
      err.status = res.status;
      err.provider = data.provider || "gcs";
      err.fallbackUsed = data.fallbackUsed ?? false;
      err.permissionIssueType = data.permissionIssueType;
      throw err;
    }
    return data;
  }

  public async probeSigningDiagnostics(): Promise<{
    success: boolean;
    provider: string;
    projectId: string;
    bucket: string;
    runtimeIdentity: string;
    canAccessBucket: boolean;
    canSignBlob: boolean;
    errorCode?: string;
    errorMessage?: string;
  }> {
    const res = await fetch("/api/engineering/storage/debug/signing");
    return res.json();
  }

  public async listArtifacts(
    filter?: ListArtifactsFilter
  ): Promise<{ success: boolean; count: number; assets: EngineeringArtifact[] }> {
    const params = new URLSearchParams();
    if (filter?.projectId) params.set("projectId", filter.projectId);
    if (filter?.skuCode) params.set("skuCode", filter.skuCode);
    if (filter?.componentId) params.set("componentId", filter.componentId);
    if (filter?.kind) params.set("kind", filter.kind);
    if (filter?.sourceArtifactId) params.set("sourceArtifactId", filter.sourceArtifactId);

    const query = params.toString();
    const url = `/api/engineering/storage/assets${query ? `?${query}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(err.error?.message || "Failed to list artifacts");
    }
    return res.json();
  }

  public async deleteArtifact(
    artifactId: string
  ): Promise<{ success: boolean; error?: string; details?: any }> {
    const res = await fetch(`/api/engineering/storage/assets/${encodeURIComponent(artifactId)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({ success: false }));
    if (!res.ok) {
      return {
        success: false,
        error: data.error?.message || "Delete failed",
        details: data.error?.details,
      };
    }
    return data;
  }

  /**
   * High-level helper: Uploads file/blob to GCS/Storage via resumable or single stream,
   * avoiding Base64 conversion and preventing server memory duplication.
   */
  public async uploadFileToStorage(
    file: File | Blob,
    options: {
      projectId: string;
      skuCode?: string;
      componentId?: string;
      kind: EngineeringArtifactKind;
      fileName: string;
      mimeType?: string;
      sourceArtifactId?: string;
      revision?: number;
      provider?: string;
      metadata?: Record<string, unknown>;
      isTemp?: boolean;
    },
    onProgress?: (percent: number) => void
  ): Promise<{ artifact: EngineeringArtifact; accessUrl: string }> {
    const mimeType = options.mimeType || file.type || "application/octet-stream";

    // 1. Create Upload Session
    const session = await this.createUploadSession({
      projectId: options.projectId,
      skuCode: options.skuCode,
      componentId: options.componentId,
      kind: options.kind,
      fileName: options.fileName,
      mimeType,
      sizeBytes: file.size,
      sourceArtifactId: options.sourceArtifactId,
      revision: options.revision,
      provider: options.provider,
      metadata: options.metadata,
      isTemp: options.isTemp,
    });

    // 2. Perform direct binary upload to session URL using XMLHttpRequest for progress
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", session.sessionUrl, true);
      xhr.setRequestHeader("Content-Type", mimeType);

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const pct = Math.round((evt.loaded / evt.total) * 100);
            onProgress(pct);
          }
        };
      }

      xhr.onload = () => {
        // GCS resumable upload or PUT success is either 200, 201, or 204
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Storage upload failed with HTTP ${xhr.status}: ${xhr.responseText}`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during storage upload"));
      xhr.send(file);
    });

    // 3. Confirm upload with server
    const completeRes = await this.completeUpload(session.artifactId, file.size, mimeType);

    // 4. Retrieve access signed URL
    const access = await this.getAssetAccess(session.artifactId);

    return {
      artifact: completeRes.artifact,
      accessUrl: access.url,
    };
  }
}

export const engineeringArtifactApi = new EngineeringArtifactApi();
