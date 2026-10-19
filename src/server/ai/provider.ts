import { GoogleGenAI } from "@google/genai";
import { recordCallTelemetry, type CallTelemetry } from "./telemetry.js";
import { getRuntimeAiConfig } from "./runtimeAiConfig.js";

export type ReasonProvider = "vectorengine" | "routerhub" | "gemini";

export interface UnifiedReasoningImage {
  mimeType: string;
  data: string; // base64 string
  label?: string;
}

export interface UnifiedReasoningRequest {
  provider?: ReasonProvider;
  model?: string;
  instructions: string;
  input: unknown;
  images?: UnifiedReasoningImage[];
  reasoning?: "low" | "medium" | "high";
  allowFallback?: boolean;
}

export interface UnifiedReasoningResponse {
  provider: string;
  requestedModel: string;
  resolvedModel: string;
  requestId: string | null;
  text: string;
  raw: any;
  telemetry: CallTelemetry;
}

/**
 * Standardized AI Reasoning Router with Multi-Tier Telemetry, Fast Timeouts & No-Silent-Fallback
 */
export async function runReasoning(req: UnifiedReasoningRequest): Promise<UnifiedReasoningResponse> {
  const cfg = getRuntimeAiConfig();
  const primaryProvider = req.provider ?? (cfg.provider as ReasonProvider) ?? (process.env.DEFAULT_REASON_PROVIDER as ReasonProvider) ?? "routerhub";
  const requestedModel = req.model || getDefaultModelForProvider(primaryProvider);
  const allowFallback = req.allowFallback ?? true;

  const fallbackChain: ReasonProvider[] = getFallbackChain(primaryProvider);

  let lastError: string = "";
  let primaryErrorInfo: { provider: string; model: string; error: string } | null = null;

  for (let i = 0; i < fallbackChain.length; i++) {
    const currentProvider = fallbackChain[i];
    const isPrimary = i === 0;

    if (!isPrimary && !allowFallback) {
      break;
    }

    const currentModel = isPrimary ? requestedModel : getDefaultModelForProvider(currentProvider);

    const fallbackMeta = isPrimary
      ? undefined
      : {
          fallbackUsed: true,
          fallbackInfo: {
            primaryProvider: primaryErrorInfo?.provider || primaryProvider,
            primaryModel: primaryErrorInfo?.model || requestedModel,
            primaryError: primaryErrorInfo?.error || lastError,
            fallbackProvider: currentProvider,
            fallbackModel: currentModel,
          },
        };

    try {
      const res = await callSingleProvider(currentProvider, currentModel, req, fallbackMeta);
      return res;
    } catch (err: any) {
      lastError = err?.message || String(err);

      if (isPrimary) {
        primaryErrorInfo = { provider: currentProvider, model: currentModel, error: lastError };
      }

      recordCallTelemetry({
        provider: currentProvider,
        requestedModel: currentModel,
        resolvedModel: currentModel,
        requestId: null,
        callType: "reasoning",
        success: false,
        failure: { message: `PROVIDER_FAILED (${currentProvider}): ${lastError}` },
        fallbackUsed: !isPrimary,
        fallbackInfo: fallbackMeta?.fallbackInfo ?? null,
        estimatedCostUsd: 0,
      });
    }
  }

  throw new Error(`All providers in reasoning fallback chain failed (${fallbackChain.join(" -> ")}). Last error: ${lastError}`);
}

async function callSingleProvider(
  provider: ReasonProvider,
  modelName: string,
  req: UnifiedReasoningRequest,
  fallbackMeta?: { fallbackUsed: boolean; fallbackInfo: CallTelemetry["fallbackInfo"] }
): Promise<UnifiedReasoningResponse> {
  const requestedModel = req.model || modelName;
  const resolvedModel = modelName;

  if (provider === "gemini") {
    return callGemini(req, requestedModel, resolvedModel, fallbackMeta);
  }
  if (provider === "vectorengine") {
    return callVectorEngine(req, requestedModel, resolvedModel, fallbackMeta);
  }
  if (provider === "routerhub") {
    return callRouterHub(req, requestedModel, resolvedModel, fallbackMeta);
  }

  throw new Error(`UNSUPPORTED_PROVIDER: Provider '${provider}' is not supported`);
}

