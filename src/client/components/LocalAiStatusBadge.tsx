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
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/worker/status");
        if (!res.ok) return;
        const json = await res.json();
        if (mounted && json.success && json.data) {
          setStatus(json.data);
          setError(null);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err?.message || "Failed to fetch status");
        }
      }
    };
    load();
    const timer = setInterval(load, 8000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const topStatus: TopStatus = status?.topStatus || "OFFLINE";
  const colors = BADGE_COLORS[topStatus] || BADGE_COLORS["OFFLINE"];

  const statusTextMap: Record<TopStatus, string> = {
    READY: "就绪",
    BUSY: "忙碌中",
    DEGRADED: "降级运行",
    OFFLINE: "离线",
    "NOT CONFIGURED": "未配置",
  };

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
        title="点击查看本地 AI 节点运行状态详情"
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
        <span>本地 AI</span>
        <span
          style={{
            fontSize: 10,
            padding: "1px 5px",
            borderRadius: 3,
            background: "rgba(255, 255, 255, 0.1)",
          }}
        >
          {statusTextMap[topStatus] || topStatus}
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
            <strong style={{ color: "#fff", fontSize: 14 }}>本地 AI 运行状态</strong>
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
              状态获取错误: {error}
            </div>
          )}

          <div style={{ display: "grid", gap: 8 }}>
            <StatusRow
              label="本地 Worker 客户端"
              value={status?.localWorker === "online" ? "在线 (online)" : status?.localWorker === "busy" ? "繁忙 (busy)" : "离线 (offline)"}
              highlight={status?.localWorker === "online" ? "#81c784" : status?.localWorker === "busy" ? "#4fc3f7" : "#ff8a80"}
            />
            <StatusRow
              label="ComfyUI 服务"
              value={status?.comfyUI === "ready" ? "就绪 (ready)" : status?.comfyUI === "disabled" ? "已禁用" : "未启动/离线"}
              highlight={status?.comfyUI === "ready" ? "#81c784" : status?.comfyUI === "disabled" ? "#aaa" : "#ff8a80"}
            />
            <StatusRow
              label="混元 3D 工作流"
              value={status?.hunyuan3D === "ready" ? "就绪 (ready)" : status?.hunyuan3D === "workflow_invalid" ? "工作流无效" : "不可用"}
              highlight={status?.hunyuan3D === "ready" ? "#81c784" : "#ff8a80"}
            />
            <StatusRow
              label="当前作业任务"
              value={status?.currentJob === "running" ? "生成中 (running)" : status?.currentJob === "queued" ? "排队中 (queued)" : status?.currentJob === "completed" ? "已完成 (completed)" : "空闲 (idle)"}
              highlight={status?.currentJob === "running" ? "#4fc3f7" : status?.currentJob === "completed" ? "#81c784" : "#e0e0e0"}
            />
            <StatusRow
              label="最新心跳时间"
              value={status?.lastHeartbeat ? new Date(status.lastHeartbeat).toLocaleTimeString() : "无心跳记录"}
            />
            <div style={{ marginTop: 4 }}>
              <div style={{ color: "#aaa", fontSize: 11, marginBottom: 4 }}>支持功能特性:</div>
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
                  <span style={{ fontSize: 11, color: "#777" }}>暂无</span>
                )}
              </div>
            </div>

            {status?.activeWorker && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #2a2a35", fontSize: 11, color: "#aaa" }}>
                <div>Worker: {status.activeWorker.name} ({status.activeWorker.workerId})</div>
                <div>版本: {status.activeWorker.version}</div>
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
