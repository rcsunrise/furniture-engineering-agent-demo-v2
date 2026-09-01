import { defaultConfig, type LocalWorkerConfig } from "./config.js";
import { GatewayClient } from "./gatewayClient.js";
import { HeartbeatManager } from "./heartbeat.js";
import { executeJobTask } from "./executor.js";

export class LocalWorkerCompanion {
  private client: GatewayClient;
  private heartbeat: HeartbeatManager;
  private isRunning = false;

  constructor(private config: LocalWorkerConfig = defaultConfig) {
    this.client = new GatewayClient(config);
    this.heartbeat = new HeartbeatManager(this.client, config.heartbeatIntervalMs);
  }

  public async start(): Promise<void> {
    console.log(`[LocalWorker] Registering worker '${this.config.workerId}' at '${this.config.gatewayUrl}'...`);
    const regRes = await this.client.register();
    console.log(`[LocalWorker] Registered successfully! Heartbeat interval: ${regRes.heartbeatIntervalMs}ms`);

    this.heartbeat.start();
    this.isRunning = true;

    this.pollLoop().catch((err) => {
      console.error("[LocalWorker Fatal Loop Error]", err);
    });
  }

  public stop(): void {
    this.isRunning = false;
    this.heartbeat.stop();
    console.log("[LocalWorker] Stopped.");
  }

  private async pollLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const { job } = await this.client.getNextJob();
        if (job) {
          console.log(`[LocalWorker] Discovered job '${job.id}' (${job.capabilityId}). Claiming...`);
          this.heartbeat.setStatus("busy", job.id);

          try {
            await this.client.claimJob(job.id);
            await this.client.startJob(job.id);
            
            console.log(`[LocalWorker] Executing task for job '${job.id}' (provider: ${job.provider})...`);
            const execResult = await executeJobTask(job, this.config.workerId, {
              gatewayClient: this.client,
              gatewayUrl: this.config.gatewayUrl,
            });

            if (execResult.success) {
              await this.client.reportResult(job.id, "completed", execResult.outputArtifacts);
              console.log(`[LocalWorker] Job '${job.id}' completed successfully.`);
            } else {
              await this.client.reportResult(job.id, "failed", undefined, execResult.error);
              console.log(`[LocalWorker] Job '${job.id}' marked failed.`);
            }
          } catch (err: any) {
            console.error(`[LocalWorker] Error processing job '${job.id}':`, err.message);
            try {
              await this.client.reportResult(job.id, "failed", undefined, err.message);
            } catch {}
          } finally {
            this.heartbeat.setStatus("idle");
          }
        }
      } catch (err: any) {
        console.warn(`[LocalWorker Poll Warning]`, err.message);
      }

      await new Promise((resolve) => setTimeout(resolve, this.config.pollIntervalMs));
    }
  }
}

// Auto-run if executed directly as entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const companion = new LocalWorkerCompanion();
  companion.start().catch((err) => {
    console.error("LocalWorker startup failed:", err);
    process.exit(1);
  });
}