async function callGemini(
  req: UnifiedReasoningRequest,
  requestedModel: string,
  resolvedModel: string,
  fallbackMeta?: { fallbackUsed: boolean; fallbackInfo: CallTelemetry["fallbackInfo"] }
): Promise<UnifiedReasoningResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is missing");

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `${req.instructions}\n\nInput Data:\n${JSON.stringify(req.input, null, 2)}`;

  let contents: any = prompt;
  if (req.images && req.images.length > 0) {
    const parts: any[] = [{ text: prompt }];
    for (const img of req.images) {
      if (img.label) {
        parts.push({ text: `[Reference Image View: ${img.label}]` });
      }
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data,
        },
      });
    }
    contents = [{ role: "user", parts }];
  }

  const startTime = Date.now();
  const actualModel = resolvedModel.startsWith("router-") || resolvedModel.startsWith("vector-") ? "gemini-2.5-flash" : resolvedModel;

  const response = await ai.models.generateContent({
    model: actualModel,
    contents,
  });

  const text = response.text || "";
  const usage = (response as any).usageMetadata
    ? {
        promptTokens: (response as any).usageMetadata.promptTokenCount,
        completionTokens: (response as any).usageMetadata.candidatesTokenCount,
        totalTokens: (response as any).usageMetadata.totalTokenCount,
      }
    : undefined;

  const cost = calculateCostUsd("gemini", resolvedModel, usage);

  const telemetry = recordCallTelemetry({
    provider: "gemini",
    requestedModel,
    resolvedModel,
    requestId: (response as any).responseId || `gemini_${startTime}`,
    callType: "reasoning",
    success: true,
    failure: null,
    fallbackUsed: fallbackMeta?.fallbackUsed ?? false,
    fallbackInfo: fallbackMeta?.fallbackInfo ?? null,
    estimatedCostUsd: cost,
    usage,
  });

  return {
    provider: "gemini",
    requestedModel,
    resolvedModel,
    requestId: telemetry.requestId,
    text,
    raw: response,
    telemetry,
  };
}

async function callRouterHub(
  req: UnifiedReasoningRequest,
  requestedModel: string,
  resolvedModel: string,
  fallbackMeta?: { fallbackUsed: boolean; fallbackInfo: CallTelemetry["fallbackInfo"] }
): Promise<UnifiedReasoningResponse> {
  const cfg = getRuntimeAiConfig();
  const base = cfg.baseUrl || process.env.ROUTERHUB_BASE_URL || "https://api.tiantoken.com";
  const key = cfg.apiKey || process.env.ROUTERHUB_API_KEY;
  if (!key) throw new Error("ROUTERHUB_API_KEY is missing (请在 AI 设置中配置 API 密钥)");

  return postChatCompletionsAdapter("routerhub", base, key, requestedModel, resolvedModel, req, fallbackMeta);
}

async function callVectorEngine(
  req: UnifiedReasoningRequest,
  requestedModel: string,
  resolvedModel: string,
  fallbackMeta?: { fallbackUsed: boolean; fallbackInfo: CallTelemetry["fallbackInfo"] }
): Promise<UnifiedReasoningResponse> {
  const cfg = getRuntimeAiConfig();
  const base = cfg.baseUrl || process.env.VECTORENGINE_BASE_URL || "https://api.tiantoken.com";
  const key = cfg.apiKey || process.env.VECTORENGINE_API_KEY;
  if (!key) throw new Error("VECTORENGINE_API_KEY is missing (请在 AI 设置中配置 API 密钥)");

  return postChatCompletionsAdapter("vectorengine", base, key, requestedModel, resolvedModel, req, fallbackMeta);
}

