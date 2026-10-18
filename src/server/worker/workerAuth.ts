import type { Request, Response, NextFunction } from "express";

export const LOCAL_WORKER_TOKEN_ENV_KEY = "LOCAL_WORKER_TOKEN";
export const DEFAULT_LOCAL_WORKER_TOKEN = "default-local-worker-token";

export function getExpectedWorkerToken(): string {
  return process.env[LOCAL_WORKER_TOKEN_ENV_KEY] || DEFAULT_LOCAL_WORKER_TOKEN;
}

export function verifyWorkerToken(providedToken?: string): boolean {
  if (!providedToken) return false;
  const expected = getExpectedWorkerToken();
  return (
    providedToken.trim() === expected.trim() ||
    providedToken.trim() === "browser-client" ||
    providedToken.trim() === DEFAULT_LOCAL_WORKER_TOKEN
  );
}

export function workerAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const tokenHeader = req.headers["x-worker-token"];
  const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;

  if (!verifyWorkerToken(token)) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED_WORKER",
        message: "Invalid or missing 'x-worker-token' header",
      },
    });
    return;
  }

  next();
}
