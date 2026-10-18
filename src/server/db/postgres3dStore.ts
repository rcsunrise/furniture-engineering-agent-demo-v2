import fs from "fs";
import path from "path";
import type { Imported3DAsset, Engineering3DScene } from "../../shared/imported3dAsset.js";

export class Postgres3dStore {
  private assetsMap = new Map<string, Imported3DAsset>();
  private scenesMap = new Map<string, Engineering3DScene>();
  private dataDir: string;
  private assetsFile: string;
  private scenesFile: string;

  constructor() {
    this.dataDir = path.resolve(process.cwd(), "data", "3d_workspace");
    this.assetsFile = path.join(this.dataDir, "engineering_3d_assets.json");
    this.scenesFile = path.join(this.dataDir, "engineering_3d_scenes.json");

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this.loadData();
  }

  private loadData(): void {
    try {
      if (fs.existsSync(this.assetsFile)) {
        const raw = fs.readFileSync(this.assetsFile, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((a: Imported3DAsset) => this.assetsMap.set(a.id, a));
        }
      }
      if (fs.existsSync(this.scenesFile)) {
        const raw = fs.readFileSync(this.scenesFile, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((s: Engineering3DScene) => this.scenesMap.set(s.id, s));
        }
      }
    } catch (e: any) {
      console.warn("[Postgres3dStore] Data load error:", e.message);
    }
  }

  private persistData(): void {
    try {
      fs.writeFileSync(this.assetsFile, JSON.stringify(Array.from(this.assetsMap.values()), null, 2));
      fs.writeFileSync(this.scenesFile, JSON.stringify(Array.from(this.scenesMap.values()), null, 2));
    } catch (e: any) {
      console.warn("[Postgres3dStore] Data persist error:", e.message);
    }
  }

  // --- Asset Methods ---

  public listAssets(): Imported3DAsset[] {
    return Array.from(this.assetsMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getAsset(id: string): Imported3DAsset | null {
    return this.assetsMap.get(id) || null;
  }

  public saveAsset(asset: Imported3DAsset): void {
    this.assetsMap.set(asset.id, asset);
    this.persistData();
  }

  /**
   * Checks if an asset is referenced by any scene.
   */
  public getReferencingScenes(assetId: string): Array<{ id: string; name: string }> {
    const referencing: Array<{ id: string; name: string }> = [];
    for (const scene of this.scenesMap.values()) {
      if (scene.instances.some((inst) => inst.assetId === assetId)) {
        referencing.push({ id: scene.id, name: scene.name });
      }
    }
    return referencing;
  }

  /**
   * Deletes an asset. Throws if referenced by any scene.
   */
  public deleteAsset(assetId: string): { success: boolean; referencingScenes?: Array<{ id: string; name: string }> } {
    const refs = this.getReferencingScenes(assetId);
    if (refs.length > 0) {
      return { success: false, referencingScenes: refs };
    }

    const removed = this.assetsMap.delete(assetId);
    if (removed) {
      this.persistData();
    }
    return { success: true };
  }

  public updateAssetThumbnail(assetId: string, thumbnailUrl: string): boolean {
    const asset = this.assetsMap.get(assetId);
    if (!asset) return false;
    asset.thumbnailUrl = thumbnailUrl;
    asset.updatedAt = new Date().toISOString();
    this.persistData();
    return true;
  }

  // --- Scene Methods ---

  public listScenes(): Engineering3DScene[] {
    return Array.from(this.scenesMap.values()).sort(
      (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
    );
  }

  public getScene(id: string): Engineering3DScene | null {
    return this.scenesMap.get(id) || null;
  }

  public saveScene(scene: Engineering3DScene): void {
    this.scenesMap.set(scene.id, scene);
    this.persistData();
  }

  public updateScene(id: string, updates: Partial<Engineering3DScene>): Engineering3DScene | null {
    const existing = this.scenesMap.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.scenesMap.set(id, updated);
    this.persistData();
    return updated;
  }

  /**
   * Deletes a scene. Strictly does NOT delete referenced assets.
   */
  public deleteScene(id: string): boolean {
    const removed = this.scenesMap.delete(id);
    if (removed) {
      this.persistData();
    }
    return removed;
  }
}

export const globalPostgres3dStore = new Postgres3dStore();
