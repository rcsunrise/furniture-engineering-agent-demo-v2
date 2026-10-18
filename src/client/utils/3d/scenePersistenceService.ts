import * as THREE from "three";
import type { Engineering3DEditor } from "../../editor/Engineering3DEditor.js";
import { getModelBuffer, clearAllModelBuffers } from "./indexedDbStorage.js";

const CACHE_KEY = "furniture_engineering_active_workspace_v1";

export interface CachedInstanceData {
  instanceId: string;
  name: string;
  assetId?: string;
  downloadUrl?: string;
  sourceFileName?: string;
  geometrySource?: string;
  productionTruth?: boolean;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  visible: boolean;
  locked: boolean;
  canonicalComponentId?: string | null;
}

export interface CachedSceneData {
  timestamp: number;
  sceneName: string;
  instances: CachedInstanceData[];
}

export class ScenePersistenceService {
  private static saveTimeout: NodeJS.Timeout | null = null;

  public static saveActiveScene(editor: Engineering3DEditor): void {
    if (typeof window === "undefined" || !window.localStorage) return;

    // Debounce save by 200ms to avoid high-frequency writes during drag/transform
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      try {
        const instances: CachedInstanceData[] = [];
        const seenIds = new Set<string>();

        for (let i = 0; i < editor.instancesGroup.children.length; i++) {
          const child = editor.instancesGroup.children[i];
          let instanceId =
            child.userData?.instanceId ||
            child.uuid ||
            `inst_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;

          if (seenIds.has(instanceId)) {
            instanceId = `${instanceId}_${Math.random().toString(36).substring(2, 6)}`;
            if (child.userData) {
              child.userData.instanceId = instanceId;
            }
          }
          seenIds.add(instanceId);

          instances.push({
            instanceId,
            name: child.name || "Model",
            assetId: child.userData?.assetId || "",
            downloadUrl: child.userData?.downloadUrl || "",
            sourceFileName: child.userData?.sourceFileName || "",
            geometrySource: child.userData?.geometrySource || "direct_import",
            productionTruth: child.userData?.productionTruth ?? false,
            transform: {
              position: [child.position.x, child.position.y, child.position.z],
              rotation: [child.rotation.x, child.rotation.y, child.rotation.z],
              scale: [child.scale.x, child.scale.y, child.scale.z],
            },
            visible: child.visible !== false,
            locked: Boolean(child.userData?.locked),
            canonicalComponentId: child.userData?.canonicalComponentId || null,
          });
        }

        const data: CachedSceneData = {
          timestamp: Date.now(),
          sceneName: editor.sceneName || "ActiveWorkspace",
          instances,
        };

        window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch (err) {
        console.warn("[ScenePersistenceService] Failed to save active scene to localStorage:", err);
      }
    }, 200);
  }

  public static hasCachedScene(): boolean {
    if (typeof window === "undefined" || !window.localStorage) return false;
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const data: CachedSceneData = JSON.parse(raw);
      return Array.isArray(data.instances) && data.instances.length > 0;
    } catch {
      return false;
    }
  }

  public static async restoreActiveScene(editor: Engineering3DEditor): Promise<boolean> {
    if (typeof window === "undefined" || !window.localStorage) return false;
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const data: CachedSceneData = JSON.parse(raw);
      if (!Array.isArray(data.instances) || data.instances.length === 0) return false;

      // Only restore if editor currently has no instances
      if (editor.instancesGroup.children.length > 0) return true;

      editor.setSceneName(data.sceneName || "ActiveWorkspace");

      const seenRestoredIds = new Set<string>();

      for (let i = 0; i < data.instances.length; i++) {
        const inst = data.instances[i];
        let instId = inst.instanceId || `inst_${Date.now()}_${i}`;
        if (seenRestoredIds.has(instId)) {
          instId = `${instId}_${Math.random().toString(36).substring(2, 6)}`;
        }
        seenRestoredIds.add(instId);

        let loadedObject: THREE.Object3D | null = null;

        // 1. First priority: Try browser IndexedDB binary cache (instant, offline-durable, zero network lag)
        try {
          const cached =
            (await getModelBuffer(inst.instanceId)) ||
            (inst.downloadUrl ? await getModelBuffer(inst.downloadUrl) : null) ||
            (inst.assetId ? await getModelBuffer(inst.assetId) : null);

          if (cached && cached.buffer && cached.buffer.byteLength > 0) {
            const res = await editor.loadModelFromBuffer(
              cached.buffer,
              inst.sourceFileName || `${inst.name || "model"}.glb`
            );
            loadedObject = res.object;
          }
        } catch (e) {
          console.warn(`[ScenePersistenceService] IndexedDB buffer restore warning for ${inst.instanceId}:`, e);
        }

        // 2. Second priority: If not in IndexedDB, fetch from direct downloadUrl
        if (!loadedObject && inst.downloadUrl) {
          try {
            loadedObject = await editor.loadGLTF(inst.downloadUrl);
          } catch (e) {
            console.warn(`[ScenePersistenceService] downloadUrl restore warning for ${inst.downloadUrl}:`, e);
          }
        }

        // 3. Third priority: Fetch via asset storage API
        if (!loadedObject && inst.assetId) {
          try {
            const res = await fetch(`/api/assets/${inst.assetId}`);
            if (res.ok) {
              const resData = await res.json();
              if (resData.success && resData.asset?.downloadUrl) {
                loadedObject = await editor.loadGLTF(resData.asset.downloadUrl);
              }
            }
          } catch (e) {
            console.warn(`[ScenePersistenceService] Asset API restore warning for ${inst.assetId}:`, e);
          }
        }

        if (loadedObject) {
          // If loadedObject.uuid is already used in editor.objectRegistry or duplicate, generate a new one
          const existingObj = editor.objectRegistry.get(instId);
          if (existingObj && existingObj !== loadedObject) {
            loadedObject.uuid = THREE.MathUtils.generateUUID();
          } else {
            loadedObject.uuid = instId;
          }
          loadedObject.name = inst.name;
          loadedObject.position.set(inst.transform.position[0], inst.transform.position[1], inst.transform.position[2]);
          loadedObject.rotation.set(inst.transform.rotation[0], inst.transform.rotation[1], inst.transform.rotation[2]);
          loadedObject.scale.set(inst.transform.scale[0], inst.transform.scale[1], inst.transform.scale[2]);
          loadedObject.visible = inst.visible;
          loadedObject.userData = {
            ...loadedObject.userData,
            instanceId: instId,
            assetId: inst.assetId,
            downloadUrl: inst.downloadUrl,
            sourceFileName: inst.sourceFileName,
            geometrySource: inst.geometrySource || "direct_import",
            productionTruth: inst.productionTruth ?? false,
            locked: inst.locked,
            canonicalComponentId: inst.canonicalComponentId,
          };
          editor.signals.sceneGraphChanged.dispatch();
        }
      }

      if (editor.instancesGroup.children.length > 0) {
        editor.focus();
        return true;
      }
      return false;
    } catch (err) {
      console.warn("[ScenePersistenceService] Failed to restore scene from cache:", err);
      return false;
    }
  }

  public static clearActiveScene(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.removeItem(CACHE_KEY);
      clearAllModelBuffers().catch(() => {});
    } catch {
      // ignore
    }
  }
}
