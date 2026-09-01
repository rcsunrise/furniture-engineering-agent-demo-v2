import { globalWorkerRegistry } from "./workerRegistry.js";
import { globalWorkerJobStore } from "./workerJobStore.js";

export type TopStatus = "READY" | "BUSY" | "DEGRADED" | "OFFLINE" | "NOT CONFIGURED";
export type LocalWorkerState = "online" | "offline" | "busy";
export type ComfyUIState = "ready" | "offline" | "disabled";
export type Hunyuan3DState = "ready" | "unavailable" | "workflow_invalid";
export type CurrentJobState = "idle" | "queued" | "running" | "completed" | "failed";

export interface SanitizedWorkerStatusData {
  topStatus: TopStatus;
  localWorker: LocalWorkerState;
  comfyUI: ComfyUIState;
  hunyuan3D: Hunyuan3DState;
  currentJob: CurrentJobState;
  lastHeartbeat: string | null;
  capabilities: string[];
  activeWorker: {
    workerId: string;
    name: string;
    version: string;
  } | null;
}

export function getSanitizedWorkerStatus(): SanitizedWorkerStatusData {
  const workers = globalWorkerRegistry.listWorkers();

  if (workers.length === 0) {
    return {
      topStatus: "NOT CONFIGURED",
      localWorker: "offline",
      comfyUI: "offline",
      hunyuan3D: "unavailable",
      currentJob: "idle",
      lastHeartbeat: null,
      capabilities: [],
      activeWorker: null,
    };
  }

  // Get most recently updated worker
  const sortedWorkers = [...workers].sort(
    (a, b) => new Date(b.lastHeartbeatAt).getTime() - new Date(a.lastHeartbeatAt).getTime()
  );
  const worker = sortedWorkers[0];
  const isOnline = globalWorkerRegistry.isWorkerOnline(worker);

  // 1. Local Worker State
  let localWorkerState: LocalWorkerState = "offline";
  if (!isOnline) {
    localWorkerState = "offline";
  } else if (worker.status === "busy") {
    localWorkerState = "busy";
  } else {
    localWorkerState = "online";
  }

  // 2. ComfyUI & Hunyuan3D States
  let comfyUIState: ComfyUIState = "offline";
  let hunyuan3DState: Hunyuan3DState = "unavailable";

  if (!isOnline) {
    comfyUIState = "offline";
    hunyuan3DState = "unavailable";
  } else {
    const hasComfyCap = worker.capabilities.some(
      (c) =>
        c.toLowerCase().includes("comfy") ||
        c.toLowerCase().includes("image_to_mesh") ||
        c.toLowerCase().includes("mesh")
    );
    if (!hasComfyCap) {
      comfyUIState = "disabled";
      hunyuan3DState = "unavailable";
    } else {
      const runtimeDiag = (worker.runtime || {}) as Record<string, any>;
      const rawComfy = runtimeDiag.comfyUIStatus || runtimeDiag.comfyUI || runtimeDiag.comfyui || "ready";
      const comfyLower = String(rawComfy).toLowerCase();
      if (["ready", "offline", "disabled"].includes(comfyLower)) {
        comfyUIState = comfyLower as ComfyUIState;
      } else {
        comfyUIState = "ready";
      }

      const rawHy = runtimeDiag.hunyuan3DStatus || runtimeDiag.hunyuan3D || runtimeDiag.hunyuan3d || (comfyUIState === "ready" ? "ready" : "unavailable");
      const hyLower = String(rawHy).toLowerCase();
      if (["ready", "unavailable", "workflow_invalid"].includes(hyLower)) {
        hunyuan3DState = hyLower as Hunyuan3DState;
      } else if (comfyUIState === "ready") {
        hunyuan3DState = "ready";
      } else {
        hunyuan3DState = "unavailable";
      }
    }
  }

  // 3. Current Job State
  const jobs = globalWorkerJobStore.listJobs();
  let currentJobState: CurrentJobState = "idle";

  const runningJob = jobs.find((j) => j.status === "running" || j.status === "claimed");
  const queuedJob = jobs.find((j) => j.status === "queued");

  if (runningJob) {
    currentJobState = "running";
  } else if (queuedJob) {
    currentJobState = "queued";
  } else if (jobs.length > 0) {
    const sortedJobs = [...jobs].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    const lastJob = sortedJobs[0];
    const ageMs = Date.now() - new Date(lastJob.updatedAt).getTime();
    if (ageMs < 60000) {
      if (lastJob.status === "completed") currentJobState = "completed";
      else if (lastJob.status === "failed") currentJobState = "failed";
    }
  }

  // 4. Top Status Badge State Calculation
  let topStatus: TopStatus;
  if (!isOnline) {
    topStatus = "OFFLINE";
  } else if (localWorkerState === "busy" || currentJobState === "running") {
    topStatus = "BUSY";
  } else if (comfyUIState === "ready" && hunyuan3DState === "ready") {
    topStatus = "READY";
  } else if (comfyUIState === "disabled") {
    topStatus = "NOT CONFIGURED";
  } else {
    topStatus = "DEGRADED";
  }

  return {
    topStatus,
    localWorker: localWorkerState,
    comfyUI: comfyUIState,
    hunyuan3D: hunyuan3DState,
    currentJob: currentJobState,
    lastHeartbeat: worker.lastHeartbeatAt || null,
    capabilities: worker.capabilities || [],
    activeWorker: {
      workerId: worker.workerId,
      name: worker.name,
      version: worker.version,
    },
  };
}
