import fs from "fs";
import path from "path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { globalGcsClient } from "./gcsClient.js";
import { globalUploadSessionService } from "./uploadSessionService.js";
import { globalPostgres3dStore } from "../db/postgres3dStore.js";
import type {
  EngineeringArtifact,
  ListArtifactsFilter,
} from "../../shared/engineeringArtifact.js";

export class EngineeringArtifactStorage {
  private artifacts = new Map<string, EngineeringArtifact>();
  private dataDir: string;
  private storageFile: string;
  private supabase: SupabaseClient | null = null;
  private isSupabaseActive = false;

  constructor() {
    this.dataDir = path.resolve(process.cwd(), "data", "engineering_artifacts");
    this.storageFile = path.join(this.dataDir, "artifacts.json");

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this.initSupabase();
    this.loadFromDisk();
  }

  private initSupabase(): void {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseKey);
        this.isSupabaseActive = true;
      } catch (err: any) {
        console.warn("[ArtifactStorage] Supabase client init error:", err.message);
      }
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, "utf-8");
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const item of list) {
            this.artifacts.set(item.id, item);
          }
        }
      }
    } catch (err: any) {
      console.warn("[ArtifactStorage] Failed to read disk artifacts:", err.message);
    }
  }

  private persistToDisk(): void {
    try {
      fs.writeFileSync(
        this.storageFile,
        JSON.stringify(Array.from(this.artifacts.values()), null, 2)
      );
    } catch (err: any) {
      console.warn("[ArtifactStorage] Failed to persist artifacts to disk:", err.message);
    }
  }

  public async saveArtifact(artifact: EngineeringArtifact): Promise<void> {
    this.artifacts.set(artifact.id, artifact);
    this.persistToDisk();

    if (this.isSupabaseActive && this.supabase) {
      try {
        await this.supabase.from("engineering_artifacts").upsert({
          id: artifact.id,
          project_id: artifact.projectId,
          sku_code: artifact.skuCode || null,
          component_id: artifact.componentId || null,
          kind: artifact.kind,
          provider: artifact.provider || null,
          format: artifact.format,
          mime_type: artifact.mimeType,
          size_bytes: artifact.sizeBytes,
          storage_provider: artifact.storage.provider,
          storage_bucket: artifact.storage.bucket,
          storage_object_path: artifact.storage.objectPath,
          source_artifact_id: artifact.sourceArtifactId || null,
          revision: artifact.revision || 1,
          coordinate_system: artifact.coordinateSystem || {},
          production_truth: artifact.productionTruth,
          metadata: artifact.metadata || {},
          created_at: artifact.createdAt,
          updated_at: artifact.updatedAt,
        });
      } catch (err: any) {
        console.warn("[ArtifactStorage] Supabase upsert error:", err.message);
      }
    }
  }

  public async getArtifact(id: string): Promise<EngineeringArtifact | null> {
    const mem = this.artifacts.get(id);
    if (mem) return mem;

    if (this.isSupabaseActive && this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from("engineering_artifacts")
          .select("*")
          .eq("id", id)
          .single();
        if (!error && data) {
          const loaded: EngineeringArtifact = {
            id: data.id,
            projectId: data.project_id,
            skuCode: data.sku_code || undefined,
            componentId: data.component_id || undefined,
            kind: data.kind,
            provider: data.provider || undefined,
            format: data.format,
            mimeType: data.mime_type,
            sizeBytes: Number(data.size_bytes),
            storage: {
              provider: data.storage_provider,
              bucket: data.storage_bucket,
              objectPath: data.storage_object_path,
            },
            sourceArtifactId: data.source_artifact_id || undefined,
            revision: data.revision || 1,
            coordinateSystem: data.coordinate_system,
            productionTruth: data.production_truth,
            metadata: data.metadata,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
          this.artifacts.set(loaded.id, loaded);
          return loaded;
        }
      } catch (err: any) {
        console.warn("[ArtifactStorage] Supabase query error:", err.message);
      }
    }

    return null;
  }

  public async listArtifacts(filter?: ListArtifactsFilter): Promise<EngineeringArtifact[]> {
    let all = Array.from(this.artifacts.values());

    if (filter) {
      if (filter.projectId) {
        all = all.filter((a) => a.projectId === filter.projectId);
      }
      if (filter.skuCode) {
        all = all.filter((a) => a.skuCode === filter.skuCode);
      }
      if (filter.componentId) {
        all = all.filter((a) => a.componentId === filter.componentId);
      }
      if (filter.kind) {
        all = all.filter((a) => a.kind === filter.kind);
      }
      if (filter.sourceArtifactId) {
        all = all.filter((a) => a.sourceArtifactId === filter.sourceArtifactId);
      }
    }

    return all.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Confirms upload completion: verifies physical storage existence,
   * checks actual size / mimeType, and updates status.
   */
  public async completeUpload(
    artifactId: string,
    options?: { actualSize?: number; actualMimeType?: string }
  ): Promise<{ success: boolean; artifact?: EngineeringArtifact; error?: string }> {
    const artifact = await this.getArtifact(artifactId);
    if (!artifact) {
      return { success: false, error: `Artifact "${artifactId}" not found` };
    }

    let verifiedSize = options?.actualSize ?? artifact.sizeBytes;
    let verifiedMime = options?.actualMimeType ?? artifact.mimeType;

    // Check GCS existence if provider is gcs
    if (artifact.storage.provider === "gcs" && globalGcsClient.isEnabled()) {
      const storage = globalGcsClient.getStorage();
      if (storage) {
        try {
          const file = storage.bucket(artifact.storage.bucket).file(artifact.storage.objectPath);
          const [exists] = await file.exists();
          if (!exists) {
            return {
              success: false,
              error: `GCS object does not exist: gs://${artifact.storage.bucket}/${artifact.storage.objectPath}`,
            };
          }
          const [metadata] = await file.getMetadata();
          if (metadata.size) {
            verifiedSize = parseInt(metadata.size.toString(), 10);
          }
          if (metadata.contentType) {
            verifiedMime = metadata.contentType;
          }
        } catch (err: any) {
          console.warn("[ArtifactStorage] Error checking GCS object:", err.message);
        }
      }
    } else {
      // Local fallback verification
      const localPath = globalUploadSessionService.getLocalTargetFilePath(
        artifact.storage.bucket,
        artifact.storage.objectPath
      );
      if (!fs.existsSync(localPath)) {
        return {
          success: false,
          error: `Storage binary file not found on server: ${artifact.storage.objectPath}`,
        };
      }
      const stat = fs.statSync(localPath);
      verifiedSize = stat.size;
    }

    artifact.sizeBytes = verifiedSize;
    artifact.mimeType = verifiedMime;
    artifact.updatedAt = new Date().toISOString();

    await this.saveArtifact(artifact);
    return { success: true, artifact };
  }

  /**
   * Reference Check before Deletion.
   * Prohibits deleting source artifacts still referenced by:
   * 1. Derived artifacts (sourceArtifactId)
   * 2. Active 3D scenes (instance assetId)
   */
  public async checkReferences(artifactId: string): Promise<{
    hasReferences: boolean;
    derivedArtifacts: string[];
    referencingScenes: Array<{ id: string; name: string }>;
  }> {
    // 1. Check derived artifacts
    const derived = Array.from(this.artifacts.values())
      .filter((a) => a.sourceArtifactId === artifactId)
      .map((a) => a.id);

    // 2. Check referencing scenes in 3D store
    const scenes = globalPostgres3dStore.getReferencingScenes(artifactId);

    return {
      hasReferences: derived.length > 0 || scenes.length > 0,
      derivedArtifacts: derived,
      referencingScenes: scenes,
    };
  }

  /**
   * Safely deletes an artifact if no references exist.
   */
  public async deleteArtifact(
    artifactId: string
  ): Promise<{ success: boolean; error?: string; code?: string; details?: any }> {
    const artifact = await this.getArtifact(artifactId);
    if (!artifact) {
      return { success: false, error: `Artifact "${artifactId}" not found`, code: "NOT_FOUND" };
    }

    const refCheck = await this.checkReferences(artifactId);
    if (refCheck.hasReferences) {
      return {
        success: false,
        code: "ARTIFACT_IN_USE",
        error: `Cannot delete artifact "${artifactId}": it is referenced by ${refCheck.derivedArtifacts.length} derived artifact(s) and ${refCheck.referencingScenes.length} scene(s).`,
        details: refCheck,
      };
    }

    // Delete physical file from storage
    if (artifact.storage.provider === "gcs" && globalGcsClient.isEnabled()) {
      const storage = globalGcsClient.getStorage();
      if (storage) {
        try {
          await storage.bucket(artifact.storage.bucket).file(artifact.storage.objectPath).delete({ ignoreNotFound: true });
        } catch (err: any) {
          console.warn("[ArtifactStorage] Warning deleting from GCS:", err.message);
        }
      }
    }

    // Also delete any local fallback copy
    const localPath = globalUploadSessionService.getLocalTargetFilePath(
      artifact.storage.bucket,
      artifact.storage.objectPath
    );
    if (fs.existsSync(localPath)) {
      try {
        fs.unlinkSync(localPath);
      } catch (err: any) {
        console.warn("[ArtifactStorage] Warning deleting local fallback file:", err.message);
      }
    }

    // Remove from memory & disk
    this.artifacts.delete(artifactId);
    this.persistToDisk();

    // Remove from Supabase if active
    if (this.isSupabaseActive && this.supabase) {
      try {
        await this.supabase.from("engineering_artifacts").delete().eq("id", artifactId);
      } catch (err: any) {
        console.warn("[ArtifactStorage] Supabase delete error:", err.message);
      }
    }

    return { success: true };
  }
}

export const globalEngineeringArtifactStorage = new EngineeringArtifactStorage();
