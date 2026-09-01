import { WorkerHeartbeatRequestSchema } from "../src/shared/workerRuntime.js";
import { globalWorkerRegistry } from "../src/server/worker/workerRegistry.js";
import { getSanitizedWorkerStatus } from "../src/server/worker/workerStatus.js";

console.log("=== G4-2-H1 WORKER HEARTBEAT CONTRACT ALIGNMENT TEST ===");

// 1. Test heartbeat idle parsing & payload validation
console.log("\n1. Testing Heartbeat Idle Parsing...");
const idlePayload = {
  status: "idle",
  timestamp: new Date().toISOString(),
};
const parsedIdle = WorkerHeartbeatRequestSchema.safeParse(idlePayload);
if (!parsedIdle.success || parsedIdle.data.status !== "idle" || parsedIdle.data.activeJobId !== undefined) {
  console.error("   -> FAIL: Heartbeat idle parsing failed:", parsedIdle);
  process.exit(1);
}
console.log("   -> PASS: heartbeat idle parsing succeeded & activeJobId omitted when idle");

// 2. Test heartbeat busy parsing with activeJobId
console.log("\n2. Testing Heartbeat Busy Parsing...");
const busyPayload = {
  status: "busy",
  activeJobId: "job-test-777",
  timestamp: new Date().toISOString(),
};
const parsedBusy = WorkerHeartbeatRequestSchema.safeParse(busyPayload);
if (!parsedBusy.success || parsedBusy.data.status !== "busy" || parsedBusy.data.activeJobId !== "job-test-777") {
  console.error("   -> FAIL: Heartbeat busy parsing failed:", parsedBusy);
  process.exit(1);
}
console.log("   -> PASS: heartbeat busy parsing succeeded & activeJobId present when busy");

// 3. Test rejection of status='online'
console.log("\n3. Testing Rejection of status='online'...");
const onlinePayload = {
  status: "online",
  timestamp: new Date().toISOString(),
};
const parsedOnline = WorkerHeartbeatRequestSchema.safeParse(onlinePayload);
if (parsedOnline.success) {
  console.error("   -> FAIL: WorkerHeartbeatRequestSchema incorrectly accepted status='online'!");
  process.exit(1);
}
console.log("   -> PASS: status=online correctly rejected");

// 4. Test rejection of activeJobId=null
console.log("\n4. Testing Rejection of activeJobId=null...");
const nullJobPayload = {
  status: "idle",
  activeJobId: null,
  timestamp: new Date().toISOString(),
};
const parsedNullJob = WorkerHeartbeatRequestSchema.safeParse(nullJobPayload);
if (parsedNullJob.success) {
  console.error("   -> FAIL: WorkerHeartbeatRequestSchema incorrectly accepted activeJobId=null!");
  process.exit(1);
}
console.log("   -> PASS: activeJobId=null correctly rejected");

// 5. Test provider diagnostics acceptance
console.log("\n5. Testing Provider Diagnostics Acceptance...");
const diagPayload = {
  status: "idle",
  timestamp: new Date().toISOString(),
  providerDiagnostics: {
    comfyUIStatus: "ready",
    hunyuan3DStatus: "ready",
  },
};
const parsedDiag = WorkerHeartbeatRequestSchema.safeParse(diagPayload);
if (!parsedDiag.success || !parsedDiag.data.providerDiagnostics) {
  console.error("   -> FAIL: Provider diagnostics parsing failed:", parsedDiag);
  process.exit(1);
}
console.log("   -> PASS: provider diagnostics accepted");

// 6. Test Real Local Worker Registration & Real Heartbeat Flow
console.log("\n6. Testing Real Local Worker Registration & Real Heartbeat Flow...");
globalWorkerRegistry.clear();

const registeredWorker = globalWorkerRegistry.registerWorker({
  workerId: "worker-win-h1",
  name: "Windows Companion Worker H1",
  version: "1.0.0",
  capabilities: ["image_to_mesh", "comfyui_hunyuan3d"],
  runtime: {
    platform: "win32",
    arch: "x64",
    comfyUIStatus: "ready",
    hunyuan3DStatus: "ready",
  },
});

const hbResult = globalWorkerRegistry.heartbeatWorker("worker-win-h1", {
  status: "idle",
  timestamp: new Date().toISOString(),
  providerDiagnostics: {
    comfyUIStatus: "ready",
    hunyuan3DStatus: "ready",
  },
});

if (!hbResult.isOnline || hbResult.worker.status !== "idle") {
  console.error("   -> FAIL: Real heartbeat failed:", hbResult);
  process.exit(1);
}
console.log("   -> PASS: real Local Worker registration & heartbeat succeeded");

// 7. Test Status Mapping after heartbeat cycle
console.log("\n7. Verifying GET /api/worker/status mappings...");
const sanitizedStatus = getSanitizedWorkerStatus();

if (sanitizedStatus.topStatus !== "READY") {
  console.error("   -> FAIL: Expected topStatus 'READY', got:", sanitizedStatus.topStatus);
  process.exit(1);
}
if (sanitizedStatus.localWorker !== "online") {
  console.error("   -> FAIL: Expected localWorker 'online', got:", sanitizedStatus.localWorker);
  process.exit(1);
}
if (sanitizedStatus.comfyUI !== "ready") {
  console.error("   -> FAIL: Expected comfyUI 'ready', got:", sanitizedStatus.comfyUI);
  process.exit(1);
}
if (sanitizedStatus.hunyuan3D !== "ready") {
  console.error("   -> FAIL: Expected hunyuan3D 'ready', got:", sanitizedStatus.hunyuan3D);
  process.exit(1);
}
if (sanitizedStatus.currentJob !== "idle") {
  console.error("   -> FAIL: Expected currentJob 'idle', got:", sanitizedStatus.currentJob);
  process.exit(1);
}

console.log("   -> PASS: Status mapping verified:");
console.log("      - Local AI = READY");
console.log("      - Local Worker = online");
console.log("      - ComfyUI = ready");
console.log("      - Hunyuan3D = ready");
console.log("      - Current Job = idle");

// Cleanup
globalWorkerRegistry.clear();

console.log("\n=== ALL G4-2-H1 WORKER HEARTBEAT CONTRACT TESTS PASSED ===");
