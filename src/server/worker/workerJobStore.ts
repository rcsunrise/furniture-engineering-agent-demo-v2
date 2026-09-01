import type {
  WorkerJob,
  WorkerJobStatus,
  CreateWorkerJobRequest,
} from "../../shared/worker.js";
import {
  transitionWorkerJob,
  type TransitionOptions,
} from "./workerStateMachine.js";

export class WorkspaceMismatchError extends Error {
  public code = "WORKSPACE_MISMATCH";
  constructor(jobId: string, expectedWorkspace: string, actualWorkspace: string) {
    super(`Job '${jobId}' belongs to workspace '${actualWorkspace}', not '${expectedWorkspace}'`);
    this.name = "WorkspaceMismatchError";
  }
}

export class JobNotFoundError extends Error {
  public code = "JOB_NOT_FOUND";
  constructor(jobId: string) {
    super(`Worker job '${jobId}' not found`);
    this.name = "JobNotFoundError";
  }
}

export class WorkerJobStore {
  private jobs = new Map<string, WorkerJob>();
  private counter = 1;

  public createJob(request: CreateWorkerJobRequest): WorkerJob {
    const now = new Date().toISOString();
    const jobId = `job-${Date.now()}-${this.counter++}`;

    const newJob: WorkerJob = {
      id: jobId,
      workspaceId: request.workspaceId,
      capabilityId: request.capabilityId,
      provider: request.provider,
      status: "queued",
      inputPayload: request.inputPayload || {},
      outputArtifacts: [],
      createdAt: now,
      updatedAt: now,
      attempts: [],
      stateHistory: [
        {
          from: "none",
          to: "queued",
          timestamp: now,
          reason: "Job created",
        },
      ],
    };

    this.jobs.set(jobId, newJob);
    return newJob;
  }

  public getJob(jobId: string, workspaceId?: string): WorkerJob | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    if (workspaceId && job.workspaceId !== workspaceId) {
      throw new WorkspaceMismatchError(jobId, workspaceId, job.workspaceId);
    }
    return job;
  }

  public listJobs(filter?: { workspaceId?: string; status?: WorkerJobStatus }): WorkerJob[] {
    let result = Array.from(this.jobs.values());
    if (filter?.workspaceId) {
      result = result.filter((j) => j.workspaceId === filter.workspaceId);
    }
    if (filter?.status) {
      result = result.filter((j) => j.status === filter.status);
    }
    // Return sorted by createdAt descending
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public updateJobStatus(
    jobId: string,
    nextStatus: WorkerJobStatus,
    options: TransitionOptions = {},
    workspaceId?: string
  ): WorkerJob {
    const job = this.getJob(jobId, workspaceId);
    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    const updated = transitionWorkerJob(job, nextStatus, options);
    this.jobs.set(jobId, updated);
    return updated;
  }

  public cancelJob(jobId: string, workspaceId?: string, reason?: string): WorkerJob {
    return this.updateJobStatus(
      jobId,
      "cancelled",
      { reason: reason || "User requested cancellation" },
      workspaceId
    );
  }

  public clear(): void {
    this.jobs.clear();
    this.counter = 1;
  }
}

export const globalWorkerJobStore = new WorkerJobStore();
