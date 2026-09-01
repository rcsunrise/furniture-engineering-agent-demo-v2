import type { GatewayClient } from "./gatewayClient.js";

export class HeartbeatManager {
  private timer: NodeJS.Timeout | null = null;
  private currentStatus: "idle" | "busy" = "idle";
  private activeJobId?: string;
  private providerDiagnostics?: Record<string, unknown>;

  constructor(private client: GatewayClient, private intervalMs: number = 5000) {}

  public start(): void {
    this.stop();
    this.timer = setInterval(() => {
      this.beat().catch((err) => {
        console.warn("[LocalWorker Heartbeat Warning]", err.message);
      });
    }, this.intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public setStatus(
    status: "idle" | "busy",
    activeJobId?: string,
    providerDiagnostics?: Record<string, unknown>
  ): void {
    this.currentStatus = status;
    this.activeJobId = activeJobId;
    if (providerDiagnostics) {
      this.providerDiagnostics = providerDiagnostics;
    }
    this.beat().catch(() => {});
  }

  public async beat(): Promise<void> {
    await this.client.sendHeartbeat(this.currentStatus, this.activeJobId, this.providerDiagnostics);
  }
}
