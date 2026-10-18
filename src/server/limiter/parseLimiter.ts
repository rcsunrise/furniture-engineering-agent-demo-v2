import { Request, Response, NextFunction } from "express";

export interface RateLimitBucketOptions {
  bucketName?: string;
  windowMs: number;
  maxRequests: number;
  code?: string;
  message?: string;
}

// Memory store for rate limits per bucket & key
const bucketStores = new Map<string, Map<string, number[]>>();

// Concurrency manager per workspace for Excel Parse
export interface ActiveJob {
  requestId: string;
  workspaceId: string;
  startTime: number;
}

const activeParseJobs = new Map<string, ActiveJob>();

// Idempotency cache for recent completed parse responses: requestId -> { timestamp, responseData }
const idempotencyCache = new Map<string, { timestamp: number; responseData: any }>();

export function rateLimiterMiddleware(options: RateLimitBucketOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const bucketName = options.bucketName || "default";
    const ip = (req.headers["x-forwarded-for"] as string) || req.ip || "127.0.0.1";
    const key = `${ip}`;

    let bucketMap = bucketStores.get(bucketName);
    if (!bucketMap) {
      bucketMap = new Map();
      bucketStores.set(bucketName, bucketMap);
    }

    const now = Date.now();
    let timestamps = bucketMap.get(key) || [];
    timestamps = timestamps.filter((ts) => now - ts < options.windowMs);

    if (timestamps.length >= options.maxRequests) {
      const oldest = timestamps[0];
      const retryAfterMs = Math.max(1000, options.windowMs - (now - oldest));
      const code = options.code || "RATE_LIMITED";
      const message = options.message || `Rate limit exceeded for bucket '${bucketName}'`;

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000).toString());
      return res.status(429).json({
        success: false,
        error: {
          code,
          message,
          retryAfterMs,
        },
      });
    }

    timestamps.push(now);
    bucketMap.set(key, timestamps);
    next();
  };
}

export function resetRateLimiterBuckets() {
  bucketStores.clear();
}

export function getActiveParseJob(workspaceId: string): ActiveJob | undefined {
  const job = activeParseJobs.get(workspaceId);
  if (!job) return undefined;
  // Timeout safety: if job running longer than 60s, clear lock
  if (Date.now() - job.startTime > 60000) {
    activeParseJobs.delete(workspaceId);
    return undefined;
  }
  return job;
}

export function startParseJob(workspaceId: string, requestId: string): boolean {
  const existing = getActiveParseJob(workspaceId);
  if (existing) {
    // If same request ID, allow it to proceed or handle via idempotency
    if (existing.requestId === requestId) {
      return true;
    }
    return false; // Concurrent job for same workspace already running
  }
  activeParseJobs.set(workspaceId, {
    requestId,
    workspaceId,
    startTime: Date.now(),
  });
  return true;
}

export function finishParseJob(workspaceId: string, requestId: string, responseData?: any) {
  const current = activeParseJobs.get(workspaceId);
  if (current && current.requestId === requestId) {
    activeParseJobs.delete(workspaceId);
  }
  if (responseData && requestId) {
    idempotencyCache.set(requestId, {
      timestamp: Date.now(),
      responseData,
    });
    // Clean old entries after 5 mins
    if (idempotencyCache.size > 100) {
      const now = Date.now();
      for (const [k, v] of idempotencyCache.entries()) {
        if (now - v.timestamp > 300000) idempotencyCache.delete(k);
      }
    }
  }
}

export function getIdempotencyResult(requestId: string): any | null {
  const cached = idempotencyCache.get(requestId);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > 300000) {
    idempotencyCache.delete(requestId);
    return null;
  }
  return cached.responseData;
}

export function getInFlightParseCount(): number {
  return activeParseJobs.size;
}

export function clearAllParseLocks() {
  activeParseJobs.clear();
  idempotencyCache.clear();
}
