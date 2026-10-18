import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { globalSupabaseStorage, STORAGE_BUCKET_3D } from "../storage/supabaseStorageService.js";
import { globalPostgres3dStore } from "../db/postgres3dStore.js";
import {
  Imported3DAssetSchema,
  Engineering3DSceneSchema,
  type Imported3DAsset,
  type Engineering3DScene,
} from "../../shared/imported3dAsset.js";

export const assets3dRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 150 * 1024 * 1024, // 150 MB maximum
  },
});

// 1. List all 3D assets
assets3dRouter.get("/assets", (_req: Request, res: Response) => {
  try {
    const assets = globalPostgres3dStore.listAssets();
    res.json({ success: true, assets });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1b. Get single 3D asset by ID
assets3dRouter.get("/assets/:id", (req: Request, res: Response): void => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const asset = globalPostgres3dStore.getAsset(id);
    if (!asset) {
      res.status(404).json({ success: false, error: `Asset "${id}" not found` });
      return;
    }
    res.json({ success: true, asset });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Upload a new 3D asset
assets3dRouter.post(
  "/assets/upload",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: "No 3D file uploaded" });
        return;
      }

      const fileName = file.originalname || "model.glb";
      const ext = fileName.split(".").pop()?.toLowerCase() || "glb";

      // Parse metadata passed in body if available
      let clientStats: any = null;
      let clientMaterials: any[] = [];
      let detectedUp: "Y_UP" | "Z_UP" = "Y_UP";
      let assetName = req.body.name || fileName.replace(/\.[^/.]+$/, "");

      if (req.body.stats) {
        try {
          clientStats = typeof req.body.stats === "string" ? JSON.parse(req.body.stats) : req.body.stats;
        } catch {
          // ignore parse error
        }
      }
      if (req.body.materials) {
        try {
          clientMaterials = typeof req.body.materials === "string" ? JSON.parse(req.body.materials) : req.body.materials;
        } catch {
          // ignore
        }
      }
      if (req.body.detectedUp === "Z_UP" || ext === "stl" || ext === "ply") {
        detectedUp = "Z_UP";
      }

      // Upload binary to Storage bucket 'engineering-3d-assets'
      const { storagePath, downloadUrl } = await globalSupabaseStorage.uploadAssetFile(
        file.buffer,
        fileName,
        file.mimetype || "application/octet-stream"
      );

      // Default fallback stats if client did not precalculate
      const stats = clientStats || {
        meshCount: 1,
        vertexCount: 0,
        triangleCount: 0,
        materialCount: clientMaterials.length || 1,
        textureCount: 0,
        boundingBox: { min: [-100, -100, 0], max: [100, 100, 200] },
        dimensions: { width: 200, depth: 200, height: 200 },
      };

      const assetId = `asset-3d-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const now = new Date().toISOString();

      const newAsset: Imported3DAsset = {
        id: assetId,
        name: assetName,
        fileName,
        fileSize: file.size,
        format: (ext as any) || "glb",
        storageBucket: STORAGE_BUCKET_3D,
        storagePath,
        downloadUrl,
        thumbnailUrl: req.body.thumbnailUrl || undefined,
        stats,
        materials: clientMaterials,
        coordinateSystem: {
          detectedUp,
          targetUp: "Y_UP",
          conversionApplied: "NONE",
        },
        metadata: {
          originalName: fileName,
          mimeType: file.mimetype,
          uploadedAt: now,
        },
        productionTruth: false,
        createdAt: now,
        updatedAt: now,
      };

      const validation = Imported3DAssetSchema.safeParse(newAsset);
      if (!validation.success) {
        res.status(400).json({ success: false, error: "Asset schema validation failed", details: validation.error });
        return;
      }

      globalPostgres3dStore.saveAsset(validation.data);
      res.json({ success: true, asset: validation.data });
    } catch (err: any) {
      console.error("[Assets3d] Upload error:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to upload 3D asset" });
    }
  }
);

// 2b. Register a derived split asset (Section O: Source Immutability)
assets3dRouter.post("/assets/derived", (req: Request, res: Response): void => {
  try {
    const derivedAsset: Imported3DAsset = {
      ...req.body,
      productionTruth: false, // MANDATORY: derived asset is never productionTruth
      updatedAt: new Date().toISOString(),
    };

    const validation = Imported3DAssetSchema.safeParse(derivedAsset);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: "Derived asset schema validation failed",
        details: validation.error,
      });
      return;
    }

    globalPostgres3dStore.saveAsset(validation.data);
    res.json({ success: true, asset: validation.data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Update asset thumbnail
assets3dRouter.post("/assets/:id/thumbnail", upload.single("thumbnail"), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const asset = globalPostgres3dStore.getAsset(id);
    if (!asset) {
      res.status(404).json({ success: false, error: "Asset not found" });
      return;
    }

    let thumbnailUrl = "";
    if (req.file) {
      const { downloadUrl } = await globalSupabaseStorage.uploadAssetFile(
        req.file.buffer,
        `thumb_${id}.webp`,
        "image/webp"
      );
      thumbnailUrl = downloadUrl;
    } else if (req.body.thumbnailDataUrl) {
      // Data URL from canvas
      const base64Data = req.body.thumbnailDataUrl.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const { downloadUrl } = await globalSupabaseStorage.uploadAssetFile(
        buffer,
        `thumb_${id}.webp`,
        "image/webp"
      );
      thumbnailUrl = downloadUrl;
    }

    if (thumbnailUrl) {
      globalPostgres3dStore.updateAssetThumbnail(id, thumbnailUrl);
    }

    res.json({ success: true, thumbnailUrl });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Delete 3D asset (checks referencing scenes first)
assets3dRouter.delete("/assets/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const asset = globalPostgres3dStore.getAsset(id);
    if (!asset) {
      res.status(404).json({ success: false, error: "Asset not found" });
      return;
    }

    const deleteResult = globalPostgres3dStore.deleteAsset(id);
    if (!deleteResult.success) {
      res.status(409).json({
        success: false,
        error: "ASSET_IN_USE",
        message: `Cannot delete asset "${asset.name}" because it is currently referenced in ${deleteResult.referencingScenes?.length} scene(s).`,
        referencingScenes: deleteResult.referencingScenes,
      });
      return;
    }

    // Delete underlying storage file
    await globalSupabaseStorage.deleteAssetFile(asset.storagePath);

    res.json({ success: true, message: `Asset "${asset.name}" deleted successfully` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Scenes API
assets3dRouter.get("/scenes", (_req: Request, res: Response) => {
  try {
    const scenes = globalPostgres3dStore.listScenes();
    res.json({ success: true, scenes });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

assets3dRouter.post("/scenes", (req: Request, res: Response): void => {
  try {
    const now = new Date().toISOString();
    const sceneData = {
      ...req.body,
      id: req.body.id || `scene-3d-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: req.body.createdAt || now,
      updatedAt: now,
    };

    const validation = Engineering3DSceneSchema.safeParse(sceneData);
    if (!validation.success) {
      res.status(400).json({ success: false, error: "Scene schema validation failed", details: validation.error });
      return;
    }

    globalPostgres3dStore.saveScene(validation.data);
    res.json({ success: true, scene: validation.data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

assets3dRouter.get("/scenes/:id", (req: Request, res: Response): void => {
  try {
    const sceneId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const scene = globalPostgres3dStore.getScene(sceneId);
    if (!scene) {
      res.status(404).json({ success: false, error: "Scene not found" });
      return;
    }
    res.json({ success: true, scene });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

assets3dRouter.delete("/scenes/:id", (req: Request, res: Response): void => {
  try {
    const sceneId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const success = globalPostgres3dStore.deleteScene(sceneId);
    if (!success) {
      res.status(404).json({ success: false, error: "Scene not found" });
      return;
    }
    res.json({ success: true, message: "Scene deleted successfully (underlying assets preserved)" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Direct Storage file delivery
assets3dRouter.get("/storage/:bucket/:filename", async (req: Request, res: Response): Promise<void> => {
  try {
    const filename = String(req.params.filename);
    const fileBuffer = await globalSupabaseStorage.getAssetFile(decodeURIComponent(filename));
    if (!fileBuffer) {
      res.status(404).json({ error: "File not found in storage" });
      return;
    }

    const lower = filename.toLowerCase();
    if (lower.endsWith(".glb")) {
      res.setHeader("Content-Type", "model/gltf-binary");
    } else if (lower.endsWith(".gltf")) {
      res.setHeader("Content-Type", "model/gltf+json");
    } else if (lower.endsWith(".webp")) {
      res.setHeader("Content-Type", "image/webp");
    } else if (lower.endsWith(".png")) {
      res.setHeader("Content-Type", "image/png");
    } else {
      res.setHeader("Content-Type", "application/octet-stream");
    }

    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(fileBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Asset File direct delivery by asset ID (legacy and sample asset compatibility)
assets3dRouter.get("/assets/file/:id/:filename", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const asset = globalPostgres3dStore.getAsset(id);
    if (!asset) {
      res.status(404).json({ error: `Asset "${id}" not found` });
      return;
    }

    const fileBuffer = await globalSupabaseStorage.getAssetFile(asset.storagePath);
    if (!fileBuffer) {
      res.status(404).json({ error: `Asset storage file "${asset.storagePath}" not found` });
      return;
    }

    const filename = String(req.params.filename || asset.fileName || "model.glb");
    const lower = filename.toLowerCase();
    if (lower.endsWith(".glb")) {
      res.setHeader("Content-Type", "model/gltf-binary");
    } else if (lower.endsWith(".gltf")) {
      res.setHeader("Content-Type", "model/gltf+json");
    } else if (lower.endsWith(".obj")) {
      res.setHeader("Content-Type", "text/plain");
    } else if (lower.endsWith(".stl")) {
      res.setHeader("Content-Type", "model/stl");
    } else if (lower.endsWith(".ply")) {
      res.setHeader("Content-Type", "application/octet-stream");
    } else if (lower.endsWith(".webp")) {
      res.setHeader("Content-Type", "image/webp");
    } else {
      res.setHeader("Content-Type", "application/octet-stream");
    }

    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(fileBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
