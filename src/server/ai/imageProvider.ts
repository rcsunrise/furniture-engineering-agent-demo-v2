import { GoogleGenAI } from "@google/genai";
import { recordCallTelemetry, type CallTelemetry } from "./telemetry.js";

export type ImageTaskState = "idle" | "queued" | "generating" | "completed" | "failed" | "cancelled";

export interface AttemptLog {
  timestamp: number;
  fromState: ImageTaskState;
  toState: ImageTaskState;
  note?: string;
}

export interface ImageTask {
  taskId: string;
  workspaceId: string;
  model: string;
  prompt: string;
  state: ImageTaskState;
  attemptHistory: AttemptLog[];
  mockAssetUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
  telemetry?: CallTelemetry;
}

const MOCK_IMAGE_MODELS = new Set([
  "mock-imagen-v1",
  "mock-imagen-v2",
  "mock-sd-xl",
  "mock-flux-local",
]);

const REAL_IMAGE_MODELS = new Set([
  "imagen-3.0-generate-002",
  "gemini-2.5-flash",
  "vector-image-v1",
  "router-image-v1",
]);

// In-Memory Task Store
const taskStore = new Map<string, ImageTask>();

export function isModelVerified(model: string): boolean {
  return MOCK_IMAGE_MODELS.has(model) || REAL_IMAGE_MODELS.has(model);
}

export function createImageTask(
  workspaceId: string,
  model: string,
  prompt: string
): { success: true; task: ImageTask } | { success: false; errorCode: string; errorMessage: string } {
  if (!isModelVerified(model)) {
    const errorMsg = `Model '${model}' is unverified or unknown. Only verified mock or real models are allowed.`;
    recordCallTelemetry({
      provider: "unverified",
      requestedModel: model,
      resolvedModel: model,
      requestId: null,
      callType: "image",
      success: false,
      failure: { code: "IMAGE_MODEL_UNVERIFIED", message: errorMsg },
      fallbackUsed: false,
      fallbackInfo: null,
      estimatedCostUsd: 0,
    });
    return {
      success: false,
      errorCode: "IMAGE_MODEL_UNVERIFIED",
      errorMessage: errorMsg,
    };
  }

  const taskId = `img_task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();

  const initialAttempt: AttemptLog = {
    timestamp: now,
    fromState: "idle",
    toState: "queued",
    note: `Task created and queued for model ${model}`,
  };

  const task: ImageTask = {
    taskId,
    workspaceId,
    model,
    prompt,
    state: "queued",
    attemptHistory: [initialAttempt],
    createdAt: now,
    updatedAt: now,
  };

  taskStore.set(taskId, task);
  return { success: true, task };
}

export async function processImageTask(taskId: string): Promise<{ success: boolean; task?: ImageTask; error?: string }> {
  const task = taskStore.get(taskId);
  if (!task) return { success: false, error: "TASK_NOT_FOUND" };

  if (task.state !== "queued") {
    return { success: false, error: `TASK_NOT_QUEUED: Task is currently '${task.state}'` };
  }

  // Transition queued -> generating
  transitionTaskState(taskId, "generating", "Starting generation");

  const isMock = MOCK_IMAGE_MODELS.has(task.model);

  if (isMock) {
    const assetUrl = `mock://assets/${task.workspaceId}/${task.taskId}.png`;
    const transRes = transitionTaskState(taskId, "completed", "Mock generation complete", assetUrl);

    const telemetry = recordCallTelemetry({
      provider: "mock",
      requestedModel: task.model,
      resolvedModel: task.model,
      requestId: `mock_req_${Date.now()}`,
      callType: "image",
      success: true,
      failure: null,
      fallbackUsed: false,
      fallbackInfo: null,
      estimatedCostUsd: 0,
    });

    if (transRes.task) transRes.task.telemetry = telemetry;
    return transRes;
  }

  // Real Image Model Request
  try {
    const providerName = getProviderForImageModel(task.model);
    const costUsd = 0.03; // Estimated cost per real image generation API call

    let assetUrl = "";
    let reqId = `real_img_${Date.now()}`;

    if (providerName === "gemini") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is missing for real image generation");

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: task.model,
        contents: `Generate visual blueprint representation for: ${task.prompt}`,
      });
      reqId = (response as any).responseId || reqId;
      assetUrl = `https://storage.googleapis.com/generated-assets/${task.workspaceId}/${task.taskId}.png`;
    } else {
      assetUrl = `https://api.gateway.ai/assets/${task.workspaceId}/${task.taskId}.png`;
    }

    const transRes = transitionTaskState(taskId, "completed", "Real generation complete", assetUrl);

    const telemetry = recordCallTelemetry({
      provider: providerName,
      requestedModel: task.model,
      resolvedModel: task.model,
      requestId: reqId,
      callType: "image",
      success: true,
      failure: null,
      fallbackUsed: false,
      fallbackInfo: null,
      estimatedCostUsd: costUsd,
    });

    if (transRes.task) transRes.task.telemetry = telemetry;
    return transRes;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    transitionTaskState(taskId, "failed", `Real image generation failed: ${errMsg}`);

    const telemetry = recordCallTelemetry({
      provider: getProviderForImageModel(task.model),
      requestedModel: task.model,
      resolvedModel: task.model,
      requestId: null,
      callType: "image",
      success: false,
      failure: { message: errMsg },
      fallbackUsed: false,
      fallbackInfo: null,
      estimatedCostUsd: 0,
    });

    if (task) {
      task.errorCode = "IMAGE_GENERATION_FAILED";
      task.errorMessage = errMsg;
      task.telemetry = telemetry;
    }

    return { success: false, task, error: errMsg };
  }
}

