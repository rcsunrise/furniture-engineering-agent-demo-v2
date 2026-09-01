import { executeComfyHunyuan3dTask, ComfyExecutorOptions } from "./adapters/comfyExecutor.js";
import { ComfyAdapterError } from "./adapters/comfyClient.js";
import { createEngineeringArtifact, type EngineeringArtifact } from "../../src/shared/artifact.js";

export interface ExecutionResult {
  success: boolean;
  outputArtifacts?: EngineeringArtifact[];
  error?: string;
}

export async function executeDeterministicMockTask(
  job: any,
  workerId: string
): Promise<ExecutionResult> {
  // Ensure NO real ComfyUI / Hunyuan3D calls are made in deterministic mock
  const inputCount = Object.keys(job.inputPayload || {}).length;

  const mockArtifact = createEngineeringArtifact({
    id: `art-local-${Date.now()}-mesh`,
    type: "ai_reference_mesh",
    name: "Local Companion Mock Mesh",
    uri: `data:application/json;base64,${Buffer.from(
      JSON.stringify({
        mock: true,
        inputArtifactCount: inputCount,
        workerId,
        jobId: job.id,
        kind: "ai_reference_mesh",
        format: "json",
        source: "local_worker_mock",
      })
    ).toString("base64")}`,
    provenance: {
      provider: "local_worker_mock",
      workflowVersion: "g4-1-local-runtime-mock-v1",
      createdAt: new Date().toISOString(),
    },
    productionTruth: false,
  });

  return {
    success: true,
    outputArtifacts: [mockArtifact],
  };
}

export async function executeJobTask(
  job: any,
  workerId: string,
  options: ComfyExecutorOptions = {}
): Promise<ExecutionResult> {
  const provider = (job.provider || "").toLowerCase();

  if (provider === "comfyui_hunyuan3d" || provider === "comfyui" || provider === "hunyuan3d") {
    // Route to ComfyUI Hunyuan3D adapter (throws structured ComfyAdapterError on failure, no silent fallback to mock)
    return await executeComfyHunyuan3dTask(job, workerId, options);
  }

  // Default dispatcher route: deterministic mock
  return await executeDeterministicMockTask(job, workerId);
}
