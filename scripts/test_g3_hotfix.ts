import express from "express";
import http from "http";
import path from "path";
import { g3Router } from "../src/server/routes/g3Router.js";
import { resolveVisionModel, VisionOutputSchema } from "../src/server/ai/visionProvider.js";
import { readJsonApiResponse } from "../src/client/api.js";

async function runHotfixVerification() {
  console.log("==================================================");
  console.log("   RUNNING G3-AB-HOTFIX VERIFICATION TEST         ");
  console.log("==================================================\n");

  // 1. Test Model Resolution & Unsupported Model Error
  console.log("[1/6] Testing resolveVisionModel & VISION_MODEL_UNSUPPORTED...");
  const validModel = resolveVisionModel("routerhub", "gemini-3.6-flash");
  console.log(`  ✓ Valid model resolved: ${validModel}`);

  try {
    resolveVisionModel("routerhub", "unsupported-model-999");
    throw new Error("Failed: Should have thrown VISION_MODEL_UNSUPPORTED");
  } catch (err: any) {
    if (err.code === "VISION_MODEL_UNSUPPORTED") {
      console.log(`  ✓ Correctly threw VISION_MODEL_UNSUPPORTED for unsupported model: ${err.message.slice(0, 70)}...`);
    } else {
      throw err;
    }
  }

  // 2. Test Zod Schema Validation
  console.log("\n[2/6] Testing Zod Structured Schema Validation on Vision Output...");
  const validMockVisionData = {
    components: [
      {
        componentIdDraft: "ARM-L-OUT",
        semanticType: "armrest",
        visibleIn: ["ref_front_01", "ref_side_01"],
        confidence: 0.92,
        bboxNormalized: { uMin: 0.0, vMin: 0.3, uMax: 0.1, vMax: 1.0 },
      },
    ],
  };
  const zodParse = VisionOutputSchema.safeParse(validMockVisionData);
  if (!zodParse.success) {
    throw new Error("Valid vision data failed Zod schema parsing");
  }
  console.log("  ✓ Zod Schema validated valid Vision output correctly");

  const invalidMockVisionData = { components: [] };
  const zodInvalidParse = VisionOutputSchema.safeParse(invalidMockVisionData);
  if (zodInvalidParse.success) {
    throw new Error("Failed: Empty components array should have failed Zod schema");
  }
  console.log("  ✓ Zod Schema correctly rejected invalid empty components output");

  // 3. Spin up local Express server to test API routes and middleware
  console.log("\n[3/6] Starting ephemeral Express server for HTTP API test...");
  const app = express();
  app.use(express.json());
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
  app.use("/api/g3", g3Router);

  // Unified API 404 handler
  app.all("/api/*all", (req, res) => {
    res.status(404).json({
      error: {
        code: "API_ROUTE_NOT_FOUND",
        message: `${req.method} ${req.originalUrl}`,
      },
    });
  });

  // SPA Fallback simulation
  app.get("*all", (_req, res) => {
    res.send("<!doctype html><html><body>SPA Fallback Index</body></html>");
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`  ✓ Express server listening on ${baseUrl}`);

  try {
    // 4. Test non-existent API route /api/g3/not-exists
    console.log("\n[4/6] Testing non-existent API route /api/g3/not-exists...");
    const res404 = await fetch(`${baseUrl}/api/g3/not-exists`);
    const status404 = res404.status;
    const contentType404 = res404.headers.get("content-type") || "";

    if (status404 !== 404 || !contentType404.includes("application/json")) {
      throw new Error(`Failed: Non-existent API returned status ${status404} with content-type ${contentType404}`);
    }

    const data404 = await res404.json();
    if (data404.error?.code !== "API_ROUTE_NOT_FOUND") {
      throw new Error(`Failed: Expected error code API_ROUTE_NOT_FOUND, got ${data404.error?.code}`);
    }
    console.log("  ✓ /api/g3/not-exists returned HTTP 404 application/json with code API_ROUTE_NOT_FOUND (No HTML!)");

    // 5. Test API Smoke Mode (POST /api/g3/references/analyze?mode=smoke)
    console.log("\n[5/6] Testing API Smoke Mode (POST /api/g3/references/analyze?mode=smoke)...");
    const formData = new FormData();
    const dummyBlob = new Blob(["dummy png data"], { type: "image/png" });
    formData.append("hero", dummyBlob, "hero.png");
    formData.append("front", dummyBlob, "front.png");
    formData.append("side", dummyBlob, "side.png");
    formData.append("sku", "G2.3-ROUNDARM-SOFA-2650");
    formData.append("overallWidth", "2650");

    const resSmoke = await fetch(`${baseUrl}/api/g3/references/analyze?mode=smoke`, {
      method: "POST",
      body: formData,
    });

    const smokeData = await readJsonApiResponse(resSmoke, "/api/g3/references/analyze?mode=smoke", "POST");
    if (!smokeData.ok || smokeData.mode !== "smoke" || !smokeData.filesReceived.hero) {
      throw new Error("Smoke API response invalid: " + JSON.stringify(smokeData));
    }
    console.log("  ✓ Smoke API mode verified HTTP 200 JSON with filesReceived & fields confirmed");

    // 6. Test full pipeline with mock files
    console.log("\n[6/6] Testing full G3 multimodal reference analysis pipeline...");
    formData.append("top", dummyBlob, "top.png");
    formData.append("overallDepth", "1050");
    formData.append("overallHeight", "850");
    formData.append("provider", "routerhub");
    formData.append("model", "gemini-3.6-flash");

    const resPipeline = await fetch(`${baseUrl}/api/g3/references/analyze`, {
      method: "POST",
      body: formData,
    });

    const pipelineData = await readJsonApiResponse(resPipeline, "/api/g3/references/analyze", "POST");
    if (pipelineData.state !== "fes_validated" || !pipelineData.validation?.valid) {
      throw new Error("Pipeline failed or state is not fes_validated: " + JSON.stringify(pipelineData));
    }

    console.log(`  ✓ Pipeline completed with state: ${pipelineData.state}`);
    console.log(`  ✓ FES Validation: PASS`);
    console.log(`  ✓ Telemetry recorded: ${pipelineData.telemetry?.provider} (${pipelineData.telemetry?.resolvedModel}) - $${pipelineData.telemetry?.cost}`);
  } finally {
    server.close();
  }

  console.log("\n==================================================");
  console.log("   G3-AB-HOTFIX VERIFICATION RESULT: PASS         ");
  console.log("==================================================");
}

runHotfixVerification().catch((err) => {
  console.error("\n❌ HOTFIX TEST FAILED:", err);
  process.exit(1);
});
