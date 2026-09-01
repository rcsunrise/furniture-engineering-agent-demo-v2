export interface CallTelemetry {
  id: string;
  timestamp: number;
  provider: string;
  requestedModel: string;
  resolvedModel: string;
  requestId: string | null;
  callType: "reasoning" | "image";
  callCount: number;
  success: boolean;
  failure: { code?: string; message: string; httpStatus?: number } | null;
  fallbackUsed: boolean;
  fallbackInfo: {
    primaryProvider: string;
    primaryModel: string;
    primaryError: string;
    fallbackProvider: string;
    fallbackModel: string;
  } | null;
  estimatedCostUsd: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface TelemetrySummary {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  fallbackCount: number;
  realImageCalls: number;
  billableImageCalls: number;
  estimatedTotalCostUsd: number;
  providerBreakdown: Record<string, { calls: number; costUsd: number; failures: number }>;
}

let globalCallCount = 0;
const telemetryLogs: CallTelemetry[] = [];

export function recordCallTelemetry(params: Omit<CallTelemetry, "id" | "timestamp" | "callCount">): CallTelemetry {
  globalCallCount++;
  const record: CallTelemetry = {
    id: `telemetry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
    callCount: globalCallCount,
    ...params,
  };
  telemetryLogs.push(record);
  return record;
}

export function getTelemetryHistory(): CallTelemetry[] {
  return [...telemetryLogs];
}

export function getTelemetrySummary(): TelemetrySummary {
  let successfulCalls = 0;
  let failedCalls = 0;
  let fallbackCount = 0;
  let realImageCalls = 0;
  let billableImageCalls = 0;
  let estimatedTotalCostUsd = 0;
  const providerBreakdown: Record<string, { calls: number; costUsd: number; failures: number }> = {};

  for (const log of telemetryLogs) {
    if (log.success) successfulCalls++;
    else failedCalls++;

    if (log.fallbackUsed) fallbackCount++;

    if (log.callType === "image" && log.provider !== "mock") {
      realImageCalls++;
      if (log.estimatedCostUsd > 0) {
        billableImageCalls++;
      }
    }

    estimatedTotalCostUsd += log.estimatedCostUsd;

    if (!providerBreakdown[log.provider]) {
      providerBreakdown[log.provider] = { calls: 0, costUsd: 0, failures: 0 };
    }
    providerBreakdown[log.provider].calls++;
    providerBreakdown[log.provider].costUsd += log.estimatedCostUsd;
    if (!log.success) {
      providerBreakdown[log.provider].failures++;
    }
  }

  return {
    totalCalls: telemetryLogs.length,
    successfulCalls,
    failedCalls,
    fallbackCount,
    realImageCalls,
    billableImageCalls,
    estimatedTotalCostUsd: Number(estimatedTotalCostUsd.toFixed(6)),
    providerBreakdown,
  };
}

export function clearTelemetryLogs(): void {
  globalCallCount = 0;
  telemetryLogs.length = 0;
}
