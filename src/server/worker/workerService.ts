import {
  globalWorkerJobStore,
  WorkerJobStore,
} from "./workerJobStore.js";
import type {
  WorkerJob,
  WorkerJobStatus,
  CreateWorkerJobRequest,
  WorkerCapability,
} from "../../shared/worker.js";
import { createEngineeringArtifact } from "../../shared/artifact.js";

export class WorkerService {
  constructor(private store: WorkerJobStore = globalWorkerJobStore) {}

  public getSupportedCapabilities(): WorkerCapability[] {
    return [
      {
        capabilityId: "mock_image_to_mesh",
        provider: "mock_worker",
        version: "1.0.0",
        description: "Deterministic mock 3D mesh generator for testing contract compliance",
        maxConcurrentJobs: 5,
      },
      {
        capabilityId: "mock_cad_vectorizer",
        provider: "mock_worker",
        version: "1.0.0",
        description: "Deterministic mock CAD profile vectorizer",
        maxConcurrentJobs: 5,
      },
    ];
  }

  public createJob(request: CreateWorkerJobRequest): WorkerJob {
    const job = this.store.createJob(request);

    if (request.autoRunMock) {
      this.runDeterministicMockExecution(job.id);
    }

    return this.store.getJob(job.id)!;
  }

  public getJob(jobId: string, workspaceId?: string): WorkerJob | null {
    return this.store.getJob(jobId, workspaceId);
  }

  public listJobs(filter?: { workspaceId?: string; status?: WorkerJobStatus }): WorkerJob[] {
    return this.store.listJobs(filter);
  }

  public cancelJob(jobId: string, workspaceId?: string, reason?: string): WorkerJob {
    return this.store.cancelJob(jobId, workspaceId, reason);
  }

  public runDeterministicMockExecution(jobId: string, workerId = "worker-mock-01"): WorkerJob {
    let job = this.store.getJob(jobId);
    if (!job) {
      throw new Error(`Job '${jobId}' not found for mock execution`);
    }

    // 1. Transition queued -> claimed
    job = this.store.updateJobStatus(jobId, "claimed", { workerId });

    // 2. Transition claimed -> running
    job = this.store.updateJobStatus(jobId, "running", { workerId });

    // 3. Create mock artifact with productionTruth forced to false
    const mockArtifact = createEngineeringArtifact({
      id: `art-${Date.now()}-mesh`,
      type: "ai_reference_mesh",
      name: "Mock AI Reference Mesh",
      uri: `data:model/gltf-binary;base64,mockMeshContentForJob_${jobId}`,
      provenance: {
        provider: job.provider,
        workflowVersion: "mock-v1",
        modelOrCheckpoint: "mock-mesh-generator",
        createdAt: new Date().toISOString(),
      },
      // Explicitly set false (will be enforced as false anyway)
      productionTruth: false,
    });

    // 4. Transition running -> completed
    job = this.store.updateJobStatus(jobId, "completed", {
      workerId,
      artifacts: [mockArtifact],
    });

    return job;
  }
}

export const globalWorkerService = new WorkerService();