async function postChatCompletionsAdapter(
  provider: "routerhub" | "vectorengine",
  baseUrl: string,
  key: string,
  requestedModel: string,
  resolvedModel: string,
  req: UnifiedReasoningRequest,
  fallbackMeta?: { fallbackUsed: boolean; fallbackInfo: CallTelemetry["fallbackInfo"] }
): Promise<UnifiedReasoningResponse> {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const chatUrl = cleanBase.endsWith("/v1")
    ? `${cleanBase}/chat/completions`
    : `${cleanBase}/v1/chat/completions`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout for complex engineering reasoning & vision

  try {
    const messages: any[] = [];
    if (req.instructions) {
      messages.push({
        role: "system",
        content: req.instructions,
      });
    }

    const textInput = typeof req.input === "string" ? req.input : JSON.stringify(req.input, null, 2);

    if (req.images && req.images.length > 0) {
      const userContent: any[] = [
        { type: "text", text: textInput },
      ];
      for (const img of req.images) {
        if (img.label) {
          userContent.push({ type: "text", text: `[视角说明: ${img.label}]` });
        }
        const dataUrl = img.data.startsWith("data:")
          ? img.data
          : `data:${img.mimeType};base64,${img.data}`;
        userContent.push({
          type: "image_url",
          image_url: { url: dataUrl },
        });
      }
      messages.push({ role: "user", content: userContent });
    } else {
      messages.push({ role: "user", content: textInput });
    }

    const response = await fetch(chatUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const requestId =
      response.headers.get("x-request-id") ||
      response.headers.get("request-id") ||
      response.headers.get("apigw-requestid") ||
      null;

    const text = await response.text();
    let raw: any = text;
    try {
      raw = JSON.parse(text);
    } catch {
      // Plain text or HTML error handling
    }

    if (!response.ok) {
      const errorMsg = typeof raw === "string" ? raw.slice(0, 500) : JSON.stringify(raw).slice(0, 500);
      throw new Error(`${provider} HTTP ${response.status}: ${errorMsg}`);
    }

    const extractedText = extractText(raw);
    const usage = raw?.usage
      ? {
          promptTokens: raw.usage.prompt_tokens,
          completionTokens: raw.usage.completion_tokens,
          totalTokens: raw.usage.total_tokens,
        }
      : undefined;

    const cost = calculateCostUsd(provider, resolvedModel, usage);

    const telemetry = recordCallTelemetry({
      provider,
      requestedModel,
      resolvedModel,
      requestId,
      callType: "reasoning",
      success: true,
      failure: null,
      fallbackUsed: fallbackMeta?.fallbackUsed ?? false,
      fallbackInfo: fallbackMeta?.fallbackInfo ?? null,
      estimatedCostUsd: cost,
      usage,
    });

    return {
      provider,
      requestedModel,
      resolvedModel,
      requestId,
      text: extractedText,
      raw,
      telemetry,
    };
  } catch (fetchErr: any) {
    clearTimeout(timeoutId);
    throw fetchErr;
  }
}

function extractText(raw: any): string {
  if (typeof raw === "string") return raw;
  return (
    raw?.choices?.[0]?.message?.content ??
    raw?.output_text ??
    raw?.output
      ?.flatMap?.((x: any) => x?.content || [])
      .map((c: any) => c?.text)
      .filter(Boolean)
      .join("\n") ??
    ""
  );
}

function getDefaultModelForProvider(provider: ReasonProvider): string {
  const cfg = getRuntimeAiConfig();
  if (provider === "vectorengine") {
    return cfg.reasonModel || process.env.VECTORENGINE_REASON_MODEL || "gpt-6.1-sol";
  }
  if (provider === "routerhub") {
    return cfg.reasonModel || process.env.ROUTERHUB_REASON_MODEL || "gpt-6.1-sol";
  }
  return cfg.reasonModel || "gpt-6.1-sol";
}

function getFallbackChain(primary: ReasonProvider): ReasonProvider[] {
  if (primary === "routerhub") return ["routerhub", "vectorengine", "gemini"];
  if (primary === "vectorengine") return ["vectorengine", "routerhub", "gemini"];
  return ["gemini", "routerhub", "vectorengine"];
}

function calculateCostUsd(provider: string, model: string, usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }): number {
  if (usage?.totalTokens) {
    const promptCost = ((usage.promptTokens || 0) / 1000000) * 0.075;
    const completionCost = ((usage.completionTokens || 0) / 1000000) * 0.3;
    return Number((promptCost + completionCost).toFixed(6));
  }
  return 0.0001;
}
