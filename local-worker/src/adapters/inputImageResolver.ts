import { ComfyAdapterError } from "./comfyClient.js";

/**
 * Sanitizes server origin to ensure it is a valid base origin (protocol://host[:port])
 * without path fragments like /api/worker.
 */
export function sanitizeServerOrigin(inputOrigin?: string): string {
  const raw =
    inputOrigin ||
    process.env.SERVER_ORIGIN ||
    process.env.WORKER_GATEWAY_URL ||
    "http://127.0.0.1:3000";

  let trimmed = raw.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    trimmed = "http://" + trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    let cleaned = trimmed.replace(/\/+$/, "");
    if (cleaned.endsWith("/api/worker")) {
      cleaned = cleaned.substring(0, cleaned.length - "/api/worker".length).replace(/\/+$/, "");
    }
    return cleaned;
  }
}

export interface ResolveInputImageOptions {
  serverOrigin?: string;
  gatewayUrl?: string;
}

/**
 * Resolves input image URLs defensively.
 * - absolute HTTP/HTTPS URL -> use directly
 * - relative URL beginning with / -> resolve against SERVER_ORIGIN using `new URL(relativeUrl, serverOrigin)`
 * - data: URI -> return as is
 * Rejects invalid relative URLs (not starting with / and not valid absolute URL).
 */
export function resolveInputImageUrl(rawUrl: string, options?: ResolveInputImageOptions): string {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new ComfyAdapterError(
      "no_supported_input_image",
      "Input image URL is empty or invalid"
    );
  }

  const trimmed = rawUrl.trim();

  // 1. Data URI
  if (trimmed.startsWith("data:")) {
    console.log(`[InputArtifact] rawUrl=data:...`);
    console.log(`[InputArtifact] resolvedUrl=data:...`);
    return trimmed;
  }

  // 2. Absolute HTTP / HTTPS URL
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      const safeLogRaw = `${parsed.origin}${parsed.pathname}`;
      console.log(`[InputArtifact] rawUrl=${safeLogRaw}`);
      console.log(`[InputArtifact] resolvedUrl=${safeLogRaw}`);
      return parsed.toString();
    } catch {
      throw new ComfyAdapterError(
        "no_supported_input_image",
        `Invalid absolute HTTP URL: '${trimmed}'`
      );
    }
  }

  // 3. Relative URL beginning with /
  if (trimmed.startsWith("/")) {
    const serverOrigin = sanitizeServerOrigin(options?.serverOrigin || options?.gatewayUrl);
    try {
      const resolved = new URL(trimmed, serverOrigin).toString();
      const parsedResolved = new URL(resolved);
      const safeLogRaw = trimmed.split("?")[0];
      const safeLogResolved = `${parsedResolved.origin}${parsedResolved.pathname}`;

      console.log(`[InputArtifact] rawUrl=${safeLogRaw}`);
      console.log(`[InputArtifact] resolvedUrl=${safeLogResolved}`);
      return resolved;
    } catch (err: any) {
      throw new ComfyAdapterError(
        "no_supported_input_image",
        `Failed to resolve relative URL '${trimmed}' against server origin '${serverOrigin}': ${err.message}`
      );
    }
  }

  // 4. Invalid relative URL (does not start with / and is not absolute HTTP/HTTPS or data URI)
  throw new ComfyAdapterError(
    "no_supported_input_image",
    `Invalid relative URL '${trimmed}': Relative artifact URLs must start with '/'`
  );
}
