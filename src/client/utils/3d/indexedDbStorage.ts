/**
 * IndexedDB storage for 3D engineering models and meshes.
 * Stores binary ArrayBuffers locally in the browser to ensure imported models,
 * reference meshes, and assemblies persist across tab switches, window changes, and page reloads.
 */

const DB_NAME = "FurnitureEngineering3DStore";
const DB_VERSION = 1;
const STORE_NAME = "model_buffers";

export interface CachedModelBuffer {
  id: string; // instanceId, assetId, or downloadUrl
  name: string;
  buffer: ArrayBuffer;
  sourceFileName?: string;
  downloadUrl?: string;
  assetId?: string;
  byteLength: number;
  timestamp: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }

  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("downloadUrl", "downloadUrl", { unique: false });
          store.createIndex("assetId", "assetId", { unique: false });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.warn("[IndexedDB] Failed to open database:", request.error);
        reject(request.error);
      };
    });
  }

  return dbPromise;
}

export async function saveModelBuffer(
  id: string,
  record: {
    name: string;
    buffer: ArrayBuffer;
    sourceFileName?: string;
    downloadUrl?: string;
    assetId?: string;
  }
): Promise<void> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const entry: CachedModelBuffer = {
        id,
        name: record.name || "3d_model",
        buffer: record.buffer,
        sourceFileName: record.sourceFileName,
        downloadUrl: record.downloadUrl,
        assetId: record.assetId,
        byteLength: record.buffer.byteLength,
        timestamp: Date.now(),
      };

      const req = store.put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => {
        console.warn("[IndexedDB] Error putting model buffer:", req.error);
        reject(req.error);
      };
    });
  } catch (err) {
    console.warn("[IndexedDB] saveModelBuffer failed:", err);
  }
}

export async function getModelBuffer(idOrUrl: string): Promise<CachedModelBuffer | null> {
  if (!idOrUrl) return null;
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);

      // Try primary key (id)
      const req = store.get(idOrUrl);
      req.onsuccess = () => {
        if (req.result) {
          resolve(req.result);
          return;
        }

        // Try downloadUrl index
        const index = store.index("downloadUrl");
        const idxReq = index.get(idOrUrl);
        idxReq.onsuccess = () => {
          resolve(idxReq.result || null);
        };
        idxReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn("[IndexedDB] getModelBuffer failed:", err);
    return null;
  }
}

export async function deleteModelBuffer(id: string): Promise<void> {
  if (!id) return;
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.warn("[IndexedDB] deleteModelBuffer failed:", err);
  }
}

export async function clearAllModelBuffers(): Promise<void> {
  try {
    const db = await getDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.warn("[IndexedDB] clearAllModelBuffers failed:", err);
  }
}
