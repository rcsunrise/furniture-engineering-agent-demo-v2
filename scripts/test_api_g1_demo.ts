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

  console.log("==================================================");
  console.log(`=== G1-DEMO Full API & Regression Test Suite (port ${port}) ===`);
  console.log("==================================================\n");

  try {
    // 1. GET /api/health
    console.log("1. GET /api/health:");
    const hResp = await fetch(`http://127.0.0.1:${port}/api/health`);
    const hJson = await hResp.json();
    if (hResp.status === 200 && hJson.status === "ok") {
      console.log("   -> PASS");
    } else {
      console.error("   -> FAIL: Health check failed");
      process.exit(1);
    }

    // Load engineering_valid.xlsx FES
    const validBuf = fs.readFileSync(path.join(sampleDir, "engineering_valid.xlsx"));
    const pValid = parseWorkbook(validBuf, "engineering_valid.xlsx");
    if (!pValid.success) throw new Error("Failed to parse engineering_valid.xlsx");

    // 2. POST /api/engineering/cad/front
    console.log("\n2. POST /api/engineering/cad/front (valid FES):");
    const cadResp = await fetch(`http://127.0.0.1:${port}/api/engineering/cad/front`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pValid.fes),
    });
    const cadJson = await cadResp.json();
    if (cadResp.status === 200 && cadJson.cad && cadJson.cad.view === "front") {
      console.log("   -> PASS (CAD-IR Generated)");
    } else {
      console.error("   -> FAIL:", cadJson);
      process.exit(1);
    }

    // 3. POST /api/engineering/assembly
    console.log("\n3. POST /api/engineering/assembly (valid FES):");
    const assemResp = await fetch(`http://127.0.0.1:${port}/api/engineering/assembly`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pValid.fes),
    });
    const assemJson = await assemResp.json();
    if (
      assemResp.status === 200 &&
      assemJson.assembly &&
      assemJson.assembly.components.length === pValid.fes.components.length
    ) {
      console.log(`   -> PASS (Assembly Graph Generated with ${assemJson.assembly.components.length} components)`);
    } else {
      console.error("   -> FAIL:", assemJson);
      process.exit(1);
    }

    // 4. POST /api/engineering/assembly with invalid FES (out_of_bounds_x)
    console.log("\n4. POST /api/engineering/assembly (out_of_bounds_x FES):");
    const oobBuf = fs.readFileSync(path.join(sampleDir, "out_of_bounds_x.xlsx"));
    const pOob = parseWorkbook(oobBuf, "out_of_bounds_x.xlsx");
    if (!pOob.success) throw new Error("Failed to parse out_of_bounds_x.xlsx");

    const assemFailResp = await fetch(`http://127.0.0.1:${port}/api/engineering/assembly`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pOob.fes),
    });
    const assemFailJson = await assemFailResp.json();
    if (assemFailResp.status === 422 && assemFailJson.error?.code === "ENGINEERING_VALIDATION_FAILED") {
      console.log("   -> PASS (Assembly correctly rejected invalid engineering data with HTTP 422)");
    } else {
      console.error("   -> FAIL:", assemFailResp.status, assemFailJson);
      process.exit(1);
    }

    // 5. G1-1 Parser Regression
    console.log("\n5. G1-1 Parser Regression:");
    const p1 = parseWorkbook(fs.readFileSync(path.join(sampleDir, "valid.xlsx")), "valid.xlsx");
    const p2 = parseWorkbook(fs.readFileSync(path.join(sampleDir, "missing_required.xlsx")), "missing_required.xlsx");
    if (p1.success && !p2.success) {
      console.log("   -> PASS");
    } else {
      console.error("   -> FAIL: Parser regression failure");
      process.exit(1);
    }

    // 6. G1-2 Validator Regression
    console.log("\n6. G1-2 Validator Regression:");
    const valResp = await fetch(`http://127.0.0.1:${port}/api/engineering/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pOob.fes),
    });
    const valJson = await valResp.json();
    if (valResp.status === 200 && valJson.validation?.level === "fail") {
      console.log("   -> PASS");
    } else {
      console.error("   -> FAIL: Validator API failure");
      process.exit(1);
    }

    console.log("\n==================================================");
    console.log("=== ALL G1-DEMO API & REGRESSION TESTS PASSED ===");
    console.log("==================================================\n");
  } catch (err) {
    console.error("API Test Error:", err);
    process.exit(1);
  } finally {
    server.close();
  }
});
