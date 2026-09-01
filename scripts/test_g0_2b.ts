import { runReasoning, type UnifiedReasoningRequest } from "../src/server/ai/provider.js";
import {
  createImageTask,
  processImageTask,
  clearTaskStore,
} from "../src/server/ai/imageProvider.js";
import {
  getTelemetryHistory,
  getTelemetrySummary,
  clearTelemetryLogs,
} from "../src/server/ai/telemetry.js";

console.log("=== G0-2B Real Call & Telemetry Acceptance Test Suite ===");

async function main() {
  clearTelemetryLogs();
  clearTaskStore();

  let testPassed = true;

  // 1. Test Real Gemini Reasoning Call
  console.log("\n[Test 1] Real Gemini Reasoning Call...");
  try {
    const res = await runReasoning({
      provider: "gemini",
      model: "gemini-2.5-flash",
      instructions: "Perform engineering feasibility evaluation on a 3-seater sofa structure.",
      input: { width: 2100, depth: 900, height: 850, legs: 4, material: "solid_oak" },
      allowFallback: false,
    });

    console.log(` -> Provider: ${res.provider}`);
    console.log(` -> RequestedModel: ${res.requestedModel}`);
    console.log(` -> ResolvedModel: ${res.resolvedModel}`);
    console.log(` -> RequestId: ${res.requestId}`);
    console.log(` -> EstimatedCostUsd: $${res.telemetry.estimatedCostUsd}`);
    console.log(` -> Response Text (first 100 chars): ${res.text.slice(0, 100).replace(/\n/g, " ")}...`);

    if (res.provider !== "gemini" || !res.telemetry.success || res.telemetry.fallbackUsed !== false) {
      console.error("FAIL: Gemini call telemetry or provider response mismatch");
      testPassed = false;
    }
  } catch (err: any) {
    console.error(`FAIL: Gemini call threw unexpected error: ${err.message}`);
    testPassed = false;
  }

  // 2. Test RouterHub Adapter & Explicit Non-Silent Fallback
  console.log("\n[Test 2] RouterHub Adapter & Non-Silent Fallback to VectorEngine / Gemini...");
  try {
    // RouterHub key is not present in dev environment, so it will trigger fallback
    const res = await runReasoning({
      provider: "routerhub",
      model: "router-reason-v1",
      instructions: "Check load-bearing capacity for sofa frame joints.",
      input: { joint_type: "mortise_tenon", load_kg: 350 },
      allowFallback: true,
    });

    console.log(` -> Final Provider: ${res.provider}`);
    console.log(` -> RequestedModel: ${res.requestedModel}`);
    console.log(` -> ResolvedModel: ${res.resolvedModel}`);
    console.log(` -> FallbackUsed: ${res.telemetry.fallbackUsed}`);
    console.log(` -> FallbackInfo Primary Provider: ${res.telemetry.fallbackInfo?.primaryProvider}`);
    console.log(` -> FallbackInfo Primary Error: ${res.telemetry.fallbackInfo?.primaryError}`);

    if (!res.telemetry.fallbackUsed || res.telemetry.fallbackInfo?.primaryProvider !== "routerhub") {
      console.error("FAIL: Silent fallback detected or fallbackInfo missing");
      testPassed = false;
    }
  } catch (err: any) {
    console.error(`FAIL: RouterHub fallback test threw error: ${err.message}`);
    testPassed = false;
  }

  // 3. Test Unknown Model Rejection & Explicit Model Resolution Tracking
  console.log("\n[Test 3] Unknown Image Model Rejection...");
  const unverifiedImgRes = createImageTask("ws_g0_2b", "unknown-hyper-model-v999", "Generate luxury armchair");
  if (unverifiedImgRes.success || unverifiedImgRes.errorCode !== "IMAGE_MODEL_UNVERIFIED") {
    console.error("FAIL: Unknown image model was not rejected with IMAGE_MODEL_UNVERIFIED");
    testPassed = false;
  } else {
    console.log(` -> Correctly Rejected. Error Code: ${unverifiedImgRes.errorCode}`);
  }

  // 4. Test Real Image Task Processing with Telemetry Recording
  console.log("\n[Test 4] Real Image Model Call & Telemetry...");
  const realImgTaskRes = createImageTask("ws_g0_2b", "gemini-2.5-flash", "Minimalist Scandinavian lounge chair CAD schematic");
  if (!realImgTaskRes.success) {
    console.error("FAIL: Real image task creation failed");
    testPassed = false;
  } else {
    const processRes = await processImageTask(realImgTaskRes.task.taskId);
    if (!processRes.success || !processRes.task?.telemetry) {
      console.error(`FAIL: Real image task processing failed: ${processRes.error}`);
      testPassed = false;
    } else {
      console.log(` -> Image Task State: ${processRes.task.state}`);
      console.log(` -> Provider: ${processRes.task.telemetry.provider}`);
      console.log(` -> RequestedModel: ${processRes.task.telemetry.requestedModel}`);
      console.log(` -> RequestId: ${processRes.task.telemetry.requestId}`);
      console.log(` -> EstimatedCostUsd: $${processRes.task.telemetry.estimatedCostUsd}`);
    }
  }

  // 5. Test Mock Image Model Processing
  console.log("\n[Test 5] Mock Image Model Processing...");
  const mockImgTaskRes = createImageTask("ws_g0_2b", "mock-imagen-v1", "Classic wooden dining table");
  if (!mockImgTaskRes.success) {
    console.error("FAIL: Mock image task creation failed");
    testPassed = false;
  } else {
    const processRes = await processImageTask(mockImgTaskRes.task.taskId);
    if (!processRes.success || processRes.task?.telemetry?.estimatedCostUsd !== 0) {
      console.error("FAIL: Mock image task cost must be $0");
      testPassed = false;
    } else {
      console.log(` -> Mock Task Completed: ${processRes.task.mockAssetUrl}`);
    }
  }

  // 6. Output Final Telemetry Summary
  console.log("\n==================================================");
  console.log("=== G0-2B TELEMETRY & COST ACCEPTANCE SUMMARY ===");
  console.log("==================================================");

  const history = getTelemetryHistory();
  const summary = getTelemetrySummary();

  console.log(`Total Calls: ${summary.totalCalls}`);
  console.log(`Successful Calls: ${summary.successfulCalls}`);
  console.log(`Failed Calls: ${summary.failedCalls}`);
  console.log(`Fallback Count: ${summary.fallbackCount}`);
  console.log(`Real Image Calls: ${summary.realImageCalls}`);
  console.log(`Billable Image Calls: ${summary.billableImageCalls}`);
  console.log(`Estimated Total Cost: $${summary.estimatedTotalCostUsd}`);
  console.log("\nProvider Breakdown:");
  console.dir(summary.providerBreakdown, { depth: null });

  console.log("\nFull Telemetry Log Sample:");
  for (const log of history) {
    console.log(` - Call #${log.callCount} | Type: ${log.callType} | Provider: ${log.provider} | Requested: ${log.requestedModel} | Resolved: ${log.resolvedModel} | Success: ${log.success} | Fallback: ${log.fallbackUsed} | Cost: $${log.estimatedCostUsd}`);
    if (log.fallbackInfo) {
      console.log(`    [Fallback Details] Primary: ${log.fallbackInfo.primaryProvider} (${log.fallbackInfo.primaryError.slice(0, 60)}...) -> Fallback: ${log.fallbackInfo.fallbackProvider}`);
    }
  }

  if (testPassed) {
    console.log("\n=== G0-2B ACCEPTANCE TESTS ALL PASSED ===");
  } else {
    console.error("\n=== G0-2B ACCEPTANCE TESTS FAILED ===");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error running G0-2B tests:", err);
  process.exit(1);
});
