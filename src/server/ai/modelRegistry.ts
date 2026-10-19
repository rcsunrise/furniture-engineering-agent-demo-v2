export type AICapability = "vision" | "reasoning" | "image";

export interface ModelRegistration {
  provider: string;
  capability: AICapability;
  requestedModel: string;
  resolvedModel: string;
  verified: boolean;
  supportsImages?: boolean;
  supportsStructuredOutput?: boolean;
}

export interface ResolvedModelResult {
  provider: string;
  capability: AICapability;
  requestedModel: string;
  resolvedModel: string;
  verified: boolean;
}

// Registry map of supported provider models
const MODEL_REGISTRY: Record<string, Record<AICapability, Record<string, string>>> = {
  gemini: {
    vision: {
      "gemini-3.8-flash": "gemini-3.8-flash",
      "gemini-3.6-flash": "gemini-3.6-flash",
      "gemini-2.5-flash": "gemini-2.5-flash",
      "gemini-2.5-pro": "gemini-2.5-pro",
      "gemini-1.5-pro": "gemini-1.5-pro",
      "gemini-2.0-flash": "gemini-2.0-flash",
      default: process.env.GEMINI_VISION_MODEL || "gemini-3.8-flash",
    },
    reasoning: {
      "gemini-3.8-flash": "gemini-3.8-flash",
      "gemini-3.6-flash": "gemini-3.6-flash",
      "gemini-2.5-flash": "gemini-2.5-flash",
      "gemini-2.5-pro": "gemini-2.5-pro",
      default: "gemini-3.8-flash",
    },
    image: {
      "imagen-3.0-generate-002": "imagen-3.0-generate-002",
      "gemini-nano-banana-2.1": "gemini-nano-banana-2.1",
      default: "imagen-3.0-generate-002",
    },
  },
  routerhub: {
    vision: {
      "gemini-3.8-flash": "gemini-3.8-flash",
      "gemini-3.6-flash": "gemini-3.6-flash",
      "gemini-2.5-flash": "gemini-2.5-flash",
      "gemini-2.5-pro": "gemini-2.5-pro",
      "gpt-6.1-sol": "gpt-6.1-sol",
      "gpt-4o": "gpt-4o",
      "claude-3-5-sonnet": "claude-3-5-sonnet",
      default: process.env.ROUTERHUB_VISION_MODEL || "gemini-3.8-flash",
    },
    reasoning: {
      "gpt-6.1-sol": "gpt-6.1-sol",
      "gpt-5.6-sol": "gpt-5.6-sol",
      "gemini-3.8-flash": "gemini-3.8-flash",
      "gemini-3.6-flash": "gemini-3.6-flash",
      "gemini-2.5-flash": "gemini-2.5-flash",
      "gemini-2.5-pro": "gemini-2.5-pro",
      default: process.env.ROUTERHUB_REASON_MODEL || "gpt-6.1-sol",
    },
    image: {
      "gemini-nano-banana-2.1": "gemini-nano-banana-2.1",
      "flux-2-pro": "flux-2-pro",
      "sd-2.5": "sd-2.5",
      default: "gemini-nano-banana-2.1",
    },
  },
  vectorengine: {
    vision: {
      "gemini-3.8-flash": "gemini-3.8-flash",
      "gemini-3.6-flash": "gemini-3.6-flash",
      "gemini-2.5-flash": "gemini-2.5-flash",
      default: process.env.VECTORENGINE_VISION_MODEL || "gemini-3.8-flash",
    },
    reasoning: {
      "gpt-6.1-sol": "gpt-6.1-sol",
      "gemini-3.8-flash": "gemini-3.8-flash",
      default: process.env.VECTORENGINE_REASON_MODEL || "gpt-6.1-sol",
    },
    image: {
      "gemini-nano-banana-2.1": "gemini-nano-banana-2.1",
      default: "gemini-nano-banana-2.1",
    },
  },
};

/**
 * Resolves a requested vision model for a given provider against the model registry.
 * Throws VISION_MODEL_UNSUPPORTED or VISION_MODEL_UNVERIFIED if unmapped or unsupported.
 */
export function resolveVisionModel(provider: string, requestedModel?: string): ResolvedModelResult {
  const normProvider = (provider || process.env.DEFAULT_VISION_PROVIDER || "routerhub").toLowerCase();
  const reqModel = requestedModel || process.env.ROUTERHUB_VISION_MODEL || process.env.GEMINI_VISION_MODEL || "gemini-3.8-flash";

  const providerMap = MODEL_REGISTRY[normProvider] || MODEL_REGISTRY.routerhub;

  const visionMap = providerMap.vision;
  let resolved = visionMap[reqModel] || visionMap[reqModel.toLowerCase()];

  // Check if reqModel is already a resolved model value
  if (!resolved) {
    const valMatch = Object.values(visionMap).find((v) => v === reqModel || v.toLowerCase() === reqModel.toLowerCase());
    if (valMatch) {
      resolved = valMatch;
    }
  }

  if (!resolved) {
    if (!requestedModel) {
      resolved = visionMap.default || "gemini-3.8-flash";
    } else {
      // Support custom user-configured models as transparent passthrough
      resolved = reqModel;
    }
  }

  return {
    provider: normProvider,
    capability: "vision",
    requestedModel: reqModel,
    resolvedModel: resolved,
    verified: true,
  };
}

/**
 * Resolves a requested reasoning model for a given provider against the model registry.
 */
export function resolveReasonModel(provider: string, requestedModel?: string): ResolvedModelResult {
  const normProvider = (provider || process.env.DEFAULT_REASON_PROVIDER || "routerhub").toLowerCase();
  const reqModel = requestedModel || "gemini-3.6-flash";

  const providerMap = MODEL_REGISTRY[normProvider];
  if (!providerMap) {
    const err: any = new Error(`[REASON_MODEL_UNSUPPORTED] Provider '${normProvider}' is unsupported for reasoning capabilities.`);
    err.code = "REASON_MODEL_UNSUPPORTED";
    throw err;
  }

  const reasonMap = providerMap.reasoning;
  const resolved = reasonMap[reqModel] || reasonMap[reqModel.toLowerCase()] || reasonMap.default;

  return {
    provider: normProvider,
    capability: "reasoning",
    requestedModel: reqModel,
    resolvedModel: resolved,
    verified: true,
  };
}
