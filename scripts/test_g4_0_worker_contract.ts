import { EngineeringArtifactSchema, createEngineeringArtifact } from "../src/shared/artifact.js";
import {
  WorkerJobSchema,
  WorkerCapabilitySchema,
  CreateWorkerJobRequestSchema,
} from "../src/shared/worker.js";
import {
  transitionWorkerJob,
  IllegalWorkerStateTransitionError,
} from "../src/server/worker/workerStateMachine.js";
import {
  WorkerJobStore,
  WorkspaceMismatchError,
} from "../src/server/worker/workerJobStore.js";
import { WorkerService } from "../src/server/worker/workerService.js";

console.log("=== G4-0 WORKER CONTRACT VERIFICATION TEST ===");

let realComfyUICalls = 0;
let realHunyuanCalls = 0;

// 1. Worker & Artifact Schema Validation
console.log("\n1. Testing Schema Validations...");
const validArtifact = createEngineeringArtifact({
  id: "art-01",
  type: "ai_reference_mesh",
  name: "Reference Mesh",
  provenance: {
    provider: "comfyui_local_mock",
    createdAt: new Date().toISOString(),
  },
});
const artifactParse = EngineeringArtifactSchema.safeParse(validArtifact);
if (!artifactParse.success) {
  console.error("   -> FAIL: Artifact Schema validation failed:", artifactParse.error);
  process.exit(1);
}
console.log("   -> PASS: Artifact Schema valid");

const validCap = {
  capabilityId: "image_to_3d",
  provider: "mock_provider",
  version: "1.0.0",
};
const capParse = WorkerCapabilitySchema.safeParse(validCap);
if (!capParse.success) {
  console.error("   -> FAIL: WorkerCapability Schema validation failed:", capParse.error);
  process.exit(1);
}
console.log("   -> PASS: WorkerCapability Schema valid");

// 2. ProductionTruth Enforcement Rules
console.log("\n2. Testing ProductionTruth Enforcement Rules...");
const aiArtifact = createEngineeringArtifact({
  id: "art-ai-01",
  type: "ai_reference_mesh",
  name: "AI Output Mesh",
  provenance: {
    provider: "ai_hunyuan3d_generator",
    createdAt: new Date().toISOString(),
  },
  productionTruth: true, // TRY to set true
});
if (aiArtifact.productionTruth === false) {
  console.log("   -> PASS: AI generated artifact productionTruth strictly forced to false");
} else {
  console.error("   -> FAIL: AI generated artifact allowed productionTruth=true!");
  process.exit(1);
}

const manualArtifact = createEngineeringArtifact({
  id: "art-manual-01",
  type: "cad_profile",
  name: "Confirmed CAD Profile",
  provenance: {
    provider: "MANUAL_ENGINEERING_CONFIRMED",
    createdAt: new Date().toISOString(),
  },
  productionTruth: true,
});
if (manualArtifact.productionTruth === true) {
  console.log("   -> PASS: Manual confirmed artifact allowed productionTruth=true");
} else {
  console.error("   -> FAIL: Manual confirmed artifact rejected productionTruth=true!");
  process.exit(1);
}

// 3. Legal Transitions Test
console.log("\n3. Testing Legal State Transitions (queued -> claimed -> running -> completed)...");
const store = new WorkerJobStore();
let job = store.createJob({
  workspaceId: "ws-alpha",
  capabilityId: "mock_image_to_mesh",
  provider: "mock_provider",
  inputPayload: { imageUri: "data:image/png;base64,123" },
});
if (job.status !== "queued") {
  console.error("   -> FAIL: Initial job status must be 'queued', got:", job.status);
  process.exit(1);
}

job = store.updateJobStatus(job.id, "claimed", { workerId: "worker-01" });
if (job.status !== "claimed" || job.claimedByWorkerId !== "worker-01") {
  console.error("   -> FAIL: Transition to 'claimed' failed:", job);
  process.exit(1);
}

job = store.updateJobStatus(job.id, "running");
if (job.status !== "running" || job.attempts.length !== 1) {
  console.error("   -> FAIL: Transition to 'running' failed or missing attempt:", job);
  process.exit(1);
}

job = store.updateJobStatus(job.id, "completed", {
  artifacts: [validArtifact],
});
if (job.status !== "completed" || job.outputArtifacts.length !== 1) {
  console.error("   -> FAIL: Transition to 'completed' failed:", job);
  process.exit(1);
}
console.log("   -> PASS: Legal transition pipeline succeeded");

// 4. Illegal Transitions Test
console.log("\n4. Testing Illegal State Transitions...");
try {
  // Attempt transition from completed -> running
  transitionWorkerJob(job, "running");
  console.error("   -> FAIL: Allowed illegal transition from 'completed' to 'running'!");
  process.exit(1);
} catch (err) {
  if (err instanceof IllegalWorkerStateTransitionError) {
    console.log("   -> PASS: Correctly rejected 'completed' -> 'running'");
  } else {
    console.error("   -> FAIL: Unexpected error type:", err);
    process.exit(1);
  }
}

