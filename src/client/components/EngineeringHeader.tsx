import React from "react";
import { LocalAiStatusBadge } from "./LocalAiStatusBadge.js";

export type Tab = "REF_G3" | "LOCAL_AI" | "ALIGNMENT" | "PROFILE_RECON" | "DATA" | "CAD" | "3D" | "AGENT" | "SKILLS";

const TAB_LABELS: Record<Tab, string> = {
  REF_G3: "参考标注与推理 (G3-AB)",
  LOCAL_AI: "图像生成网格 (G4-3)",
  ALIGNMENT: "工程对齐会话 (G4-4E)",
  PROFILE_RECON: "轮廓候选 (G4-5B-1)",
  DATA: "工程数据 (DATA)",
  CAD: "CAD 轮廓线图 (CAD)",
  "3D": "3D 装配/爆炸 (3D)",
  AGENT: "智能规划 (AGENT)",
  SKILLS: "技能扩展 (SKILLS)",
};

interface EngineeringHeaderProps {
  activeTab: Tab;
  onSelectTab: (tab: Tab) => void;
  status: string;
  uploadState: "idle" | "uploading" | "success" | "error";
  meshJobStatus?: string | null;
}

export function EngineeringHeader({ activeTab, onSelectTab, status, uploadState, meshJobStatus }: EngineeringHeaderProps) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px",
        background: "#1c1c22",
        borderBottom: "1px solid #2d2d38",
      }}
    >
      <b style={{ fontSize: 16, color: "#fff" }}>家具工程智能平台 · Furniture Engineering Agent</b>
      <div style={{ display: "flex", gap: 6, marginLeft: 12 }}>
        {(["REF_G3", "LOCAL_AI", "ALIGNMENT", "PROFILE_RECON", "DATA", "CAD", "3D", "AGENT", "SKILLS"] as Tab[]).map((t) => {
          const isMeshRunning =
            t === "LOCAL_AI" &&
            meshJobStatus &&
            ["queued", "claimed", "running"].includes(meshJobStatus);
          const isMeshDone = t === "LOCAL_AI" && meshJobStatus === "completed";

          return (
            <button
              key={t}
              onClick={() => onSelectTab(t)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                background: activeTab === t ? "#4fc3f7" : isMeshRunning ? "#1a3a5f" : "#2a2a35",
                color: activeTab === t ? "#000" : "#fff",
                fontWeight: activeTab === t ? "bold" : "normal",
                border:
                  activeTab === t
                    ? "1px solid #4fc3f7"
                    : isMeshRunning
                    ? "1px solid #0288d1"
                    : "1px solid #3d3d4e",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 13,
                transition: "all 0.15s ease",
              }}
            >
              <span>{TAB_LABELS[t]}</span>
              {isMeshRunning && (
                <span
                  style={{
                    fontSize: 10,
                    padding: "1px 5px",
                    background: "#0288d1",
                    color: "#fff",
                    borderRadius: 3,
                    fontWeight: "bold",
                    animation: "pulse 1.5s infinite",
                  }}
                >
                  ⏳ 运行中
                </span>
              )}
              {isMeshDone && (
                <span
                  style={{
                    fontSize: 10,
                    padding: "1px 5px",
                    background: "#2e7d32",
                    color: "#fff",
                    borderRadius: 3,
                    fontWeight: "bold",
                  }}
                >
                  ✓ 就绪
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        <LocalAiStatusBadge />
        <span
          style={{
            fontSize: 12,
            color: uploadState === "error" ? "#ff8a80" : "#4fc3f7",
            fontWeight: "bold",
          }}
        >
          {status}
        </span>
      </div>
    </header>
  );
}
