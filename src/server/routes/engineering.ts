import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { parseWorkbook } from "../excel.js";
import { buildFrontView, buildCadView } from "../cad.js";
import { buildAssembly } from "../assembly.js";
import { validateEngineeringData } from "../validate.js";
import { runReasoning } from "../ai/provider.js";
import {
  getRuntimeAiConfig,
  updateRuntimeAiConfig,
  testAiConnection,
} from "../ai/runtimeAiConfig.js";
import { FurnitureEngineeringSchema } from "../../shared/fes.js";
import { alignmentRouter } from "./alignmentRouter.js";
import { geometryReconstructionRouter } from "./geometryReconstruction.js";
import { globalEngineeringSessionStore } from "../engineeringSessionStore.js";
import {
  rateLimiterMiddleware,
  startParseJob,
  finishParseJob,
  getIdempotencyResult,
  getInFlightParseCount,
} from "../limiter/parseLimiter.js";

export const engineeringRouter = Router();
engineeringRouter.use(alignmentRouter);
engineeringRouter.use("/sessions", geometryReconstructionRouter);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Safe Multer Upload Middleware
const handleUpload = (req: any, res: any, next: any) => {
  upload.single("file")(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({
        error: {
          code: "UPLOAD_ERROR",
          message: err.message || "文件上传错误",
          details: [],
        },
      });
    }
    next();
  });
};

const excelParseLimiter = rateLimiterMiddleware({
  bucketName: "excel_parse",
  windowMs: 60000,
  maxRequests: 5,
  code: "EXCEL_PARSE_RATE_LIMITED",
  message: "Excel parse request rate limited",
});

