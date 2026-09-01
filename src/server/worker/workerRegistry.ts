import type {
  WorkerInstance,
  WorkerRegistrationRequest,
  WorkerHeartbeatRequest,
} from "../../shared/workerRuntime.js";

export class UnknownWorkerError extends Error {
  public code = "UNKNOWN_WORKER";
  constructor(workerId: string) {
    super(`Worker '${workerId}' is not registered`);
    this.name = "UnknownWorkerError";
  }
}

export class WorkerRegistry {
  private workers = new Map<string, WorkerInstance>();
  private defaultHeartbeatTimeoutMs = 15000; // 15 seconds

  public registerWorker(req: WorkerRegistrationRequest): WorkerInstance {
    const now = new Date().toISOString();
    const instance: WorkerInstance = {
      workerId: req.workerId,
      name: req.name,
      version: req.version || "1.0.0",
      capabilities: req.capabilities,
      runtime: req.runtime || {},
      status: "idle",
      registeredAt: now,
      lastHeartbeatAt: now,
    };

    this.workers.set(req.workerId, instance);
    return instance;
  }

  public heartbeatWorker(
    workerId: string,
    req: WorkerHeartbeatRequest
  ): { worker: WorkerInstance; isOnline: boolean } {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new UnknownWorkerError(workerId);
    }

    const now = req.timestamp || new Date().toISOString();
    const updated: WorkerInstance = {
      ...worker,
      status: req.status,
      activeJobId: req.activeJobId,
      lastHeartbeatAt: now,
    };

    this.workers.set(workerId, updated);
    return {
      worker: updated,
      isOnline: true,
    };
  }

  public getWorker(workerId: string): WorkerInstance | null {
    const worker = this.workers.get(workerId);
    if (!worker) return null;
    return worker;
  }

  public isWorkerOnline(workerIdOrInstance: string | WorkerInstance, timeoutMs?: number): boolean {
    const worker = typeof workerIdOrInstance === "string" ? this.getWorker(workerIdOrInstance) : workerIdOrInstance;
    if (!worker) return false;

    const timeout = timeoutMs ?? this.defaultHeartbeatTimeoutMs;
    const lastHb = new Date(worker.lastHeartbeatAt).getTime();
    const now = Date.now();

    if (isNaN(lastHb)) return false;
    return now - lastHb <= timeout;
  }

  public listWorkers(): WorkerInstance[] {
    return Array.from(this.workers.values());
  }

  public clear(): void {
    this.workers.clear();
  }
}

export const globalWorkerRegistry = new WorkerRegistry();
