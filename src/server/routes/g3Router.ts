import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { ReferenceObservationService } from "../ai/observationService.js";
import { CalibrationAdapter } from "../inference/calibrationAdapter.js";
import { DeterministicConstraintSolver } from "../inference/constraintSolver.js";
import { FesDraftBuilder } from "../inference/fesDraftBuilder.js";
import { validateEngineeringData } from "../validate.js";
import { resolveVisionModel } from "../ai/visionProvider.js";

export const g3Router = express.Router();

const refUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
}).fields([
  { name: "hero", maxCount: 1 },
  { name: "front", maxCount: 1 },
  { name: "side", maxCount: 1 },
  { name: "top", maxCount: 1 },
]);

/**
 * POST /api/g3/references/analyze
 * Supports multipart/form-data with hero, front, side, top images and SKU metadata.
 * Supports mode=smoke query param for quick API smoke verification.
 */
g3Router.post("/references/analyze", refUpload, async (req: any, res: any) => {
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
    const visionProvider = req.body?.visionProvider || req.body?.provider || "gemini";
    const visionModel = req.body?.visionModel || req.body?.model || "gemini-2.5-flash";
    const reasonProvider = req.body?.reasonProvider || "routerhub";
    const reasonModel = req.body?.reasonModel || "openai/gpt-5.6-sol";

    // 1. API Smoke Test Mode
    if (req.query?.mode === "smoke") {
      return res.status(200).json({
        ok: true,
        mode: "smoke",
        endpoint: "/api/g3/references/analyze",
        filesReceived: {
          hero: !!heroFile,
          front: !!frontFile,
          side: !!sideFile,
          top: !!topFile,
        },
        fields: {
          sku,
          overallWidth,
          overallDepth,
          overallHeight,
          visionProvider,
          visionModel,
          reasonProvider,
          reasonModel,
        },
      });
    }

    // 2. Validate Model String early before saving files
    let resolvedModel: string;
    try {
      resolvedModel = resolveVisionModel(visionProvider, visionModel);
    } catch (modelErr: any) {
      return res.status(422).json({
        state: "vision_failed",
        error: {
          code: modelErr.code || "VISION_MODEL_UNSUPPORTED",
          message: modelErr.message,
        },
      });
    }

    // 3. Prepare upload directory
    const timestamp = Date.now();
    const sanitizeSku = sku.replace(/[^a-zA-Z0-9_-]/g, "_");
    const uploadDir = path.join(process.cwd(), "uploads", "references", `${sanitizeSku}_${timestamp}`);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const saveFile = (f: any, prefix: string) => {
      if (!f) return undefined;
      const ext =
        path.extname(f.originalname) ||
        (f.mimetype.includes("png") ? ".png" : f.mimetype.includes("webp") ? ".webp" : ".jpg");
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

    // State 1: Check Required Reference Images
    if (!heroUpload || !frontUpload || !sideUpload) {
      return res.status(400).json({
        state: "reference_ready",
        error: {
          code: "MISSING_REFERENCE_IMAGES",
          message: "Required reference images (hero, front, side) are missing. Please upload all three required views.",
        },
      });
    }

    // State 2: vision_running -> Multimodal Vision Provider Analysis
    const service = new ReferenceObservationService();
    let obsDoc;
    let telemetry;
    try {
      const result = await service.observeFromReferenceImages({
        sku,
        knownDimensions: { width: overallWidth, depth: overallDepth, height: overallHeight },
        images: { hero: heroUpload, front: frontUpload, side: sideUpload, top: topUpload },
        provider: visionProvider,
        model: resolvedModel,
      });
      obsDoc = result.observationDocument;
      telemetry = result.telemetry;
    } catch (vErr: any) {
      return res.status(422).json({
        state: "vision_failed",
        error: {
          code: vErr.code || "VISION_ANALYSIS_FAILED",
          message: vErr.message || String(vErr),
        },
      });
    }

    // State 3 & 4: observation_ready & calibrating
    const calibrationAdapter = new CalibrationAdapter({
      overallWidthMm: overallWidth,
      overallDepthMm: overallDepth,
      overallHeightMm: overallHeight,
    });

    // State 5 & 6: calibrated & solving
    const solver = new DeterministicConstraintSolver();
    const report = solver.solve({
      sku: obsDoc.sku,
      knownOverallWidthMm: obsDoc.knownOverallDimensions.width.value,
      knownOverallDepthMm: obsDoc.knownOverallDimensions.depth.value,
      knownOverallHeightMm: obsDoc.knownOverallDimensions.height.value,
      componentObservations: obsDoc.components,
    });

    // State 7: draft_ready
    const builder = new FesDraftBuilder();
    const { draft, fes } = builder.buildDraft(obsDoc, report);

    // State 8: fes_validated
    const validation = validateEngineeringData(fes);

    return res.status(200).json({
      state: "fes_validated",
      observationDocument: obsDoc,
      inferenceReport: report,
      fesDraft: draft,
      fes,
      validation,
      telemetry,
      referenceUrls: {
        hero: heroUpload.url,
        front: frontUpload.url,
        side: sideUpload.url,
        top: topUpload?.url || null,
      },
    });
  } catch (e: any) {
    console.error("G3-AB analyze unexpected error:", e);
    return res.status(500).json({
      error: {
        code: e?.code || "SERVER_ERROR",
        message: e?.message || String(e),
      },
    });
  }
});