engineeringRouter.post("/excel/parse", excelParseLimiter, handleUpload, (req: any, res: any) => {
  res.setHeader("Content-Type", "application/json");

  const requestId =
    (req.headers["x-parse-request-id"] as string) ||
    `parse-default-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const workspaceId = (req.headers["x-workspace-id"] as string) || "default";
  const ip = (req.headers["x-forwarded-for"] as string) || req.ip || "127.0.0.1";
  const fileName = req.file?.originalname || "unknown";
  const fileSize = req.file?.size || 0;
  const receivedAt = new Date().toISOString();

  // 1. Check idempotency cache
  const cachedResult = getIdempotencyResult(requestId);
  if (cachedResult) {
    console.log(`[ExcelParseRequest] DEDUPLICATED requestId=${requestId} workspaceId=${workspaceId}`);
    return res.status(200).json(cachedResult);
  }

  // 2. Check workspace concurrency
  const started = startParseJob(workspaceId, requestId);
  if (!started) {
    console.warn(`[ExcelParseRequest] CONCURRENT_REJECTED requestId=${requestId} workspaceId=${workspaceId}`);
    return res.status(409).json({
      success: false,
      error: {
        code: "EXCEL_PARSE_ALREADY_RUNNING",
        message: "An Excel parse job is currently running for this workspace.",
      },
    });
  }

  const inFlightCount = getInFlightParseCount();
  console.log(
    `[ExcelParseRequest] requestId=${requestId} workspaceId=${workspaceId} fileName=${fileName} fileSize=${fileSize} ip=${ip} receivedAt=${receivedAt} limiterBucket=excel_parse inFlightCount=${inFlightCount}`
  );
  console.log(`[ExcelParse] START requestId=${requestId}`);

  try {
    if (!req.file) {
      console.log(`[ExcelParse] FAILED requestId=${requestId} error=No file uploaded`);
      finishParseJob(workspaceId, requestId);
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_WORKBOOK",
          message: "No file uploaded. Please upload an Excel file using the 'file' field.",
          details: [],
        },
      });
    }

    console.log(`[ExcelParse] WORKBOOK_LOADED requestId=${requestId}`);
    const parseResult = parseWorkbook(req.file.buffer, req.file.originalname);
    if (!parseResult.success) {
      console.log(`[ExcelParse] FAILED requestId=${requestId} error=${parseResult.error}`);
      finishParseJob(workspaceId, requestId);
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_WORKBOOK",
          message: parseResult.error,
          details: parseResult.details || [],
        },
      });
    }

    console.log(`[ExcelParse] VALIDATION_START requestId=${requestId}`);
    const report = validateEngineeringData(parseResult.fes);

    // Attach FES to active engineering session
    const sessionIdHeader = req.headers["x-session-id"] as string;
    const sessionRes = globalEngineeringSessionStore.attachFesToSession(sessionIdHeader || "", parseResult.fes, workspaceId);

    const responseBody = {
      success: true,
      fes: parseResult.fes,
      schemaValid: true,
      engineeringValidation: report,
      session: sessionRes.session,
    };

    console.log(`[ExcelParse] COMPLETE requestId=${requestId}`);
    finishParseJob(workspaceId, requestId, responseBody);
    return res.status(200).json(responseBody);
  } catch (e: any) {
    const errorMsg = e?.message || String(e);
    console.log(`[ExcelParse] FAILED requestId=${requestId} error=${errorMsg}`);
    finishParseJob(workspaceId, requestId);
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_WORKBOOK",
        message: errorMsg,
        details: [],
      },
    });
  }
});

// GET list of available sample files
engineeringRouter.get("/excel/samples", (_req, res) => {
  try {
    const sampleDir = path.join(process.cwd(), "sample");
    if (!fs.existsSync(sampleDir)) return res.json({ samples: [] });
    const files = fs.readdirSync(sampleDir).filter((f) => f.endsWith(".xlsx"));
    res.json({ samples: files });
  } catch (e: any) {
    res.status(500).json({ error: { message: e.message } });
  }
});

// POST load a specific sample file by name
engineeringRouter.post("/excel/sample/:name", (req, res) => {
  try {
    let filename = req.params.name;
    let samplePath = path.join(process.cwd(), "sample", filename);
    if (!fs.existsSync(samplePath) && !filename.endsWith(".xlsx")) {
      samplePath = path.join(process.cwd(), "sample", `${filename}.xlsx`);
      if (fs.existsSync(samplePath)) {
        filename = `${filename}.xlsx`;
      }
    }
    if (!fs.existsSync(samplePath)) {
      // Check for common aliases or substring match in sample directory
      const sampleDir = path.join(process.cwd(), "sample");
      if (fs.existsSync(sampleDir)) {
        const files = fs.readdirSync(sampleDir).filter((f) => f.endsWith(".xlsx"));
        const matched = files.find((f) => f.toLowerCase().includes(req.params.name.toLowerCase())) ||
                        files.find((f) => f.includes("sofa")) ||
                        files[0];
        if (matched) {
          filename = matched;
          samplePath = path.join(sampleDir, matched);
        }
      }
    }
    if (!fs.existsSync(samplePath)) {
      return res.status(404).json({ error: { message: `Sample file '${filename}' not found` } });
    }
    const buf = fs.readFileSync(samplePath);
    const parseResult = parseWorkbook(buf, filename);
    if (!parseResult.success) {
      return res.status(400).json({
        error: {
          code: "INVALID_WORKBOOK",
          message: parseResult.error,
          details: parseResult.details || [],
        },
      });
    }
    const report = validateEngineeringData(parseResult.fes);
    const sessionRes = globalEngineeringSessionStore.attachFesToSession("", parseResult.fes, "default-workspace");

    res.json({
      fes: parseResult.fes,
      schemaValid: true,
      engineeringValidation: report,
      session: sessionRes.session,
    });
  } catch (e: any) {
    res.status(400).json({
      error: { code: "SAMPLE_LOAD_ERROR", message: e?.message || String(e) },
    });
  }
});


engineeringRouter.post("/cad/:view", (req, res) => {
  try {
    const viewParam = (req.params.view || "front").toLowerCase();
    const view = (viewParam === "side" ? "side" : viewParam === "top" ? "top" : "front") as "front" | "side" | "top";

    const parseRes = FurnitureEngineeringSchema.safeParse(req.body);
    if (!parseRes.success) {
      return res.status(400).json({
        error: {
          code: "INVALID_FES_SCHEMA",
          message: "Request body does not conform to FurnitureEngineeringSchema",
          details: parseRes.error.issues,
        },
      });
    }

    const fes = parseRes.data;
    const report = validateEngineeringData(fes);

    if (!report.valid || report.level === "fail") {
      return res.status(422).json({
        error: {
          code: "ENGINEERING_VALIDATION_FAILED",
          message: "Engineering validation failed. Cannot build CAD document.",
          validation: report,
        },
      });
    }

    const cad = buildCadView(fes, view);
    res.json({ cad });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

engineeringRouter.post("/cad/front", (req, res) => {
  try {
    const parseRes = FurnitureEngineeringSchema.safeParse(req.body);
    if (!parseRes.success) {
      return res.status(400).json({
        error: {
          code: "INVALID_FES_SCHEMA",
          message: "Request body does not conform to FurnitureEngineeringSchema",
          details: parseRes.error.issues,
        },
      });
    }

    const fes = parseRes.data;
    const report = validateEngineeringData(fes);

    if (!report.valid || report.level === "fail") {
      return res.status(422).json({
        error: {
          code: "ENGINEERING_VALIDATION_FAILED",
          message: "Engineering validation failed. Cannot build CAD document.",
          validation: report,
        },
      });
    }

    const cad = buildCadView(fes, "front");
    res.json({ cad });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

engineeringRouter.post("/assembly", (req, res) => {
  try {
    const parseRes = FurnitureEngineeringSchema.safeParse(req.body);
    if (!parseRes.success) {
      return res.status(400).json({
        error: {
          code: "INVALID_FES_SCHEMA",
          message: "Request body does not conform to FurnitureEngineeringSchema",
          details: parseRes.error.issues,
        },
      });
    }

    const fes = parseRes.data;
    const report = validateEngineeringData(fes);

    if (!report.valid || report.level === "fail") {
      return res.status(422).json({
        error: {
          code: "ENGINEERING_VALIDATION_FAILED",
          message: "Engineering validation failed. Cannot build Assembly document.",
          validation: report,
        },
      });
    }

    const assembly = buildAssembly(fes);
    res.json({ assembly });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// --- Gate G3-AB Endpoints ---
import { ReferenceObservationService } from "../ai/observationService.js";
import { CalibrationAdapter } from "../inference/calibrationAdapter.js";
import { DeterministicConstraintSolver } from "../inference/constraintSolver.js";
import { FesDraftBuilder } from "../inference/fesDraftBuilder.js";
import { generateGeometryDraftExcel } from "../excelDraftExport.js";

const refUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }).fields([
  { name: "hero", maxCount: 1 },
  { name: "front", maxCount: 1 },
  { name: "side", maxCount: 1 },
  { name: "top", maxCount: 1 },
]);

engineeringRouter.post("/g3/references/analyze", refUpload, async (req: any, res: any) => {
  try {
    const files = req.files || {};
    const heroFile = files.hero?.[0];
    const frontFile = files.front?.[0];
    const sideFile = files.side?.[0];
    const topFile = files.top?.[0];

    const sku = req.body?.sku || "G2.3-ROUNDARM-SOFA-2650";
    const overallWidth = Number(req.body?.overallWidth || 2650);
    const overallDepth = Number(req.body?.overallDepth || 1050);
    const overallHeight = Number(req.body?.overallHeight || 850);
    const provider = req.body?.provider || "routerhub";
    const model = req.body?.model || "gemini-3.6-flash";

    // Prepare save directory for uploaded reference files
    const timestamp = Date.now();
    const sanitizeSku = sku.replace(/[^a-zA-Z0-9_-]/g, "_");
    const uploadDir = path.join(process.cwd(), "uploads", "references", `${sanitizeSku}_${timestamp}`);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const saveFile = (f: any, prefix: string) => {
      if (!f) return undefined;
      const ext = path.extname(f.originalname) || (f.mimetype.includes("png") ? ".png" : f.mimetype.includes("webp") ? ".webp" : ".jpg");
      const filename = `${prefix}${ext}`;
      const filePath = path.join(uploadDir, filename);
      fs.writeFileSync(filePath, f.buffer);
      const relativeUrl = `/uploads/references/${sanitizeSku}_${timestamp}/${filename}`;
      return {
        buffer: f.buffer,
        mimeType: f.mimetype || "image/png",
        filename: f.originalname || filename,
        url: relativeUrl,
      };
    };

    const heroUpload = saveFile(heroFile, "hero");
    const frontUpload = saveFile(frontFile, "front");
    const sideUpload = saveFile(sideFile, "side");
    const topUpload = saveFile(topFile, "top");

    if (!heroUpload || !frontUpload || !sideUpload) {
      return res.status(400).json({
        error: {
          code: "MISSING_REFERENCE_IMAGES",
          message: "Please upload hero, front, and side reference images (PNG, JPEG, or WEBP).",
        },
      });
    }

    const service = new ReferenceObservationService();
    const { observationDocument, telemetry } = await service.observeFromReferenceImages({
      sku,
      knownDimensions: { width: overallWidth, depth: overallDepth, height: overallHeight },
      images: { hero: heroUpload, front: frontUpload, side: sideUpload, top: topUpload },
      provider: provider as any,
      model,
    });

    const calibrationAdapter = new CalibrationAdapter({
      overallWidthMm: overallWidth,
      overallDepthMm: overallDepth,
      overallHeightMm: overallHeight,
    });

    const solver = new DeterministicConstraintSolver();
    const report = solver.solve({
      sku: observationDocument.sku,
      knownOverallWidthMm: observationDocument.knownOverallDimensions.width.value,
      knownOverallDepthMm: observationDocument.knownOverallDimensions.depth.value,
      knownOverallHeightMm: observationDocument.knownOverallDimensions.height.value,
      componentObservations: observationDocument.components,
    });

    const builder = new FesDraftBuilder();
    const { draft, fes } = builder.buildDraft(observationDocument, report);

    const validation = validateEngineeringData(fes);

    res.json({
      observationDocument,
      inferenceReport: report,
      fesDraft: draft,
      fes,
      validation,
      telemetry,
      referenceUrls: {
        hero: heroUpload?.url,
        front: frontUpload?.url,
        side: sideUpload?.url,
        top: topUpload?.url || null,
      },
    });
  } catch (e: any) {
    console.error("G3-AB analyze error:", e);
    res.status(500).json({ error: { message: e?.message || String(e) } });
  }
});

engineeringRouter.post("/g3/observe", async (req, res) => {
  try {
    const sku = req.body?.sku || "G2.3-ROUNDARM-SOFA-2650";
    const knownDimensions = req.body?.knownDimensions || { width: 2650, depth: 1050, height: 850 };
    const service = new ReferenceObservationService();
    const obsDoc = await service.observeProduct(sku, knownDimensions);
    res.json({ observationDocument: obsDoc });
  } catch (e: any) {
    res.status(500).json({ error: { message: e?.message || String(e) } });
  }
});

engineeringRouter.post("/g3/solve", async (req, res) => {
  try {
    const obsDoc = req.body?.observationDocument;
    if (!obsDoc) {
      return res.status(400).json({ error: { message: "Missing observationDocument in body" } });
    }

    const solver = new DeterministicConstraintSolver();
    const report = solver.solve({
      sku: obsDoc.sku,
      knownOverallWidthMm: obsDoc.knownOverallDimensions.width.value,
      knownOverallDepthMm: obsDoc.knownOverallDimensions.depth.value,
      knownOverallHeightMm: obsDoc.knownOverallDimensions.height.value,
      componentObservations: obsDoc.components,
    });

    const builder = new FesDraftBuilder();
    const { draft, fes } = builder.buildDraft(obsDoc, report);

    const validation = validateEngineeringData(fes);

    res.json({
      inferenceReport: report,
      fesDraft: draft,
      fes,
      validation,
    });
  } catch (e: any) {
    res.status(500).json({ error: { message: e?.message || String(e) } });
  }
});

engineeringRouter.post("/g3/export-excel", async (req, res) => {
  try {
    const { draft, observationDocument } = req.body;
    if (!draft || !observationDocument) {
      return res.status(400).json({ error: { message: "Missing draft or observationDocument" } });
    }

    const buffer = generateGeometryDraftExcel(draft, observationDocument);
    const filename = `${draft.sku || "Geometry"}_Draft.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (e: any) {
    res.status(500).json({ error: { message: e?.message || String(e) } });
  }
});

