import fs from "fs";
import path from "path";

export interface RuntimeAiConfig {
  provider: "routerhub" | "vectorengine" | "gemini";
  baseUrl: string;
  apiKey: string;
  reasonModel: string;
  visionModel: string;
  imageModel: string;
  updatedAt?: number;
}

const CONFIG_FILE_PATH = path.resolve(process.cwd(), "data", "config", "ai_config.json");

let activeConfig: RuntimeAiConfig = {
  provider: (process.env.DEFAULT_REASON_PROVIDER as any) || "routerhub",
  baseUrl: process.env.ROUTERHUB_BASE_URL || "https://api.tiantoken.com",
  apiKey: process.env.ROUTERHUB_API_KEY || "",
  reasonModel: process.env.ROUTERHUB_REASON_MODEL || "gpt-6.1-sol",
  visionModel: process.env.ROUTERHUB_VISION_MODEL || "gemini-3.8-flash",
  imageModel: process.env.IMAGE_GENERATION_MODEL || "gemini-nano-banana-2.1",
  updatedAt: Date.now(),
};

// Try loading persisted config from disk on startup
function loadPersistedConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const raw = fs.readFileSync(CONFIG_FILE_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        activeConfig = {
          ...activeConfig,
          ...parsed,
          // Always ensure valid fallback if empty
          baseUrl: parsed.baseUrl || activeConfig.baseUrl,
          apiKey: parsed.apiKey || activeConfig.apiKey,
          reasonModel: parsed.reasonModel || activeConfig.reasonModel,
          visionModel: parsed.visionModel || activeConfig.visionModel,
          imageModel: parsed.imageModel || activeConfig.imageModel,
          updatedAt: parsed.updatedAt || Date.now(),
        };
      }
    }
  } catch (err: any) {
    console.warn("[RuntimeAiConfig] Failed to load persisted config from disk:", err.message);
  }
}

loadPersistedConfig();

export function getRuntimeAiConfig(): RuntimeAiConfig {
  return { ...activeConfig };
}

export function updateRuntimeAiConfig(updates: Partial<RuntimeAiConfig>): RuntimeAiConfig {
  activeConfig = {
    ...activeConfig,
    ...updates,
    updatedAt: Date.now(),
  };

  try {
    const dir = path.dirname(CONFIG_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(activeConfig, null, 2), "utf-8");
  } catch (err: any) {
    console.error("[RuntimeAiConfig] Failed to persist config to disk:", err.message);
  }

  // Also update process.env so existing consumers stay in sync
  if (activeConfig.apiKey) {
    process.env.ROUTERHUB_API_KEY = activeConfig.apiKey;
    process.env.VECTORENGINE_API_KEY = activeConfig.apiKey;
  }
  if (activeConfig.baseUrl) {
    process.env.ROUTERHUB_BASE_URL = activeConfig.baseUrl;
    process.env.VECTORENGINE_BASE_URL = activeConfig.baseUrl;
  }
  if (activeConfig.reasonModel) {
    process.env.ROUTERHUB_REASON_MODEL = activeConfig.reasonModel;
  }
  if (activeConfig.visionModel) {
    process.env.ROUTERHUB_VISION_MODEL = activeConfig.visionModel;
  }
  if (activeConfig.imageModel) {
    process.env.IMAGE_GENERATION_MODEL = activeConfig.imageModel;
  }

  return { ...activeConfig };
}

/**
 * Tests connection against the target API (OpenAI compatible endpoint /v1/models or ping)
 */
export async function testAiConnection(
  configToTest: Partial<RuntimeAiConfig>
): Promise<{ ok: boolean; message: string; latencyMs: number; modelsCount?: number; sampleModels?: string[] }> {
  const baseUrl = (configToTest.baseUrl || activeConfig.baseUrl || "https://api.tiantoken.com").replace(/\/+$/, "");
  const apiKey = configToTest.apiKey || activeConfig.apiKey;
  const reasonModel = configToTest.reasonModel || activeConfig.reasonModel || "gpt-6.1-sol";

  if (!apiKey) {
    return { ok: false, message: "API 密钥不能为空", latencyMs: 0 };
  }

  const startTime = Date.now();

  // 1. Try /v1/models first to test key validity and fetch supported models list
  try {
    const modelsUrl = `${baseUrl}/v1/models`;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);

    const modelsRes = await fetch(modelsUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: ctrl.signal,
    });
    clearTimeout(timeout);

    if (modelsRes.ok) {
      const data: any = await modelsRes.json();
      const modelsList: string[] = Array.isArray(data?.data) ? data.data.map((m: any) => m.id) : [];
      const latency = Date.now() - startTime;
      return {
        ok: true,
        message: `连接成功！响应耗时 ${latency}ms，获取到 ${modelsList.length} 个可用模型`,
        latencyMs: latency,
        modelsCount: modelsList.length,
        sampleModels: modelsList.slice(0, 10),
      };
    }
  } catch (err: any) {
    // If models endpoint failed or blocked, fall through to test chat/completions ping
  }

  // 2. Test /v1/chat/completions with minimal ping
  try {
    const chatUrl = `${baseUrl}/v1/chat/completions`;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 12000);

    const chatRes = await fetch(chatUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: reasonModel,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);

    const latency = Date.now() - startTime;

    if (!chatRes.ok) {
      const errText = await chatRes.text();
      return {
        ok: false,
        message: `接口返回错误 (HTTP ${chatRes.status}): ${errText.slice(0, 200)}`,
        latencyMs: latency,
      };
    }

    return {
      ok: true,
      message: `连通性测试成功！模型 ${reasonModel} 响应耗时 ${latency}ms`,
      latencyMs: latency,
    };
  } catch (err: any) {
    const latency = Date.now() - startTime;
    return {
      ok: false,
      message: `网络请求失败 (${latency}ms): ${err.message || String(err)}`,
      latencyMs: latency,
    };
  }
}
