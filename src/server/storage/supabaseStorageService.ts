import fs from "fs";
import path from "path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const STORAGE_BUCKET_3D = "engineering-3d-assets";

export class SupabaseStorageService {
  private client: SupabaseClient | null = null;
  private localFallbackDir: string;
  private isSupabaseActive = false;

  constructor() {
    this.localFallbackDir = path.resolve(process.cwd(), "uploads", "storage", STORAGE_BUCKET_3D);
    if (!fs.existsSync(this.localFallbackDir)) {
      fs.mkdirSync(this.localFallbackDir, { recursive: true });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        this.client = createClient(supabaseUrl, supabaseKey);
        this.isSupabaseActive = true;
        this.ensureBucketExists().catch((err) => {
          console.warn("[Storage] Warning verifying Supabase bucket:", err.message);
        });
      } catch (err: any) {
        console.warn("[Storage] Failed to initialize Supabase client:", err.message);
      }
    }
  }

  private async ensureBucketExists(): Promise<void> {
    if (!this.client) return;
    try {
      const { data: buckets } = await this.client.storage.listBuckets();
      const exists = buckets?.some((b) => b.name === STORAGE_BUCKET_3D);
      if (!exists) {
        await this.client.storage.createBucket(STORAGE_BUCKET_3D, {
          public: true,
          fileSizeLimit: 200 * 1024 * 1024, // 200MB limit for 3D assets
        });
        console.log(`[Storage] Created Supabase bucket '${STORAGE_BUCKET_3D}'`);
      }
    } catch (e: any) {
      console.warn("[Storage] Bucket existence check warning:", e.message);
    }
  }

  /**
   * Uploads 3D binary file buffer into Storage.
   * NEVER stores Base64 in PostgreSQL or localStorage.
   */
  public async uploadAssetFile(
    fileBuffer: Buffer,
    destinationFileName: string,
    contentType = "model/gltf-binary"
  ): Promise<{ storagePath: string; downloadUrl: string }> {
    const storagePath = `${Date.now()}_${destinationFileName}`;

    if (this.isSupabaseActive && this.client) {
      try {
        const { error } = await this.client.storage
          .from(STORAGE_BUCKET_3D)
          .upload(storagePath, fileBuffer, {
            contentType,
            upsert: true,
          });

        if (!error) {
          const { data } = this.client.storage.from(STORAGE_BUCKET_3D).getPublicUrl(storagePath);
          return {
            storagePath,
            downloadUrl: data.publicUrl,
          };
        }
        console.warn("[Storage] Supabase upload failed, falling back to durable server storage:", error.message);
      } catch (err: any) {
        console.warn("[Storage] Supabase upload error:", err.message);
      }
    }

    // Server-side durable storage fallback
    const targetFilePath = path.join(this.localFallbackDir, storagePath);
    fs.writeFileSync(targetFilePath, fileBuffer);

    return {
      storagePath,
      downloadUrl: `/api/storage/${STORAGE_BUCKET_3D}/${encodeURIComponent(storagePath)}`,
    };
  }

  /**
   * Reads a binary file from storage.
   */
  public async getAssetFile(storagePath: string): Promise<Buffer | null> {
    if (this.isSupabaseActive && this.client) {
      try {
        const { data, error } = await this.client.storage.from(STORAGE_BUCKET_3D).download(storagePath);
        if (!error && data) {
          const arrayBuffer = await data.arrayBuffer();
          return Buffer.from(arrayBuffer);
        }
      } catch (err: any) {
        console.warn("[Storage] Supabase download error:", err.message);
      }
    }

    const localFile = path.join(this.localFallbackDir, storagePath);
    if (fs.existsSync(localFile)) {
      return fs.readFileSync(localFile);
    }
    return null;
  }

  /**
   * Deletes a file from storage.
   */
  public async deleteAssetFile(storagePath: string): Promise<boolean> {
    if (this.isSupabaseActive && this.client) {
      try {
        await this.client.storage.from(STORAGE_BUCKET_3D).remove([storagePath]);
      } catch (e: any) {
        console.warn("[Storage] Supabase remove error:", e.message);
      }
    }

    const localFile = path.join(this.localFallbackDir, storagePath);
    if (fs.existsSync(localFile)) {
      fs.unlinkSync(localFile);
      return true;
    }
    return true;
  }
}

export const globalSupabaseStorage = new SupabaseStorageService();
