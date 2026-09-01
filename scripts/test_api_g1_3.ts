import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import http from "http";
import { engineeringRouter } from "../src/server/routes/engineering.js";
import { parseWorkbook } from "../src/server/excel.js";

const app = express();
app.use(cors());
app.use(express.json());
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/engineering", engineeringRouter);

const server = http.createServer(app);

server.listen(0, "127.0.0.1", async () => {
  const address = server.address() as { port: number };
  const port = address.port;
  const sampleDir = path.join(process.cwd(), "sample");

  console.log(`=== G1-3 API Endpoint & Regression Test Suite (port ${port}) ===`);

  try {
    // 1. GET /api/health
    console.log("\n1. Testing GET /api/health:");
    const hResp = await fetch(`http://127.0.0.1:${port}/api/health`);
    const hJson = await hResp.json();
    if (hResp.status === 200 && hJson.status === "ok") {
      console.log("   -> PASS");
    } else {
      console.error("   -> FAIL: Health check failed");
      process.exit(1);
    }

    // 2. POST /api/engineering/cad/front with valid FES
    console.log("\n2. Testing POST /api/engineering/cad/front (valid FES):");
    const validBuf = fs.readFileSync(path.join(sampleDir, "engineering_valid.xlsx"));
    const pValid = parseWorkbook(validBuf, "engineering_valid.xlsx");
    if (!pValid.success) throw new Error("Failed to parse engineering_valid.xlsx");

    const cadResp1 = await fetch(`http://127.0.0.1:${port}/api/engineering/cad/front`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pValid.fes),
    });
    const cadJson1 = await cadResp1.json();
    console.log("   HTTP Status:", cadResp1.status);
    console.log("   Has CAD doc:", Boolean(cadJson1.cad));
    if (cadResp1.status === 200 && cadJson1.cad && cadJson1.cad.view === "front") {
      console.log("   -> PASS (Generated valid CAD-IR)");
    } else {
      console.error("   -> FAIL:", cadJson1);
      process.exit(1);
    }

    // 3. POST /api/engineering/cad/front with invalid engineering data (out_of_bounds_x)
    console.log("\n3. Testing POST /api/engineering/cad/front (out_of_bounds_x FES):");
    const oobBuf = fs.readFileSync(path.join(sampleDir, "out_of_bounds_x.xlsx"));
    const pOob = parseWorkbook(oobBuf, "out_of_bounds_x.xlsx");
    if (!pOob.success) throw new Error("Failed to parse out_of_bounds_x.xlsx");

    const cadResp2 = await fetch(`http://127.0.0.1:${port}/api/engineering/cad/front`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pOob.fes),
    });
    const cadJson2 = await cadResp2.json();
    console.log("   HTTP Status:", cadResp2.status);
    console.log("   Error code:", cadJson2.error?.code);
    if (cadResp2.status === 422 && cadJson2.error?.code === "ENGINEERING_VALIDATION_FAILED") {
      console.log("   -> PASS (Correctly rejected with HTTP 422 ENGINEERING_VALIDATION_FAILED)");
    } else {
      console.error("   -> FAIL: Expected HTTP 422 with ENGINEERING_VALIDATION_FAILED, got:", cadResp2.status, cadJson2);
      process.exit(1);
    }

    // 4. Regression Test: G1-1 Excel Parser
    console.log("\n4. Testing G1-1 Excel Parser Regression:");
    const p1 = parseWorkbook(fs.readFileSync(path.join(sampleDir, "valid.xlsx")), "valid.xlsx");
    const p2 = parseWorkbook(fs.readFileSync(path.join(sampleDir, "missing_required.xlsx")), "missing_required.xlsx");
    const p3 = parseWorkbook(fs.readFileSync(path.join(sampleDir, "invalid_number.xlsx")), "invalid_number.xlsx");
    if (p1.success && !p2.success && !p3.success) {
      console.log("   -> PASS (Excel Parser regression clean)");
    } else {
      console.error("   -> FAIL: Excel parser regression failed!");
      process.exit(1);
    }

    // 5. Regression Test: G1-2 Engineering Validator API
    console.log("\n5. Testing G1-2 Engineering Validator API Regression:");
    const valResp = await fetch(`http://127.0.0.1:${port}/api/engineering/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pOob.fes),
    });
    const valJson = await valResp.json();
    if (valResp.status === 200 && valJson.validation?.level === "fail") {
      console.log("   -> PASS (Validator API regression clean)");
    } else {
      console.error("   -> FAIL: Validator API regression failed!", valJson);
      process.exit(1);
    }

    console.log("\n=== ALL G1-3 API & REGRESSION TESTS PASSED ===");
  } catch (err) {
    console.error("API Test Error:", err);
    process.exit(1);
  } finally {
    server.close();
  }
});
