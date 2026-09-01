import { readJsonApiResponse, type NonJsonResponseError } from "./api/readJsonApiResponse.js";

export { readJsonApiResponse, type NonJsonResponseError };

export async function parseApiResponse<T = any>(
  response: Response,
  endpoint: string = "",
  method: string = "GET"
): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const data = await readJsonApiResponse<T>(response, endpoint, method);
    return { ok: true, status: response.status, data };
  } catch (err: any) {
    if (err && (err.code === "NON_JSON_API_RESPONSE" || err.code === "INVALID_JSON_RESPONSE")) {
      throw err;
    }
    return {
      ok: false,
      status: err?.httpStatus || err?.status || response.status,
      data: err?.data || err,
    };
  }
}


