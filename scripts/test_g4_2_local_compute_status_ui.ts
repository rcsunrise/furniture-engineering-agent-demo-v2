import { globalWorkerRegistry } from "../src/server/worker/workerRegistry.js";
import { globalWorkerJobStore } from "../src/server/worker/workerJobStore.js";
import { getSanitizedWorkerStatus } from "../src/server/worker/workerStatus.js";

console.log("=== G4-2 LOCAL COMPUTE STATUS & UI VERIFICATION TEST ===");

// 1. Test Unconfigured State (No Workers)
console.log("\n1. Testing Unconfigured / Initial State (No Workers Registered)...");
globalWorkerRegistry.clear();
const initialStatus = getSanitizedWorkerStatus();

if (initialStatus.topStatus !== "NOT CONFIGURED") {
  console.error("   -> FAIL: Initial topStatus should be 'NOT CONFIGURED', got:", initialStatus.topStatus);
  process.exit(1);
}
if (initialStatus.localWorker !== "offline" || initialStatus.comfyUI !== "offline" || initialStatus.hunyuan3D !== "unavailable") {
  console.error("   -> FAIL: Initial sub-statuses incorrect:", initialStatus);
  process.exit(1);
}
console.log("   -> PASS: Correctly returned 'NOT CONFIGURED' for empty worker registry");

// 2. Test Registered & Online Worker (Ready State)
console.log("\n2. Testing Registered & Online Worker (Ready State)...");
globalWorkerRegistry.registerWorker({
  workerId: "worker-win-test",
  name: "Windows Local Worker Test",
  version: "1.0.0",
  capabilities: ["image_to_mesh", "comfyui_hunyuan3d"],
  runtime: {
    platform: "win32",
    arch: "x64",
    comfyUIStatus: "ready",
    hunyuan3DStatus: "ready",
    LOCAL_WORKER_TOKEN: "SECRET_TOKEN_12345", // sensitive field to verify stripping
    apiKey: "sk-secret-key-abc", // sensitive field to verify stripping
    tempPath: "C:\\Users\\admin\\AppData\\Local\\Temp", // sensitive path to verify stripping
  },
});

const readyStatus = getSanitizedWorkerStatus();

if (readyStatus.topStatus !== "READY") {
  console.error("   -> FAIL: Expected topStatus 'READY', got:", readyStatus.topStatus);
  process.exit(1);
}
if (readyStatus.localWorker !== "online") {
  console.error("   -> FAIL: Expected localWorker 'online', got:", readyStatus.localWorker);
  process.exit(1);
}
if (readyStatus.comfyUI !== "ready" || readyStatus.hunyuan3D !== "ready") {
  console.error("   -> FAIL: Expected comfyUI 'ready' and hunyuan3D 'ready', got:", readyStatus);
  process.exit(1);
}
console.log("   -> PASS: Correctly returned 'READY' for active online worker");

// 3. Test Security Sanitization Rules
console.log("\n3. Testing Security Sanitization (Zero Tokens, Keys, Filesystem Paths)...");
const rawJson = JSON.stringify(readyStatus);

if (rawJson.includes("SECRET_TOKEN_12345") || rawJson.includes("sk-secret-key-abc")) {
  console.error("   -> FAIL: Sanitized status leaked secret tokens or API keys!");
  process.exit(1);
}
if (rawJson.includes("C:\\Users\\admin") || rawJson.includes("AppData")) {
  console.error("   -> FAIL: Sanitized status leaked local filesystem paths!");
  process.exit(1);
}
console.log("   -> PASS: Zero tokens, API keys, or filesystem paths leaked");

// 4. Test Busy State (Worker Running Job)
console.log("\n4. Testing Busy State (Worker Executing Job)...");
globalWorkerRegistry.heartbeatWorker("worker-win-test", {
  status: "busy",
  activeJobId: "job-999",
  timestamp: new Date().toISOString(),
});

const busyStatus = getSanitizedWorkerStatus();

if (busyStatus.topStatus !== "BUSY") {
  console.error("   -> FAIL: Expected topStatus 'BUSY', got:", busyStatus.topStatus);
  process.exit(1);
}
if (busyStatus.localWorker !== "busy") {
  console.error("   -> FAIL: Expected localWorker 'busy', got:", busyStatus.localWorker);
  process.exit(1);
}
console.log("   -> PASS: Correctly returned 'BUSY' for worker running active job");

// 5. Test Offline Timeout State
console.log("\n5. Testing Offline Timeout State...");
const staleWorker = globalWorkerRegistry.getWorker("worker-win-test");
if (staleWorker) {
  staleWorker.lastHeartbeatAt = new Date(Date.now() - 30000).toISOString(); // 30s ago (exceeds 15s timeout)
}

const offlineStatus = getSanitizedWorkerStatus();

if (offlineStatus.topStatus !== "OFFLINE") {
  console.error("   -> FAIL: Expected topStatus 'OFFLINE' for stale heartbeat, got:", offlineStatus.topStatus);
  process.exit(1);
}
if (offlineStatus.localWorker !== "offline" || offlineStatus.comfyUI !== "offline" || offlineStatus.hunyuan3D !== "unavailable") {
  console.error("   -> FAIL: Sub-statuses incorrect for offline state:", offlineStatus);
  process.exit(1);
}
console.log("   -> PASS: Correctly returned 'OFFLINE' when heartbeat timed out");

// Cleanup test worker registry
globalWorkerRegistry.clear();

console.log("\n=== ALL G4-2 LOCAL COMPUTE STATUS UI TESTS PASSED ===");
