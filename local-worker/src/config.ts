export interface LocalWorkerConfig {
  gatewayUrl: string;
  serverOrigin?: string;
  workerToken: string;
  workerId: string;
  workerName: string;
  workerVersion: string;
  capabilities: string[];
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
}

export const defaultConfig: LocalWorkerConfig = {
  gatewayUrl: process.env.WORKER_GATEWAY_URL || "http://127.0.0.1:3000",
  serverOrigin: process.env.SERVER_ORIGIN || process.env.WORKER_GATEWAY_URL || "http://127.0.0.1:3000",
  workerToken: process.env.LOCAL_WORKER_TOKEN || "default-local-worker-token",
  workerId: process.env.WORKER_ID || `local-worker-win-${Math.floor(Math.random() * 1000)}`,
  workerName: "Windows Furniture Companion Worker",
  workerVersion: "1.0.0",
  capabilities: ["image_to_mesh", "mock_cad_vectorizer"],
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "3000", 10),
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || "5000", 10),
};
