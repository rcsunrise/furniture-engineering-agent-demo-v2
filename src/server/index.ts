import express from "express";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import { engineeringRouter } from "./routes/engineering.js";
import { g3Router } from "./routes/g3Router.js";
import { workerRouter } from "./routes/worker.js";
import { workerRuntimeRouter } from "./routes/workerRuntime.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  // Serve static reference uploads
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // API Routes
  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "furniture-engineering-agent-demo-v1" }));
  app.use("/api/g3", g3Router);
  app.use("/api/engineering/g3", g3Router);
  app.use("/api/engineering", engineeringRouter);
  app.use("/api/worker/runtime", workerRuntimeRouter);
  app.use("/api/worker", workerRouter);

  // Unified API 404 handler for any unhandled /api requests before Vite / SPA fallback
  app.all("/api/*all", (req, res) => {
    res.status(404).json({
      error: {
        code: "API_ROUTE_NOT_FOUND",
        message: `${req.method} ${req.originalUrl}`,
      },
    });
  });

  // Global Express error handler for API routes
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Express API Error:", err);
    res.status(500).json({
      error: {
        code: err?.code || "SERVER_ERROR",
        message: err?.message || "服务器内部处理错误",
      },
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
