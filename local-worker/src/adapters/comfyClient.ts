export type ComfyErrorCode =
  | "COMFYUI_DISABLED"
  | "COMFYUI_UNAVAILABLE"
  | "COMFYUI_WORKFLOW_NOT_FOUND"
  | "COMFYUI_WORKFLOW_BINDING_INVALID"
  | "COMFYUI_INPUT_ARTIFACT_INVALID"
  | "INPUT_ARTIFACT_DOWNLOAD_FAILED"
  | "COMFYUI_UPLOAD_FAILED"
  | "COMFYUI_QUEUE_FAILED"
  | "COMFYUI_INVALID_QUEUE_RESPONSE"
  | "COMFYUI_NON_JSON_RESPONSE"
  | "COMFYUI_HISTORY_FAILED"
  | "COMFYUI_JOB_TIMEOUT"
  | "COMFYUI_OUTPUT_NOT_FOUND"
  | "COMFYUI_INVALID_OUTPUT"
  | "GLB_UPLOAD_FAILED"
  | "ARTIFACT_REGISTRATION_FAILED"
  | "non_image_response"
  | "empty_body"
  | "magic_bytes_mismatch"
  | "unsupported_mime"
  | "no_supported_input_image";

export class ComfyAdapterError extends Error {
  public code: ComfyErrorCode;
  public details?: any;

  constructor(code: ComfyErrorCode, message: string, details?: any) {
    super(`[${code}] ${message}`);
    this.name = "ComfyAdapterError";
    this.code = code;
    this.details = details;
  }
}

export interface ComfyClientConfig {
  baseUrl: string;
  requestTimeoutMs: number;
}

export class ComfyClient {
  private baseUrl: string;
  private requestTimeoutMs: number;

  constructor(config: ComfyClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.requestTimeoutMs = config.requestTimeoutMs || 10000;
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return res;
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new ComfyAdapterError("COMFYUI_UNAVAILABLE", `Request to ComfyUI timed out (${url})`);
      }
      throw new ComfyAdapterError("COMFYUI_UNAVAILABLE", `Failed to connect to ComfyUI at ${url}: ${err.message}`);
    } finally {
      clearTimeout(id);
    }
  }

  public async checkHealth(): Promise<boolean> {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/system_stats`);
      if (!res.ok) {
        throw new ComfyAdapterError("COMFYUI_UNAVAILABLE", `ComfyUI system_stats returned HTTP ${res.status}`);
      }
      return true;
    } catch (err: any) {
      if (err instanceof ComfyAdapterError) throw err;
      throw new ComfyAdapterError("COMFYUI_UNAVAILABLE", `ComfyUI health check failed: ${err.message}`);
    }
  }

  public async uploadImage(
    fileName: string,
    fileBuffer: Buffer | Uint8Array,
    subfolder = ""
  ): Promise<{ name: string; subfolder: string; type: string }> {
    const formData = new FormData();
    const blob = new Blob([fileBuffer as any]);
    formData.append("image", blob, fileName);
    formData.append("overwrite", "true");
    formData.append("type", "input");
    if (subfolder) {
      formData.append("subfolder", subfolder);
    }

    let res: Response;
    try {
      res = await this.fetchWithTimeout(`${this.baseUrl}/upload/image`, {
        method: "POST",
        body: formData,
      });
    } catch (err: any) {
      if (err instanceof ComfyAdapterError) throw err;
      throw new ComfyAdapterError("COMFYUI_UPLOAD_FAILED", `Upload image HTTP failed: ${err.message}`);
    }

    if (!res.ok) {
      throw new ComfyAdapterError("COMFYUI_UPLOAD_FAILED", `Upload image failed with HTTP ${res.status}`);
    }

    let text = "";
    try {
      text = await res.text();
      const data = JSON.parse(text);
      return {
        name: data.name || fileName,
        subfolder: data.subfolder || "",
        type: data.type || "input",
      };
    } catch (err: any) {
      throw new ComfyAdapterError("COMFYUI_NON_JSON_RESPONSE", `Upload image returned non-JSON response: ${text.slice(0, 100)}`);
    }
  }

  public async submitPrompt(
    promptJson: Record<string, any>,
    clientId = "furniture-local-worker"
  ): Promise<{ prompt_id: string }> {
    let res: Response;
    try {
      res = await this.fetchWithTimeout(`${this.baseUrl}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptJson, client_id: clientId }),
      });
    } catch (err: any) {
      if (err instanceof ComfyAdapterError) throw err;
      throw new ComfyAdapterError("COMFYUI_QUEUE_FAILED", `Submit prompt request failed: ${err.message}`);
    }

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new ComfyAdapterError("COMFYUI_NON_JSON_RESPONSE", `Submit prompt returned non-JSON response: ${text.slice(0, 100)}`);
    }

    if (!res.ok || data.error) {
      throw new ComfyAdapterError(
        "COMFYUI_QUEUE_FAILED",
        `ComfyUI prompt queue error: ${data.error?.message || data.node_errors || res.statusText}`,
        data
      );
    }

    if (!data.prompt_id || typeof data.prompt_id !== "string") {
      throw new ComfyAdapterError("COMFYUI_INVALID_QUEUE_RESPONSE", "ComfyUI response missing prompt_id", data);
    }

    return { prompt_id: data.prompt_id };
  }

  public async getHistory(promptId: string): Promise<any> {
    let res: Response;
    try {
      res = await this.fetchWithTimeout(`${this.baseUrl}/history/${encodeURIComponent(promptId)}`);
    } catch (err: any) {
      if (err instanceof ComfyAdapterError) throw err;
      throw new ComfyAdapterError("COMFYUI_HISTORY_FAILED", `Get history failed for promptId ${promptId}: ${err.message}`);
    }

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new ComfyAdapterError("COMFYUI_NON_JSON_RESPONSE", `History endpoint returned non-JSON response: ${text.slice(0, 100)}`);
    }

    if (!res.ok) {
      throw new ComfyAdapterError("COMFYUI_HISTORY_FAILED", `History query returned HTTP ${res.status}`);
    }

    return data[promptId] || null;
  }
}