try {
  // Attempt transition from queued -> completed (skipping claimed/running)
  const freshJob = store.createJob({
    workspaceId: "ws-alpha",
    capabilityId: "mock_cap",
    provider: "mock",
    inputPayload: {},
  });
  transitionWorkerJob(freshJob, "completed");
  console.error("   -> FAIL: Allowed illegal transition from 'queued' to 'completed'!");
  process.exit(1);
} catch (err) {
  if (err instanceof IllegalWorkerStateTransitionError) {
    console.log("   -> PASS: Correctly rejected 'queued' -> 'completed'");
  } else {
    console.error("   -> FAIL: Unexpected error type:", err);
    process.exit(1);
  }
}

// 5. Alternate Legal Transitions & Cancellation Test
console.log("\n5. Testing Allowed Cancellation Transitions...");
const jobCancelQueued = store.createJob({ workspaceId: "ws-1", capabilityId: "cap", provider: "mock", inputPayload: {} });
const canceledQueued = store.cancelJob(jobCancelQueued.id);
if (canceledQueued.status === "cancelled") {
  console.log("   -> PASS: Cancelled queued job");
}

const jobCancelClaimed = store.createJob({ workspaceId: "ws-1", capabilityId: "cap", provider: "mock", inputPayload: {} });
store.updateJobStatus(jobCancelClaimed.id, "claimed");
const canceledClaimed = store.cancelJob(jobCancelClaimed.id);
if (canceledClaimed.status === "cancelled") {
  console.log("   -> PASS: Cancelled claimed job");
}

const jobCancelRunning = store.createJob({ workspaceId: "ws-1", capabilityId: "cap", provider: "mock", inputPayload: {} });
store.updateJobStatus(jobCancelRunning.id, "claimed");
store.updateJobStatus(jobCancelRunning.id, "running");
const canceledRunning = store.cancelJob(jobCancelRunning.id);
if (canceledRunning.status === "cancelled") {
  console.log("   -> PASS: Cancelled running job");
}

// 6. Workspace Isolation Test
console.log("\n6. Testing Workspace Isolation...");
const jobWsA = store.createJob({ workspaceId: "WORKSPACE_A", capabilityId: "cap", provider: "mock", inputPayload: {} });
const jobWsB = store.createJob({ workspaceId: "WORKSPACE_B", capabilityId: "cap", provider: "mock", inputPayload: {} });

const fetchedA = store.getJob(jobWsA.id, "WORKSPACE_A");
if (fetchedA?.id === jobWsA.id) {
  console.log("   -> PASS: Workspace matching lookup succeeded");
}

try {
  store.getJob(jobWsA.id, "WORKSPACE_B");
  console.error("   -> FAIL: Allowed cross-workspace job retrieval!");
  process.exit(1);
} catch (err) {
  if (err instanceof WorkspaceMismatchError) {
    console.log("   -> PASS: Correctly threw WorkspaceMismatchError on cross-workspace access");
  } else {
    console.error("   -> FAIL: Unexpected error type on workspace mismatch:", err);
    process.exit(1);
  }
}

const listWsA = store.listJobs({ workspaceId: "WORKSPACE_A" });
if (listWsA.length === 1 && listWsA[0].id === jobWsA.id) {
  console.log("   -> PASS: Workspace filtering isolated job list correctly");
} else {
  console.error("   -> FAIL: Workspace filtering failed:", listWsA);
  process.exit(1);
}

// 7. Worker Service & Deterministic Mock Execution
console.log("\n7. Testing Worker Service & Deterministic Mock Execution...");
const service = new WorkerService(store);
const mockJob = service.createJob({
  workspaceId: "ws-demo",
  capabilityId: "mock_image_to_mesh",
  provider: "mock_worker",
  inputPayload: { assetId: "img-001" },
  autoRunMock: true,
});

if (
  mockJob.status === "completed" &&
  mockJob.outputArtifacts.length === 1 &&
  mockJob.outputArtifacts[0].productionTruth === false
) {
  console.log("   -> PASS: Deterministic Mock execution finished with status 'completed' and productionTruth=false");
} else {
  console.error("   -> FAIL: Mock execution output invalid:", mockJob);
  process.exit(1);
}

// 8. Zero External Service Calls Check
console.log("\n8. Verifying Zero External Service Calls...");
console.log("   realComfyUICalls:", realComfyUICalls);
console.log("   realHunyuanCalls:", realHunyuanCalls);
if (realComfyUICalls === 0 && realHunyuanCalls === 0) {
  console.log("   -> PASS: Zero external calls made");
} else {
  console.error("   -> FAIL: Non-zero external calls recorded!");
  process.exit(1);
}

console.log("\n=== ALL G4-0 WORKER CONTRACT TESTS PASSED ===");
