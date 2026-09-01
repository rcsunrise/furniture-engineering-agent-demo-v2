import { z } from "zod";
import { EngineeringArtifactSchema, type EngineeringArtifact } from "./artifact.js";

export type WorkerExecutionStatus = "idle" | "busy";
export type WorkerStatus = WorkerExecutionStatus;

export const WorkerExecutionStatusSchema = z.enum(["idle", "busy"]);
export const WorkerStatusSchema = WorkerExecutionStatusSchema;

export interface WorkerInstance {
  workerId: string;
  name: string;
  version: string;
  capabilities: string[];
  runtime: Record<string, unknown>;
  status: WorkerExecutionStatus;
  registeredAt: string;
  lastHeartbeatAt: string;
  activeJobId?: string;
}

export const WorkerInstanceSchema = z.object({
  workerId: z.string(),
  name: z.string(),
  version: z.string(),
  capabilities: z.array(z.string()),
  runtime: z.record(z.string(), z.unknown()),
  status: WorkerExecutionStatusSchema,
  registeredAt: z.string(),
  lastHeartbeatAt: z.string(),
  activeJobId: z.string().optional(),
});

export interface WorkerRegistrationRequest {
  workerId: string;
  name: string;
  version: string;
  capabilities: string[];
  runtime?: Record<string, unknown>;
}

export const WorkerRegistrationRequestSchema = z.object({
  workerId: z.string().min(1, "workerId is required"),
  name: z.string().min(1, "name is required"),
  version: z.string().default("1.0.0"),
  capabilities: z.array(z.string()).min(1, "at least one capability required"),
  runtime: z.record(z.string(), z.unknown()).default({}),
});

export interface WorkerHeartbeatRequest {
  status: WorkerExecutionStatus;
  activeJobId?: string;
  timestamp?: string;
  providerDiagnostics?: Record<string, unknown>;
}

export const WorkerHeartbeatRequestSchema = z.object({
  status: WorkerExecutionStatusSchema,
  activeJobId: z.string().min(1, "activeJobId must be a non-empty string").optional(),
  timestamp: z.string().optional(),
  providerDiagnostics: z.record(z.string(), z.unknown()).optional(),
});

export interface WorkerLease {
  jobId: string;
  workerId: string;
  claimedAt: string;
  leaseExpiresAt: string;
}

export const WorkerLeaseSchema = z.object({
  jobId: z.string(),
  workerId: z.string(),
  claimedAt: z.string(),
  leaseExpiresAt: z.string(),
});

export interface WorkerJobResultRequest {
  status: "completed" | "failed";
  outputArtifacts?: EngineeringArtifact[];
  error?: string;
}

export const WorkerJobResultRequestSchema = z.object({
  status: z.enum(["completed", "failed"]),
  outputArtifacts: z.array(EngineeringArtifactSchema).optional(),
  error: z.string().optional(),
}).strict();
