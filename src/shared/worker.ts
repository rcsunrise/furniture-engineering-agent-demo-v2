import { z } from "zod";
import { EngineeringArtifactSchema, type EngineeringArtifact } from "./artifact.js";

export type WorkerJobStatus =
  | "queued"
  | "claimed"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export const WorkerJobStatusSchema = z.enum([
  "queued",
  "claimed",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export interface WorkerCapability {
  capabilityId: string;
  provider: string;
  version: string;
  description?: string;
  maxConcurrentJobs?: number;
}

export const WorkerCapabilitySchema = z.object({
  capabilityId: z.string(),
  provider: z.string(),
  version: z.string(),
  description: z.string().optional(),
  maxConcurrentJobs: z.number().optional(),
});

export interface WorkerAttempt {
  attemptNumber: number;
  startedAt: string;
  endedAt?: string;
  workerId?: string;
  error?: string;
  logs?: string[];
}

export const WorkerAttemptSchema = z.object({
  attemptNumber: z.number(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  workerId: z.string().optional(),
  error: z.string().optional(),
  logs: z.array(z.string()).optional(),
});

export interface WorkerJobStateTransition {
  from: WorkerJobStatus | "none";
  to: WorkerJobStatus;
  timestamp: string;
  reason?: string;
}

export const WorkerJobStateTransitionSchema = z.object({
  from: z.enum(["none", "queued", "claimed", "running", "completed", "failed", "cancelled"]),
  to: WorkerJobStatusSchema,
  timestamp: z.string(),
  reason: z.string().optional(),
});

export interface WorkerJob {
  id: string;
  workspaceId: string;
  capabilityId: string;
  provider: string;
  status: WorkerJobStatus;
  inputPayload: Record<string, unknown>;
  outputArtifacts: EngineeringArtifact[];
  error?: string;
  createdAt: string;
  updatedAt: string;
  claimedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  claimedByWorkerId?: string;
  attempts: WorkerAttempt[];
  stateHistory: WorkerJobStateTransition[];
}

export const WorkerJobSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  capabilityId: z.string(),
  provider: z.string(),
  status: WorkerJobStatusSchema,
  inputPayload: z.record(z.string(), z.unknown()),
  outputArtifacts: z.array(EngineeringArtifactSchema),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  claimedAt: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  claimedByWorkerId: z.string().optional(),
  attempts: z.array(WorkerAttemptSchema),
  stateHistory: z.array(WorkerJobStateTransitionSchema),
});

export interface CreateWorkerJobRequest {
  workspaceId: string;
  capabilityId: string;
  provider: string;
  inputPayload: Record<string, unknown>;
  autoRunMock?: boolean;
}

export const CreateWorkerJobRequestSchema = z.object({
  workspaceId: z.string().min(1, "workspaceId is required"),
  capabilityId: z.string().min(1, "capabilityId is required"),
  provider: z.string().min(1, "provider is required"),
  inputPayload: z.record(z.string(), z.unknown()).default({}),
  autoRunMock: z.boolean().optional(),
});