engineeringRouter.post("/validate", (req, res) => {
  try {
    const fes = FurnitureEngineeringSchema.parse(req.body);
    const report = validateEngineeringData(fes);
    res.json({ validation: report });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// ==========================================
// --- GATE G4-SYSTEM-AUDIT-01: Session APIs ---
// ==========================================
import {
  isProductionEligible,
  resolveComponentBinding,
} from "../../shared/engineeringSession.js";

engineeringRouter.get("/engineering/sessions/active", (req, res) => {
  const workspaceId = (req.query.workspaceId as string) || "default-workspace";
  const session = globalEngineeringSessionStore.getActiveSession(workspaceId);
  res.json({ success: true, session });
});

engineeringRouter.post("/engineering/sessions", (req, res) => {
  try {
    const sessionId = req.body.id;
    const workspaceId = req.body.workspaceId || "default-workspace";
    const sku = req.body.sku || "FURNITURE-SKU-001";

    const session = globalEngineeringSessionStore.createOrGetSession(sessionId, workspaceId, sku);
    if (req.body.referenceImageArtifactId) session.referenceImageArtifactId = req.body.referenceImageArtifactId;
    if (Array.isArray(req.body.aiMeshArtifactIds)) session.aiMeshArtifactIds = req.body.aiMeshArtifactIds;
    if (req.body.fesDocumentId) session.fesDocumentId = req.body.fesDocumentId;
    if (req.body.activeComponentId) session.activeComponentId = req.body.activeComponentId;
    if (Array.isArray(req.body.componentBindings)) session.componentBindings = req.body.componentBindings;

    globalEngineeringSessionStore.saveSession(session);
    res.json({ success: true, session });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

engineeringRouter.get("/engineering/sessions/:sessionId", (req, res) => {
  const session = globalEngineeringSessionStore.getSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: { code: "SESSION_NOT_FOUND", message: `Session '${req.params.sessionId}' not found.` } });
  }
  res.json({ success: true, session });
});

engineeringRouter.patch("/engineering/sessions/:sessionId", (req, res) => {
  const session = globalEngineeringSessionStore.getSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: { code: "SESSION_NOT_FOUND", message: `Session '${req.params.sessionId}' not found.` } });
  }

  if (req.body.status) session.status = req.body.status;
  if (req.body.fesDocumentId) session.fesDocumentId = req.body.fesDocumentId;
  if (req.body.activeComponentId) session.activeComponentId = req.body.activeComponentId;
  if (req.body.referenceImageArtifactId) session.referenceImageArtifactId = req.body.referenceImageArtifactId;
  if (Array.isArray(req.body.aiMeshArtifactIds)) session.aiMeshArtifactIds = req.body.aiMeshArtifactIds;

  globalEngineeringSessionStore.saveSession(session);
  res.json({ success: true, session });
});

