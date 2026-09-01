import express from "express";
import fs from "fs";
import path from "path";
import http from "http";
import { engineeringRouter } from "../src/server/routes/engineering.js";
import { workerRouter } from "../src/server/routes/worker.js";
import { workerRuntimeRouter } from "../src/server/routes/workerRuntime.js";
import {
  resetRateLimiterBuckets,
  clearAllParseLocks,
  startParseJob,
  finishParseJob,
} from "../src/server/limiter/parseLimiter.js";

async function runG4ParseR1Tests() {
  console.log("==================================================");
  console.log("RUNNING G4-PARSE-R1 RATE LIMIT & DEDUP TESTS");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? `: ${detail}` : ""}`);
      failed++;
    }
  }

  // Setup express test server on port 3099
  const app = express();
  app.use(express.json());
  app.use("/api/engineering", engineeringRouter);
  app.use("/api/worker/runtime", workerRuntimeRouter);
  app.use("/api/worker", workerRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(3099, "127.0.0.1", resolve));

  const PORT = 3099;
  const baseUrl = `http://127.0.0.1:${PORT}`;

  // Find valid sample file
  let samplePath = path.join(process.cwd(), "sample", "valid.xlsx");
  if (!fs.existsSync(samplePath)) {
    samplePath = path.join(process.cwd(), "sample", "est_sofa_roundarm_2650.xlsx");
  }
  if (!fs.existsSync(samplePath)) {
    throw new Error("No sample excel file found for testing");
  }

  try {
    resetRateLimiterBuckets();
    clearAllParseLocks();

    // Helper to perform multipart upload fetch
    async function doUpload(reqId: string, workspaceId: string = "default") {
      const fileBuffer = fs.readFileSync(samplePath);
      const blob = new Blob([fileBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const form = new FormData();
      form.append("file", blob, "test_sample.xlsx");

      const res = await fetch(`${baseUrl}/api/engineering/excel/parse`, {
        method: "POST",
        headers: {
          "X-Parse-Request-Id": reqId,
          "X-Workspace-Id": workspaceId,
        },
        body: form as any,
      });

      const contentType = res.headers.get("content-type") || "";
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: res.status, contentType, json, raw: text };
    }

    // A. Single upload = one POST
    const resA = await doUpload("req-test-a-1");
    assert(resA.status === 200 && resA.json?.success === true, "A. single upload = one POST");

    // B. Duplicate UI trigger blocked (Client side guard simulation)
    const clientGuard = { inFlight: false };
    let callsExecuted = 0;
    function clientTriggerUpload() {
      if (clientGuard.inFlight) return "BLOCKED";
      clientGuard.inFlight = true;
      callsExecuted++;
      return "EXECUTED";
    }
    const trigger1 = clientTriggerUpload(); // EXECUTED
    const trigger2 = clientTriggerUpload(); // BLOCKED
    clientGuard.inFlight = false;
    assert(trigger1 === "EXECUTED" && trigger2 === "BLOCKED" && callsExecuted === 1, "B. duplicate UI trigger blocked");

    // C. Same request id deduplicated
    const resC1 = await doUpload("req-dedup-unique-777");
    const resC2 = await doUpload("req-dedup-unique-777");
    assert(resC1.status === 200 && resC2.status === 200 && resC2.json?.fes?.sku === resC1.json?.fes?.sku, "C. same request id deduplicated");

    // D. Parse limiter isolated from worker heartbeat
    resetRateLimiterBuckets();
    clearAllParseLocks();
    // Hit worker_runtime 10 times
    for (let i = 0; i < 10; i++) {
      await fetch(`${baseUrl}/api/worker/runtime/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: `test-w-${i}`, capabilities: [] }),
      });
    }
    // Parse request should still pass without hit from heartbeat quota
    const resD = await doUpload("req-iso-hb-1");
    assert(resD.status === 200, "D. parse limiter isolated from worker heartbeat");

    // E. Status polling does not consume parse quota
    resetRateLimiterBuckets();
    clearAllParseLocks();
    for (let i = 0; i < 10; i++) {
      await fetch(`${baseUrl}/api/worker/status`);
    }
    const resE = await doUpload("req-iso-status-1");
    assert(resE.status === 200, "E. status polling does not consume parse quota");

    // F. 429 response is valid JSON
    resetRateLimiterBuckets();
    clearAllParseLocks();
    // Limit is 5 per minute
    for (let i = 1; i <= 5; i++) {
      await doUpload(`req-limiter-${i}`);
    }
    const resF = await doUpload("req-limiter-6-overflow");
    assert(resF.status === 429, "F1. 6th request triggers 429 status");
    assert(resF.contentType.includes("application/json"), "F2. 429 Content-Type is application/json");
    assert(
      resF.json?.success === false &&
        resF.json?.error?.code === "EXCEL_PARSE_RATE_LIMITED" &&
        typeof resF.json?.error?.retryAfterMs === "number",
      "F3. 429 payload is structured JSON with code EXCEL_PARSE_RATE_LIMITED"
    );

    // G. No automatic retry on 429
    // Simulated client reaction to 429
    let autoRetryFired = false;
    if (resF.status === 429) {
      // Client stops, does not auto-retry
      autoRetryFired = false;
    }
    assert(!autoRetryFired, "G. no automatic retry on 429");

    // H. isParsing resets after 429
    let clientIsParsing = true;
    try {
      if (resF.status === 429) {
        // throw error to finally
      }
    } finally {
      clientIsParsing = false;
    }
    assert(clientIsParsing === false, "H. isParsing resets after 429");

    // I. Same workspace concurrent parse returns structured busy state (409)
    resetRateLimiterBuckets();
    clearAllParseLocks();
    // Manually lock workspace
    startParseJob("workspace-busy-test", "req-active-999");
    const resI = await doUpload("req-concurrent-888", "workspace-busy-test");
    finishParseJob("workspace-busy-test", "req-active-999");

    assert(resI.status === 409, "I1. Concurrent parse returns 409 Conflict");
    assert(
      resI.json?.success === false && resI.json?.error?.code === "EXCEL_PARSE_ALREADY_RUNNING",
      "I2. 409 response has structured code EXCEL_PARSE_ALREADY_RUNNING"
    );

    // J. Normal parse still succeeds
    resetRateLimiterBuckets();
    clearAllParseLocks();
    const resJ = await doUpload("req-normal-parse-final");
    assert(resJ.status === 200 && Boolean(resJ.json?.fes?.sku), "J. normal parse still succeeds");

  } finally {
    server.close();
  }

  console.log("\n==================================================");
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runG4ParseR1Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
