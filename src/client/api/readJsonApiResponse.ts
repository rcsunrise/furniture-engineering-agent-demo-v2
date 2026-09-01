export interface NonJsonResponseError extends Error {
  code: "NON_JSON_API_RESPONSE" | "INVALID_JSON_RESPONSE";
  endpoint?: string;
  method?: string;
  httpStatus: number;
  contentType: string;
  rawPreview: string;
}

/**
 * Unified JSON API response reader.
 * Inspects Content-Type header and raw body text.
 * Throws NON_JSON_API_RESPONSE or INVALID_JSON_RESPONSE error if server returns HTML or non-JSON text.
 */
export async function readJsonApiResponse<T = unknown>(
  response: Response,
  endpoint: string = "",
  method: string = "GET"
): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text();

  if (
    !contentType.toLowerCase().includes("application/json") ||
    raw.trim().startsWith("<!doctype") ||
    raw.trim().startsWith("<html")
  ) {
    const rawPreview = raw.slice(0, 300);
    const errObj: any = new Error(
      `API did not return JSON. HTTP ${response.status}${endpoint ? ` [${method} ${endpoint}]` : ""}`
    );
    errObj.code = "NON_JSON_API_RESPONSE";
    errObj.endpoint = endpoint;
    errObj.method = method;
    errObj.httpStatus = response.status;
    errObj.contentType = contentType;
    errObj.rawPreview = rawPreview;
    throw errObj as NonJsonResponseError;
  }

  let json: unknown;
  try {
    json = raw.length > 0 ? JSON.parse(raw) : null;
  } catch {
    const rawPreview = raw.slice(0, 300);
    const errObj: any = new Error(
      `API returned invalid JSON. HTTP ${response.status}${endpoint ? ` [${method} ${endpoint}]` : ""}`
    );
    errObj.code = "INVALID_JSON_RESPONSE";
    errObj.endpoint = endpoint;
    errObj.method = method;
    errObj.httpStatus = response.status;
    errObj.contentType = contentType;
    errObj.rawPreview = rawPreview;
    throw errObj as NonJsonResponseError;
  }

  if (!response.ok) {
    if (json && typeof json === "object") {
      const errObj: any = json;
      if (!errObj.code && errObj.error?.code) {
        errObj.code = errObj.error.code;
      }
      if (!errObj.httpStatus) {
        errObj.httpStatus = response.status;
      }
      throw errObj;
    }
    throw json;
  }

  return json as T;
}