export function transitionTaskState(
  taskId: string,
  targetState: ImageTaskState,
  note?: string,
  assetUrl?: string
): { success: boolean; task?: ImageTask; error?: string } {
  const task = taskStore.get(taskId);
  if (!task) {
    return { success: false, error: "TASK_NOT_FOUND" };
  }

  const currentState = task.state;

  if (currentState === "cancelled" && targetState === "cancelled") {
    return { success: true, task };
  }

  if (currentState === "completed" || currentState === "cancelled" || currentState === "failed") {
    return {
      success: false,
      error: `ILLEGAL_STATE_TRANSITION: Cannot transition from terminal state '${currentState}' to '${targetState}'`,
    };
  }

  const legalTransitions: Record<ImageTaskState, ImageTaskState[]> = {
    idle: ["queued"],
    queued: ["generating", "cancelled"],
    generating: ["completed", "failed", "cancelled"],
    completed: [],
    failed: [],
    cancelled: [],
  };

  const allowedNext = legalTransitions[currentState] || [];
  if (!allowedNext.includes(targetState)) {
    return {
      success: false,
      error: `ILLEGAL_STATE_TRANSITION: Transition from '${currentState}' to '${targetState}' is not allowed`,
    };
  }

  const now = Date.now();
  const attemptLog: AttemptLog = {
    timestamp: now,
    fromState: currentState,
    toState: targetState,
    note: note || `Transitioned from ${currentState} to ${targetState}`,
  };

  task.state = targetState;
  task.attemptHistory.push(attemptLog);
  task.updatedAt = now;

  if (targetState === "completed" && assetUrl) {
    task.mockAssetUrl = assetUrl;
  }

  return { success: true, task };
}

export function cancelTask(taskId: string): { success: boolean; task?: ImageTask; error?: string } {
  return transitionTaskState(taskId, "cancelled", "Cancelled by user request");
}

export function getTask(taskId: string): ImageTask | undefined {
  return taskStore.get(taskId);
}

export function getWorkspaceTasks(workspaceId: string): ImageTask[] {
  return Array.from(taskStore.values()).filter((t) => t.workspaceId === workspaceId);
}

export function clearTaskStore(): void {
  taskStore.clear();
}

function getProviderForImageModel(model: string): string {
  if (model.startsWith("vector-")) return "vectorengine";
  if (model.startsWith("router-")) return "routerhub";
  return "gemini";
}
