import { Router } from "express";
import { alignmentSessionStore } from "../alignment/alignmentSessionStore.js";
import { createAlignmentSession } from "../../shared/alignmentSession.js";
import { runAlignmentPipeline } from "../../client/utils/alignment/alignmentOrchestrator.js";

export const alignmentRouter = Router();

// POST /api/engineering/alignment-sessions
alignmentRouter.post("/alignment-sessions", (req, res) => {
  try {
    const {
      artifactId,
      partId,
      engineeringDocumentId,
      sku,
      componentId,
      geometrySource,
      workspaceId,
    } = req.body || {};

    if (!artifactId) {
      return res.status(400).json({
        error: {
          code: "MISSING_ARTIFACT_ID",
          message: "artifactId is required to create an alignment session",
        },
      });
    }

    const session = createAlignmentSession({
      artifactId,
      partId: partId || "part-unknown",
      engineeringDocumentId,
      sku,
      componentId,
      geometrySource,
      workspaceId,
    });

    const saved = alignmentSessionStore.saveSession(session);
    return res.json(saved);
  } catch (err: any) {
    return res.status(500).json({
      error: { code: "SESSION_CREATE_ERROR", message: err?.message || String(err) },
    });
  }
});

// GET /api/engineering/alignment-sessions
alignmentRouter.get("/alignment-sessions", (_req, res) => {
  try {
    const list = alignmentSessionStore.listSessions();
    return res.json({ sessions: list });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: "SESSION_LIST_ERROR", message: err?.message || String(err) },
    });
  }
});

// GET /api/engineering/alignment-sessions/:sessionId
alignmentRouter.get("/alignment-sessions/:sessionId", (req, res) => {
  try {
    const session = alignmentSessionStore.getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({
        error: {
          code: "SESSION_NOT_FOUND",
          message: `Alignment session '${req.params.sessionId}' not found`,
        },
      });
    }
    return res.json(session);
  } catch (err: any) {
    return res.status(500).json({
      error: { code: "SESSION_FETCH_ERROR", message: err?.message || String(err) },
    });
  }
});

// POST /api/engineering/alignment-sessions/:sessionId/run
alignmentRouter.post("/alignment-sessions/:sessionId/run", (req, res) => {
  try {
    const session = alignmentSessionStore.getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({
        error: {
          code: "SESSION_NOT_FOUND",
          message: `Alignment session '${req.params.sessionId}' not found`,
        },
      });
    }

    const { fes, rawBounds, axisMapping, componentId, engineeringDocumentId, sku } = req.body || {};

    // Allow updating componentId or document details during run if provided
    if (componentId) session.componentId = componentId;
    if (engineeringDocumentId) session.engineeringDocumentId = engineeringDocumentId;
    if (sku) session.sku = sku;

    const updatedSession = runAlignmentPipeline({
      session,
      fes,
      rawBounds,
      axisMapping,
    });

    const saved = alignmentSessionStore.saveSession(updatedSession);
    return res.json(saved);
  } catch (err: any) {
    return res.status(500).json({
      error: { code: "SESSION_RUN_ERROR", message: err?.message || String(err) },
    });
  }
});