engineeringRouter.post("/engineering/sessions/:sessionId/bind-artifact", (req, res) => {
  const { partId, artifactId, fesDocument, bindingType, confidence } = req.body;
  if (!partId || !artifactId) {
    return res.status(400).json({ error: { code: "INVALID_BINDING_REQUEST", message: "partId and artifactId are required." } });
  }

  const result = globalEngineeringSessionStore.attachMeshArtifactToSession({
    sessionId: req.params.sessionId,
    partId,
    artifactId,
    fesDocument,
  });

  if (result.status === "UNRESOLVED_BINDING" || !result.binding) {
    return res.status(422).json({
      success: false,
      error: {
        code: "UNRESOLVED_BINDING",
        message: result.reason || `Cannot uniquely map partId '${partId}' to a component in session.`,
      },
    });
  }

  res.json({ success: true, binding: result.binding, session: result.session, alignmentSessionId: result.alignmentSessionId });
});

engineeringRouter.get("/engineering/sessions/:sessionId/diagnostics", (req, res) => {
  const session = globalEngineeringSessionStore.getSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: { code: "SESSION_NOT_FOUND", message: `Session '${req.params.sessionId}' not found.` } });
  }

  const fesDocument = req.body?.fesDocument || session.fesDocument || null;
  const eligibility = isProductionEligible(session, fesDocument);

  res.json({
    success: true,
    sessionId: session.id,
    diagnostics: session.diagnostics,
    productionEligibility: eligibility,
  });
});

