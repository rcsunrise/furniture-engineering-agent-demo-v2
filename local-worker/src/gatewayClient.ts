import type { LocalWorkerConfig } from "./config.js";
import {
  WorkerJobResultRequestSchema,
  type WorkerJobResultRequest,
} from "../../src/shared/workerRuntime.js";
import type { EngineeringArtifact } from "../../src/shared/artifact.js";

export class GatewayClient {
  constructor(private config: LocalWorkerConfig) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.config.gatewayUrl.replace(/\/$/, "")}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-worker-token": this.config.workerToken,
      ...(options.headers as Record<string, string>),
    };

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      let errBody: any;
      try {
        errBody = await res.json();
      } catch {
        errBody = { message: await res.text() };
      }
      const msg = errBody?.error?.message || errBody?.message || res.statusText;
      const code = errBody?.error?.code || res.status;
      const error = new Error(`Gateway Error [${code}]: ${msg}`);
      (error as any).status = res.status;
      (error as any).code = code;
      throw error;
    }

    return res.json() as Promise<T>;
  }

  public async register(): Promise<{ worker: any; heartbeatIntervalMs: number }> {
    return this.request("/api/worker/runtime/register", {
      method: "POST",
      body: JSON.stringify({
        workerId: this.config.workerId,
        name: this.config.workerName,
        version: this.config.workerVersion,
        capabilities: this.config.capabilities,
        runtime: {
          platform: "win32",
          arch: "x64",
          nodeVersion: process.version,
          companionType: "standalone_local_worker",
        },
      }),
    });
  }

  public async sendHeartbeat(
    status: "idle" | "busy",
    activeJobId?: string,
    providerDiagnostics?: Record<string, unknown>
  ): Promise<any> {
    const payload: Record<string, any> = {
      status,
      timestamp: new Date().toISOString(),
    };
    if (activeJobId && activeJobId.trim().length > 0) {
      payload.activeJobId = activeJobId;
    }
    if (providerDiagnostics) {
      payload.providerDiagnostics = providerDiagnostics;
    }
    return this.request(`/api/worker/runtime/${encodeURIComponent(this.config.workerId)}/heartbeat`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async getNextJob(): Promise<{ job: any | null }> {
    return this.request(`/api/worker/runtime/${encodeURIComponent(this.config.workerId)}/jobs/next`, {
      method: "GET",
    });
  }

  public async claimJob(jobId: string): Promise<any> {
    return this.request(`/api/worker/runtime/${encodeURIComponent(this.config.workerId)}/jobs/${encodeURIComponent(jobId)}/claim`, {
      method: "POST",
    });
  }

  public async startJob(jobId: string): Promise<any> {
    return this.request(`/api/worker/runtime/${encodeURIComponent(this.config.workerId)}/jobs/${encodeURIComponent(jobId)}/start`, {
      method: "POST",
    });
  }

  public async reportResult(
    jobId: string,
    status: "completed" | "failed",
    outputArtifacts?: EngineeringArtifact[],
    error?: string
  ): Promise<any> {
    const rawPayload: WorkerJobResultRequest = {
      status,
      outputArtifacts,
      error,
    };

    // Requirement 3: Local pre-send validation
    const parseResult = WorkerJobResultRequestSchema.safeParse(rawPayload);
    if (!parseResult.success) {
      const details = parseResult.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        code: issue.code,
        message: issue.message,
      }));
      console.error(
        `[LocalWorker] Local pre-send validation failed for job '${jobId}' result:`,
        JSON.stringify(details, null, 2)
      );
      const err = new Error(
        `[LOCAL_RESULT_VALIDATION_FAILED] Invalid worker job result payload: ${JSON.stringify(details)}`
      );
      (err as any).code = "INVALID_RESULT_PAYLOAD";
      (err as any).details = details;
      throw err;
    }

    const payload = parseResult.data;
    console.log("[G4-3-R3][RESULT_SCHEMA_VALID]");

    return this.request(
      `/api/worker/runtime/${encodeURIComponent(this.config.workerId)}/jobs/${encodeURIComponent(jobId)}/result`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  public async uploadArtifact(data: {
    fileName: string;
    fileData: string;
    jobId?: string;
    partId?: string;
    sku?: string;
    provider?: string;
    workflowVersion?: string;
    modelOrCheckpoint?: string;
    seed?: number;
  }): Promise<{ success: boolean; url: string; artifactId: string; fileBytes: number; artifact: EngineeringArtifact }> {
    return this.request("/api/worker/artifacts/upload", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}
