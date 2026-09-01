import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { readJsonApiResponse } from "../src/client/api/readJsonApiResponse.js";
import { parseApiResponse } from "../src/client/api.js";
import { parseWorkbook } from "../src/server/excel.js";
import { validateEngineeringData } from "../server/validate.js";
import { engineeringRouter } from "../src/server/routes/engineering.js";

async function runG3ABParseHotfixSuite() {
  console.log("==========================================================================");
  console.log("             RUNNING G3-AB-PARSE-HOTFIX SMOKE TEST SUITE                  ");
  console.log("==========================================================================");

  let passedAll = true;

  // Set up Express server
  const app = express();
  app.use(express.json());
  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "furniture-engineering-agent-demo-v1" }));
  app.use("/api/engineering", engineeringRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as any;
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[INFO] Test server booted at ${baseUrl}`);

  try {
    // ------------------------------------------------------------------------
    // Test A: GET /api/health -> HTTP 200 application/json
    // ------------------------------------------------------------------------
    console.log("\n[Test A] GET /api/health...");
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthContentType = healthRes.headers.get("content-type") || "";
    if (healthRes.status === 200 && healthContentType.includes("application/json")) {
      const healthData = await readJsonApiResponse<any>(healthRes, "/api/health", "GET");
      if (healthData.ok) {
        console.log(`  ✓ Test A PASSED: HTTP 200 application/json (service: ${healthData.service})`);
      } else {
        console.error("  ✕ Test A FAILED: JSON returned ok: false");
        passedAll = false;
      }
    } else {
      console.error(`  ✕ Test A FAILED: Status ${healthRes.status}, Content-Type: ${healthContentType}`);
      passedAll = false;
    }

    // ------------------------------------------------------------------------
    // Test B: POST /api/engineering/excel/parse (valid.xlsx) -> HTTP 200 application/json
    // ------------------------------------------------------------------------
    console.log("\n[Test B] POST /api/engineering/excel/parse (valid.xlsx)...");
    const validPath = path.join(process.cwd(), "sample", "valid.xlsx");
    const validBuf = fs.readFileSync(validPath);
    const blobB = new Blob([validBuf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const fdB = new FormData();
    fdB.append("file", blobB, "valid.xlsx");

    const parseResB = await fetch(`${baseUrl}/api/engineering/excel/parse`, { method: "POST", body: fdB });
    const parsedB = await parseApiResponse<any>(parseResB, "/api/engineering/excel/parse", "POST");

    if (parsedB.ok && parsedB.data?.fes && parsedB.data?.fes?.sku === "DEMO-CHAIR-001") {
      console.log(`  ✓ Test B PASSED: HTTP 200 application/json (SKU: ${parsedB.data.fes.sku}, Components: ${parsedB.data.fes.components.length})`);
    } else {
      console.error("  ✕ Test B FAILED:", parsedB);
      passedAll = false;
    }

    // ------------------------------------------------------------------------
    // Test C: Simulated Server Parse API Failure -> Client-side Fallback
    // ------------------------------------------------------------------------
    console.log("\n[Test C] Simulated Server Parse API Failure (HTML/Routing 404) -> Client Fallback...");
    // Simulate server parse API returning non-JSON HTML (e.g. 404 HTML)
    const fakeHtmlRes = new Response("<!DOCTYPE html><html><body>404 Not Found</body></html>", {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    let clientFallbackTriggered = false;
    let clientFallbackFes: any = null;

    try {
      // Step 1: Attempt server parse using parseApiResponse
      await parseApiResponse<any>(fakeHtmlRes, "/api/engineering/excel/parse", "POST");
    } catch (serverErr: any) {
      if (serverErr.code === "NON_JSON_API_RESPONSE") {
        clientFallbackTriggered = true;
        // Step 2: Perform client-side fallback directly using parseWorkbook
        const clientRes = parseWorkbook(validBuf, "valid.xlsx");
        if (clientRes.success) {
          clientFallbackFes = clientRes.fes;
        }
      } else {
        console.error("  ✕ Test C FAILED: Expected NON_JSON_API_RESPONSE, got:", serverErr);
      }
    }

    if (clientFallbackTriggered && clientFallbackFes && clientFallbackFes.sku === "DEMO-CHAIR-001") {
      console.log(`  ✓ Test C PASSED: Client fallback succeeded without readJsonApiResponse undefined errors! (SKU: ${clientFallbackFes.sku})`);
    } else {
      console.error("  ✕ Test C FAILED: Client fallback did not produce FES");
      passedAll = false;
    }

    // ------------------------------------------------------------------------
    // Test D: Schema Invalid Excel Rejection
    // ------------------------------------------------------------------------
    console.log("\n[Test D] POST /api/engineering/excel/parse (missing_required.xlsx)...");
    const missingReqPath = path.join(process.cwd(), "sample", "missing_required.xlsx");
    const missingReqBuf = fs.readFileSync(missingReqPath);
    const blobD = new Blob([missingReqBuf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const fdD = new FormData();
    fdD.append("file", blobD, "missing_required.xlsx");

    const parseResD = await fetch(`${baseUrl}/api/engineering/excel/parse`, { method: "POST", body: fdD });
    const parsedD = await parseApiResponse<any>(parseResD, "/api/engineering/excel/parse", "POST");

    const errCode = parsedD.data?.error?.code || parsedD.data?.code;
    if (!parsedD.ok && (errCode === "INVALID_WORKBOOK" || errCode === "SCHEMA_VALIDATION_FAILED")) {
      console.log(`  ✓ Test D PASSED: Server returned HTTP ${parsedD.status} with expected error code: ${errCode}`);
    } else {
      console.error("  ✕ Test D FAILED: Invalid workbook was not properly rejected by server:", parsedD);
      passedAll = false;
    }

  } finally {
    server.close();
  }

  console.log("\n==========================================================================");
  if (passedAll) {
    console.log("             G3-AB-PARSE-HOTFIX VERIFICATION RESULT: PASS                 ");
    console.log("==========================================================================");
  } else {
    console.log("             G3-AB-PARSE-HOTFIX VERIFICATION RESULT: FAIL                 ");
    console.log("==========================================================================");
    process.exit(1);
  }
}

runG3ABParseHotfixSuite().catch((err) => {
  console.error("Fatal Test Exception:", err);
  process.exit(1);
});