engineeringRouter.post("/agent/plan", async (req, res) => {
  try {
    res.json(await runReasoning({
      provider: req.body.provider,
      model: req.body.model,
      reasoning: req.body.reasoning ?? "medium",
      instructions: "You are a furniture engineering orchestrator. Never invent dimensions. Return a concise execution plan and explicitly list missingEngineeringData.",
      input: req.body.input,
    }));
  } catch (e: any) {
    res.status(502).json({ error: e?.message || String(e) });
  }
});

// GET /api/engineering/config/ai - Retrieve active AI configuration
engineeringRouter.get("/config/ai", (_req, res) => {
  const cfg = getRuntimeAiConfig();
  const maskedKey = cfg.apiKey
    ? (cfg.apiKey.length > 8 ? `${cfg.apiKey.slice(0, 4)}...${cfg.apiKey.slice(-4)}` : "********")
    : "";
  res.json({
    ok: true,
    config: {
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      reasonModel: cfg.reasonModel,
      visionModel: cfg.visionModel,
      imageModel: cfg.imageModel,
      apiKeyMasked: maskedKey,
      hasKey: Boolean(cfg.apiKey),
      updatedAt: cfg.updatedAt,
    },
  });
});

// POST /api/engineering/config/ai - Update and activate AI configuration
engineeringRouter.post("/config/ai", (req, res) => {
  try {
    const { provider, baseUrl, apiKey, reasonModel, visionModel, imageModel } = req.body || {};
    const updates: any = {};
    if (provider) updates.provider = provider;
    if (baseUrl) updates.baseUrl = String(baseUrl).trim();
    if (apiKey !== undefined && String(apiKey).trim() !== "") updates.apiKey = String(apiKey).trim();
    if (reasonModel) updates.reasonModel = String(reasonModel).trim();
    if (visionModel) updates.visionModel = String(visionModel).trim();
    if (imageModel) updates.imageModel = String(imageModel).trim();

    const updated = updateRuntimeAiConfig(updates);
    const maskedKey = updated.apiKey
      ? (updated.apiKey.length > 8 ? `${updated.apiKey.slice(0, 4)}...${updated.apiKey.slice(-4)}` : "********")
      : "";

    res.json({
      ok: true,
      message: "AI 配置已更新生效",
      config: {
        provider: updated.provider,
        baseUrl: updated.baseUrl,
        reasonModel: updated.reasonModel,
        visionModel: updated.visionModel,
        imageModel: updated.imageModel,
        apiKeyMasked: maskedKey,
        hasKey: Boolean(updated.apiKey),
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "更新 AI 配置失败" });
  }
});

// POST /api/engineering/config/ai/test - Test connection
engineeringRouter.post("/config/ai/test", async (req, res) => {
  try {
    const result = await testAiConnection(req.body || {});
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, message: `测试发生异常: ${err.message || String(err)}`, latencyMs: 0 });
  }
});


