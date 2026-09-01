import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import http from "http";
import { engineeringRouter } from "../src/server/routes/engineering.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/engineering", engineeringRouter);

const server = http.createServer(app);

server.listen(0, "127.0.0.1", async () => {
  const address = server.address() as { port: number };
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}/api/engineering/excel/parse`;

  console.log(`=== G1-1 API Endpoint Test Suite (port ${port}) ===`);

  const sampleDir = path.join(process.cwd(), "sample");

  // Helper for multipart upload
  async function testUpload(filename: string) {
    const fileBuf = fs.readFileSync(path.join(sampleDir, filename));
    const boundary = "--------------------------" + Math.random().toString(36).substring(2);

    const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    const body = Buffer.concat([
      Buffer.from(header, "utf-8"),
      fileBuf,
      Buffer.from(footer, "utf-8"),
    ]);

    const resp = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    const status = resp.status;
    const json = await resp.json();
    return { status, json };
  }

  try {
    // 1. valid.xlsx
    console.log("\n1. Testing POST /api/engineering/excel/parse with valid.xlsx:");
    const r1 = await testUpload("valid.xlsx");
    console.log("   HTTP Status:", r1.status);
    console.log("   Response:", JSON.stringify(r1.json, null, 2));
    if (r1.status === 200 && r1.json.schemaValid === true && r1.json.fes) {
      console.log("   -> PASS");
    } else {
      console.error("   -> FAIL");
      process.exit(1);
    }

    // 2. missing_required.xlsx
    console.log("\n2. Testing POST /api/engineering/excel/parse with missing_required.xlsx:");
    const r2 = await testUpload("missing_required.xlsx");
    console.log("   HTTP Status:", r2.status);
    console.log("   Response:", JSON.stringify(r2.json, null, 2));
    if (r2.status === 400 && r2.json.error?.code === "INVALID_WORKBOOK") {
      console.log("   -> PASS (Correctly returned 400 INVALID_WORKBOOK)");
    } else {
      console.error("   -> FAIL");
      process.exit(1);
    }

    // 3. invalid_number.xlsx
    console.log("\n3. Testing POST /api/engineering/excel/parse with invalid_number.xlsx:");
    const r3 = await testUpload("invalid_number.xlsx");
    console.log("   HTTP Status:", r3.status);
    console.log("   Response:", JSON.stringify(r3.json, null, 2));
    if (r3.status === 400 && r3.json.error?.code === "INVALID_WORKBOOK") {
      console.log("   -> PASS (Correctly returned 400 INVALID_WORKBOOK)");
    } else {
      console.error("   -> FAIL");
      process.exit(1);
    }

    console.log("\n=== ALL G1-1 API TESTS PASSED ===");
  } catch (err) {
    console.error("API test error:", err);
    process.exit(1);
  } finally {
    server.close();
  }
});
