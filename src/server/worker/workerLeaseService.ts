import type { WorkerLease } from "../../shared/workerRuntime.js";

export class LeaseConflictError extends Error {
  public code = "LEASE_CONFLICT";
  constructor(jobId: string, activeWorkerId: string) {
    super(`Job '${jobId}' already has an active lease owned by worker '${activeWorkerId}'`);
    this.name = "LeaseConflictError";
  }
}

export class WorkerLeaseService {
  private leases = new Map<string, WorkerLease>();
  private defaultLeaseDurationMs = 60000; // 60s default lease

  public createLease(jobId: string, workerId: string, durationMs?: number): WorkerLease {
    const existing = this.leases.get(jobId);
    if (existing && this.isLeaseActive(existing) && existing.workerId !== workerId) {
      throw new LeaseConflictError(jobId, existing.workerId);
    }

    const now = new Date();
    const duration = durationMs ?? this.defaultLeaseDurationMs;
    const expiresAt = new Date(now.getTime() + duration);

    const lease: WorkerLease = {
      jobId,
      workerId,
      claimedAt: now.toISOString(),
      leaseExpiresAt: expiresAt.toISOString(),
    };

    this.leases.set(jobId, lease);
    return lease;
  }

  public getLease(jobId: string): WorkerLease | null {
    return this.leases.get(jobId) || null;
  }

  public isLeaseActive(lease: WorkerLease): boolean {
    const expiresAt = new Date(lease.leaseExpiresAt).getTime();
    return !isNaN(expiresAt) && Date.now() < expiresAt;
  }

  public hasActiveLease(jobId: string): boolean {
    const lease = this.leases.get(jobId);
    if (!lease) return false;
    return this.isLeaseActive(lease);
  }

  public releaseLease(jobId: string, workerId?: string): boolean {
    const lease = this.leases.get(jobId);
    if (!lease) return false;
    if (workerId && lease.workerId !== workerId) {
      return false;
    }
    this.leases.delete(jobId);
    return true;
  }

  public getDiagnosticLeaseReport(): Array<{ lease: WorkerLease; isExpired: boolean }> {
    return Array.from(this.leases.values()).map((lease) => ({
      lease,
      isExpired: !this.isLeaseActive(lease),
    }));
  }

  public clear(): void {
    this.leases.clear();
  }
}

export const globalWorkerLeaseService = new WorkerLeaseService();
