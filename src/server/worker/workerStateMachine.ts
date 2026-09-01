import type { WorkerJob, WorkerJobStatus } from "../../shared/worker.js";
import { createEngineeringArtifact, type EngineeringArtifact } from "../../shared/artifact.js";

export class IllegalWorkerStateTransitionError extends Error {
  public code = "ILLEGAL_STATE_TRANSITION";
  constructor(public currentStatus: WorkerJobStatus | "none", public targetStatus: WorkerJobStatus, message?: string) {
    super(message || `Illegal state transition from '${currentStatus}' to '${targetStatus}'`);
    this.name = "IllegalWorkerStateTransitionError";
  }
}

const TERMINAL_STATES: Set<WorkerJobStatus> = new Set(["completed", "failed", "cancelled"]);

const ALLOWED_TRANSITIONS: Record<string, WorkerJobStatus[]> = {
  none: ["queued"],
  queued: ["claimed", "cancelled", "failed"],
  claimed: ["running", "cancelled", "failed"],
  running: ["completed", "cancelled", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function isValidTransition(fromStatus: WorkerJobStatus | "none", toStatus: WorkerJobStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

export interface TransitionOptions {
  workerId?: string;
  error?: string;
  reason?: string;
  artifacts?: EngineeringArtifact[];
  timestamp?: string;
}

export function transitionWorkerJob(
  job: WorkerJob,
  nextStatus: WorkerJobStatus,
  options: TransitionOptions = {}
): WorkerJob {
  const currentStatus = job.status;

  if (TERMINAL_STATES.has(currentStatus)) {
    throw new IllegalWorkerStateTransitionError(
      currentStatus,
      nextStatus,
      `Cannot transition job '${job.id}' from terminal state '${currentStatus}' to '${nextStatus}'`
    );
  }

  if (!isValidTransition(currentStatus, nextStatus)) {
    throw new IllegalWorkerStateTransitionError(
      currentStatus,
      nextStatus,
      `Invalid transition for job '${job.id}': '${currentStatus}' -> '${nextStatus}'`
    );
  }

  const now = options.timestamp || new Date().toISOString();
  const updatedStateHistory = [
    ...job.stateHistory,
    {
      from: currentStatus,
      to: nextStatus,
      timestamp: now,
      reason: options.reason || (options.error ? `Error: ${options.error}` : undefined),
    },
  ];

  const updatedAttempts = [...job.attempts];
  let claimedByWorkerId = job.claimedByWorkerId;
  let claimedAt = job.claimedAt;
  let startedAt = job.startedAt;
  let finishedAt = job.finishedAt;

  if (nextStatus === "claimed") {
    claimedByWorkerId = options.workerId || "worker-unknown";
    claimedAt = now;
  } else if (nextStatus === "running") {
    startedAt = now;
    const attemptNumber = updatedAttempts.length + 1;
    updatedAttempts.push({
      attemptNumber,
      startedAt: now,
      workerId: claimedByWorkerId,
      logs: [`Attempt #${attemptNumber} started at ${now}`],
    });
  } else if (nextStatus === "completed" || nextStatus === "failed" || nextStatus === "cancelled") {
    finishedAt = now;
    if (updatedAttempts.length > 0) {
      const lastAttempt = { ...updatedAttempts[updatedAttempts.length - 1] };
      lastAttempt.endedAt = now;
      if (options.error) {
        lastAttempt.error = options.error;
      }
      updatedAttempts[updatedAttempts.length - 1] = lastAttempt;
    }
  }

  // Force productionTruth = false for worker artifacts
  let outputArtifacts = [...job.outputArtifacts];
  if (options.artifacts && options.artifacts.length > 0) {
    const safeArtifacts = options.artifacts.map((art) =>
      createEngineeringArtifact({
        ...art,
        productionTruth: false,
      })
    );
    outputArtifacts = [...outputArtifacts, ...safeArtifacts];
  }

  return {
    ...job,
    status: nextStatus,
    updatedAt: now,
    claimedAt,
    startedAt,
    finishedAt,
    claimedByWorkerId,
    error: options.error ?? (nextStatus === "failed" ? "Job failed" : job.error),
    outputArtifacts,
    attempts: updatedAttempts,
    stateHistory: updatedStateHistory,
  };
}
