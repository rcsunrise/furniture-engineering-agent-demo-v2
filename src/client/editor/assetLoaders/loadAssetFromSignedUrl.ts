import * as THREE from "three";
import { engineeringArtifactApi } from "../../services/engineeringArtifactApi.js";
import { ModelLoaderService, type ParsedModelResult } from "../../utils/3d/modelLoaderService.js";

export interface LoadAssetFromStorageOptions {
  artifactId?: string;
  signedUrl?: string;
  fileName?: string;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
}

export interface LoadedStorageAssetResult extends ParsedModelResult {
  artifactId?: string;
  signedUrl: string;
  source: "gcs_signed_url" | "local_fallback_url";
}

/**
 * Loads a 3D binary engineering asset from Google Cloud Storage via a backend-issued Signed URL.
 * Three.js Editor does not directly hold GCS credentials; all authenticated access happens via short-lived signed URLs.
 */
export async function loadAssetFromSignedUrl(
  options: LoadAssetFromStorageOptions
): Promise<LoadedStorageAssetResult> {
  let signedUrl = options.signedUrl;
  let artifactId = options.artifactId;
  let source: "gcs_signed_url" | "local_fallback_url" = "gcs_signed_url";

  if (!signedUrl && artifactId) {
    const access = await engineeringArtifactApi.getAssetAccess(artifactId);
    signedUrl = access.url;
    source = access.storageProvider === "gcs" ? "gcs_signed_url" : "local_fallback_url";
  }

  if (!signedUrl) {
    throw new Error("Either artifactId or signedUrl must be provided to loadAssetFromSignedUrl");
  }

  // Fetch binary via Signed URL with streaming progress tracking
  const response = await fetch(signedUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch asset from signed URL: ${response.status} ${response.statusText}`
    );
  }

  const contentLength = response.headers.get("content-length");
  const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

  let buffer: ArrayBuffer;

  if (response.body && options.onProgress && totalBytes > 0) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        receivedBytes += value.length;
        options.onProgress(receivedBytes, totalBytes);
      }
    }

    const merged = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    buffer = merged.buffer;
  } else {
    buffer = await response.arrayBuffer();
  }

  const inferredName = options.fileName || (artifactId ? `${artifactId}.glb` : "model.glb");
  const parsed = await ModelLoaderService.loadModel(buffer, inferredName);

  // Tag with provenance metadata
  parsed.rootObject.userData = {
    ...parsed.rootObject.userData,
    artifactId,
    source,
    loadedFromGcs: source === "gcs_signed_url",
    productionTruth: false, // AI / External meshes never automatically claim productionTruth
  };

  return {
    ...parsed,
    artifactId,
    signedUrl,
    source,
  };
}
