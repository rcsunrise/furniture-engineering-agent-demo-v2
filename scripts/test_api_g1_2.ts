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

  console.log(`=== G1-2 API Endpoint Test Suite (port ${port}) ===`);

  try {
    // 1. GET /api/health
    console.log("\n1. Testing GET /api/health:");
    const hResp = await fetch(`http://127.0.0.1:${port}/api/health`);
    const hJson = await hResp.json();
    if (hResp.status === 200 && hJson.status === "ok") {
      console.log("   -> PASS (Health check ok)");
    } else {
      console.error("   -> FAIL: Health check failed");
      process.exit(1);
    }

    // 2. POST /api/engineering/validate with valid FES
    console.log("\n2. Testing POST /api/engineering/validate (valid FES):");
    const validBuf = fs.readFileSync(path.join(sampleDir, "engineering_valid.xlsx"));
    const pValid = parseWorkbook(validBuf, "engineering_valid.xlsx");
    if (!pValid.success) throw new Error("Failed to parse engineering_valid.xlsx");

    const vResp1 = await fetch(`http://127.0.0.1:${port}/api/engineering/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pValid.fes),
    });
    const vJson1 = await vResp1.json();
    console.log("   HTTP Status:", vResp1.status);
    console.log("   Response Level:", vJson1.validation?.level);
    if (vResp1.status === 200 && vJson1.validation?.level === "pass" && vJson1.validation?.valid === true) {
      console.log("   -> PASS");
    } else {
      console.error("   -> FAIL:", vJson1);
      process.exit(1);
    }

    // 3. POST /api/engineering/validate with invalid FES (out_of_bounds_x)
    console.log("\n3. Testing POST /api/engineering/validate (OOB X FES):");
    const oobBuf = fs.readFileSync(path.join(sampleDir, "out_of_bounds_x.xlsx"));
    const pOob = parseWorkbook(oobBuf, "out_of_bounds_x.xlsx");
    if (!pOob.success) throw new Error("Failed to parse out_of_bounds_x.xlsx");

    const vResp2 = await fetch(`http://127.0.0.1:${port}/api/engineering/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pOob.fes),
    });
    const vJson2 = await vResp2.json();
    console.log("   HTTP Status:", vResp2.status);
    console.log("   Response Level:", vJson2.validation?.level);
    console.log("   Valid boolean:", vJson2.validation?.valid);
    if (vResp2.status === 200 && vJson2.validation?.level === "fail" && vJson2.validation?.valid === false) {
      console.log("   -> PASS (HTTP 200 with level=fail and valid=false)");
    } else {
      console.error("   -> FAIL:", vJson2);
      process.exit(1);
    }

    // 4. POST /api/engineering/excel/parse with engineering_valid.xlsx
    console.log("\n4. Testing POST /api/engineering/excel/parse returns engineeringValidation:");
    const boundary = "--------------------------" + Math.random().toString(36).substring(2);
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="engineering_valid.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;
    const body = Buffer.concat([Buffer.from(header, "utf-8"), validBuf, Buffer.from(footer, "utf-8")]);

    const pResp = await fetch(`http://127.0.0.1:${port}/api/engineering/excel/parse`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    const pJson = await pResp.json();
    console.log("   HTTP Status:", pResp.status);
    console.log("   engineeringValidation level:", pJson.engineeringValidation?.level);
    if (pResp.status === 200 && pJson.schemaValid === true && pJson.engineeringValidation?.level === "pass") {
      console.log("   -> PASS");
    } else {
      console.error("   -> FAIL:", pJson);
      process.exit(1);
    }

    console.log("\n=== ALL G1-2 API TESTS PASSED ===");
  } catch (err) {
    console.error("API Test Error:", err);
    process.exit(1);
  } finally {
    server.close();
  }
});
