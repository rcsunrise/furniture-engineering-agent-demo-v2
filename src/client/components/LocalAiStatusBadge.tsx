import React, { useState, useEffect } from "react";

export type TopStatus = "READY" | "BUSY" | "DEGRADED" | "OFFLINE" | "NOT CONFIGURED";

export interface WorkerStatusData {
  topStatus: TopStatus;
  localWorker: "online" | "offline" | "busy";
  comfyUI: "ready" | "offline" | "disabled";
  hunyuan3D: "ready" | "unavailable" | "workflow_invalid";
  currentJob: "idle" | "queued" | "running" | "completed" | "failed";
  lastHeartbeat: string | null;
  capabilities: string[];
  activeWorker: {
    workerId: string;
    name: string;
    version: string;
  } | null;
}

const BADGE_COLORS: Record<TopStatus, { bg: string; border: string; text: string }> = {
  READY: { bg: "rgba(46, 125, 50, 0.2)", border: "#4caf50", text: "#81c784" },
  BUSY: { bg: "rgba(2, 136, 209, 0.2)", border: "#29b6f6", text: "#4fc3f7" },
  DEGRADED: { bg: "rgba(237, 108, 2, 0.2)", border: "#ff9800", text: "#ffb74d" },
  OFFLINE: { bg: "rgba(211, 47, 47, 0.2)", border: "#f44336", text: "#e57373" },
  "NOT CONFIGURED": { bg: "rgba(117, 117, 117, 0.2)", border: "#9e9e9e", text: "#bdbdbd" },
};

export function LocalAiStatusBadge() {
  const [status, setStatus] = useState<WorkerStatusData | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/worker/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && json.data) {
        setStatus(json.data);
        setError(null);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to fetch status");
    }
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 5000);
    return () => clearInterval(timer);
  }, []);

  const topStatus: TopStatus = status?.topStatus || "OFFLINE";
  const colors = BADGE_COLORS[topStatus] || BADGE_COLORS["OFFLINE"];

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* Top Status Badge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: 16,
          color: colors.text,
          fontSize: 12,
          fontWeight: "bold",
          cursor: "pointer",
          outline: "none",
          transition: "all 0.2s ease",
        }}
        title="Click to toggle Local AI status details"
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: colors.border,
            boxShadow: `0 0 6px ${colors.border}`,
          }}
        />
        <span>LOCAL AI</span>
        <span
          style={{
            fontSize: 10,
            padding: "1px 5px",
            borderRadius: 3,
            background: "rgba(255, 255, 255, 0.1)",
          }}
        >
          {topStatus}
        </span>
      </button>

      {/* Detail Panel Popup */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: 36,
            right: 0,
            width: 320,
            background: "#1c1c24",
            border: "1px solid #3d3d4e",
            borderRadius: 8,
            padding: 16,
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            zIndex: 1000,
            color: "#e0e0e0",
            fontSize: 13,
            fontFamily: "sans-serif",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: "1px solid #2a2a35",
            }}
          >
            <strong style={{ color: "#fff", fontSize: 14 }}>Local AI Runtime Status</strong>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#aaa",
                cursor: "pointer",
                fontSize: 16,
              }}
            >
              ✕
            </button>
          </div>

          {error && (
            <div style={{ color: "#ff8a80", fontSize: 12, marginBottom: 8 }}>
              Status Error: {error}
            </div>
          )}

          <div style={{ display: "grid", gap: 8 }}>
            <StatusRow
              label="Local Worker"
              value={status?.localWorker || "offline"}
              highlight={status?.localWorker === "online" ? "#81c784" : status?.localWorker === "busy" ? "#4fc3f7" : "#ff8a80"}
            />
            <StatusRow
              label="ComfyUI"
              value={status?.comfyUI || "offline"}
              highlight={status?.comfyUI === "ready" ? "#81c784" : status?.comfyUI === "disabled" ? "#aaa" : "#ff8a80"}
            />
            <StatusRow
              label="Hunyuan3D"
              value={status?.hunyuan3D || "unavailable"}
              highlight={status?.hunyuan3D === "ready" ? "#81c784" : "#ff8a80"}
            />
            <StatusRow
              label="Current Job"
              value={status?.currentJob || "idle"}
              highlight={status?.currentJob === "running" ? "#4fc3f7" : status?.currentJob === "completed" ? "#81c784" : "#e0e0e0"}
            />
            <StatusRow
              label="Last Heartbeat"
              value={status?.lastHeartbeat ? new Date(status.lastHeartbeat).toLocaleTimeString() : "None"}
            />
            <div style={{ marginTop: 4 }}>
              <div style={{ color: "#aaa", fontSize: 11, marginBottom: 4 }}>Capabilities:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {status?.capabilities && status.capabilities.length > 0 ? (
                  status.capabilities.map((cap) => (
                    <span
                      key={cap}
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        background: "#2a2a35",
                        border: "1px solid #3d3d4e",
                        borderRadius: 3,
                        color: "#80cbc4",
                      }}
                    >
                      {cap}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: 11, color: "#777" }}>None</span>
                )}
              </div>
            </div>

            {status?.activeWorker && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #2a2a35", fontSize: 11, color: "#aaa" }}>
                <div>Worker: {status.activeWorker.name} ({status.activeWorker.workerId})</div>
                <div>Version: {status.activeWorker.version}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusRow({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
      <span style={{ color: "#aaa" }}>{label}:</span>
      <span style={{ fontWeight: "bold", color: highlight || "#fff" }}>{value}</span>
    </div>
  );
}
