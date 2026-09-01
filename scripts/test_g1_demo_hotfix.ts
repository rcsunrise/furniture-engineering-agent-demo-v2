import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import http from "http";
import { engineeringRouter } from "../src/server/routes/engineering.js";
import { parseApiResponse } from "../src/client/api.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "furniture-engineering-agent-demo-v1" }));
app.use("/api/engineering", engineeringRouter);

// Unified API 404 handler
app.use("/api", (req, res) => {
  res.status(404).json({
    error: {
      code: "API_ROUTE_NOT_FOUND",
      message: `${req.method} ${req.originalUrl}`,
    },
  });
});

const server = http.createServer(app);

server.listen(0, "127.0.0.1", async () => {
  const address = server.address() as { port: number };
  const port = address.port;
  const sampleDir = path.join(process.cwd(), "sample");

  console.log("==================================================");
  console.log(`=== G1-DEMO-HOTFIX Comprehensive Verification Suite (port ${port}) ===`);
  console.log("==================================================\n");

  try {
    // ----------------------------------------------------
    // Test A: Upload engineering_valid.xlsx
    // ----------------------------------------------------
    console.log("Test A: Upload engineering_valid.xlsx:");
    const validFilePath = path.join(sampleDir, "engineering_valid.xlsx");
    const fileBuf = fs.readFileSync(validFilePath);
    
    // Construct multipart form data manually for node fetch
    const boundary = "----WebKitFormBoundaryTestA" + Date.now();
    let bodyStr = `--${boundary}\r\n`;
    bodyStr += `Content-Disposition: form-data; name="file"; filename="engineering_valid.xlsx"\r\n`;
    bodyStr += `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
    
    const bodyHeader = Buffer.from(bodyStr, "utf8");
    const bodyFooter = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
    const fullBody = Buffer.concat([bodyHeader, fileBuf, bodyFooter]);

    const resA = await fetch(`http://127.0.0.1:${port}/api/engineering/excel/parse`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: fullBody,
    });

    const parsedA = await parseApiResponse<any>(resA, "/api/engineering/excel/parse", "POST");
    const ctA = resA.headers.get("content-type") || "";

    if (
      resA.status === 200 &&
      ctA.includes("application/json") &&
      parsedA.data.fes &&
      parsedA.data.schemaValid === true &&
      parsedA.data.engineeringValidation
    ) {
      console.log(`   -> PASS (HTTP ${resA.status}, Content-Type: ${ctA}, SKU: ${parsedA.data.fes.sku})`);
    } else {
      console.error("   -> FAIL:", resA.status, ctA, parsedA.data);
      process.exit(1);
    }

    // ----------------------------------------------------
    // Test B: Upload invalid/unparseable Excel file
    // ----------------------------------------------------
    console.log("\nTest B: Upload invalid Excel file:");
    const badBuf = Buffer.from("Corrupted Excel File Header String Not XLSX");
    const boundaryB = "----WebKitFormBoundaryTestB" + Date.now();
    let bodyStrB = `--${boundaryB}\r\n`;
    bodyStrB += `Content-Disposition: form-data; name="file"; filename="DEMO2_RealProduct_Estimated_FES_Test.xlsx"\r\n`;
    bodyStrB += `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
    
    const bodyHeaderB = Buffer.from(bodyStrB, "utf8");
    const bodyFooterB = Buffer.from(`\r\n--${boundaryB}--\r\n`, "utf8");
    const fullBodyB = Buffer.concat([bodyHeaderB, badBuf, bodyFooterB]);

    const resB = await fetch(`http://127.0.0.1:${port}/api/engineering/excel/parse`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundaryB}`,
      },
      body: fullBodyB,
    });

    const ctB = resB.headers.get("content-type") || "";
    const parsedB = await parseApiResponse<any>(resB, "/api/engineering/excel/parse", "POST");

    if (
      !ctB.includes("text/html") &&
      ctB.includes("application/json") &&
      parsedB.data.error?.code === "INVALID_WORKBOOK"
    ) {
      console.log(`   -> PASS (Received expected JSON error response, HTTP ${resB.status}, Content-Type: ${ctB})`);
    } else {
      console.error("   -> FAIL: Expected JSON error response but got:", resB.status, ctB, parsedB.data);
      process.exit(1);
    }

    // ----------------------------------------------------
    // Test C: POST non-existent API route
    // ----------------------------------------------------
    console.log("\nTest C: POST /api/engineering/not-exists:");
    const resC = await fetch(`http://127.0.0.1:${port}/api/engineering/not-exists`, {
      method: "POST",
    });

    const ctC = resC.headers.get("content-type") || "";
    const parsedC = await parseApiResponse<any>(resC, "/api/engineering/not-exists", "POST");

    if (
      resC.status === 404 &&
      ctC.includes("application/json") &&
      parsedC.data.error?.code === "API_ROUTE_NOT_FOUND" &&
      parsedC.data.error?.message === "POST /api/engineering/not-exists"
    ) {
      console.log(`   -> PASS (HTTP 404 JSON response: ${JSON.stringify(parsedC.data)})`);
    } else {
      console.error("   -> FAIL: Expected 404 JSON but got:", resC.status, ctC, parsedC.data);
      process.exit(1);
    }

    // ----------------------------------------------------
    // Test D: Defensive Client Response Parsing (parseApiResponse)
    // ----------------------------------------------------
    console.log("\nTest D: Defensive Client Response Parsing (parseApiResponse handling non-JSON):");
    const htmlResponse = new Response("<html><body>404 Not Found</body></html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });

    let caughtNonJsonError = false;
    try {
      await parseApiResponse(htmlResponse, "/api/test", "GET");
    } catch (err: any) {
      if (
        err.code === "NON_JSON_API_RESPONSE" &&
        err.endpoint === "/api/test" &&
        err.method === "GET" &&
        err.httpStatus === 200 &&
        err.contentType === "text/html" &&
        err.rawPreview.includes("404 Not Found")
      ) {
        caughtNonJsonError = true;
      } else {
        console.error("   -> Caught unexpected error:", err);
      }
    }

    if (caughtNonJsonError) {
      console.log("   -> PASS (parseApiResponse correctly threw NON_JSON_API_RESPONSE error with diagnostic info)");
    } else {
      console.error("   -> FAIL: parseApiResponse did not catch HTML correctly");
      process.exit(1);
    }

    console.log("\n==================================================");
    console.log("=== ALL G1-DEMO-HOTFIX ACCEPTANCE TESTS PASSED ===");
    console.log("==================================================\n");
  } catch (err) {
    console.error("Hotfix Test Suite Error:", err);
    process.exit(1);
  } finally {
    server.close();
  }
});
