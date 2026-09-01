import React from "react";
import type { EngineeringPipelineDiagnostics, ProductionEligibilityResult } from "../../shared/engineeringSession.js";

export interface EngineeringPipelineDiagnosticsViewProps {
  diagnostics?: EngineeringPipelineDiagnostics;
  eligibility?: ProductionEligibilityResult;
  fesLoaded?: boolean;
  meshLoaded?: boolean;
  geometryMode?: string;
}

export const EngineeringPipelineDiagnosticsView: React.FC<EngineeringPipelineDiagnosticsViewProps> = ({
  diagnostics,
  eligibility,
  fesLoaded = false,
  meshLoaded = false,
  geometryMode = "box",
}) => {
  const getBadgeStyle = (status: string) => {
    switch (status?.toLowerCase()) {
      case "passed":
      case "ready":
      case "engineering":
        return { bg: "#1b5e20", text: "#a5d6a7" };
      case "warning":
      case "ai":
      case "proxy":
        return { bg: "#e65100", text: "#ffe082" };
      case "failed":
      case "blocked":
      case "missing":
      case "not_ready":
      case "offline":
      case "unavailable":
        return { bg: "#b71c1c", text: "#ff8a80" };
      default:
        return { bg: "#37474f", text: "#b0bec5" };
    }
  };

  const stages = [
    { label: "INPUT (Image)", status: diagnostics?.image || "not_started" },
    { label: "AI WORKER", status: diagnostics?.localWorker || "ready" },
    { label: "COMFYUI", status: diagnostics?.comfyui || "ready" },
    { label: "HUNYUAN3D", status: diagnostics?.hunyuan3d || "ready" },
    { label: "ARTIFACT (GLB)", status: meshLoaded ? "ready" : diagnostics?.glb || "not_started" },
    { label: "SESSION", status: diagnostics?.session || "ready" },
    { label: "FES DOC", status: fesLoaded ? "ready" : diagnostics?.fes || "not_started" },
    { label: "ALIGNMENT", status: diagnostics?.alignment || "not_started" },
    { label: "GEOMETRY", status: geometryMode === "box" ? "proxy" : geometryMode === "soft_surface" || geometryMode === "loft_shell" ? "engineering" : "ai" },
    { label: "ASSEMBLY", status: diagnostics?.assembly || (fesLoaded ? "passed" : "not_started") },
    { label: "PRODUCTION", status: eligibility?.eligible ? "ready" : "not_ready" },
  ];

  return (
    <div
      style={{
        background: "#16161e",
        color: "#e0e0e0",
        borderRadius: 8,
        padding: 12,
        fontFamily: "monospace",
        fontSize: 12,
        border: "1px solid #2e2e3e",
      }}
    >
      <div style={{ color: "#4fc3f7", fontWeight: "bold", marginBottom: 8, borderBottom: "1px solid #2e2e3e", paddingBottom: 4 }}>
        Engineering Pipeline Diagnostics
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {stages.map((st, i) => {
          const style = getBadgeStyle(st.status);
          return (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 4px", background: "#1f1f2e", borderRadius: 4 }}>
              <span style={{ fontSize: 11, color: "#9e9e9e" }}>{st.label}:</span>
              <span
                style={{
                  background: style.bg,
                  color: style.text,
                  padding: "1px 6px",
                  borderRadius: 3,
                  fontWeight: "bold",
                  fontSize: 10,
                  textTransform: "uppercase",
                }}
              >
                {st.status}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 10, paddingTop: 6, borderTop: "1px solid #2e2e3e" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: "bold", color: "#eceff1" }}>Production Gate:</span>
          <span
            style={{
              fontWeight: "bold",
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 4,
              background: eligibility?.eligible ? "#1b5e20" : "#b71c1c",
              color: eligibility?.eligible ? "#81c784" : "#ff8a80",
            }}
          >
            {eligibility?.level || "DISPLAY_READY"}
          </span>
        </div>
        {eligibility?.reason && (
          <div style={{ fontSize: 10, color: "#ffb74d", marginTop: 4 }}>
            Reason: {eligibility.reason}
          </div>
        )}
      </div>
    </div>
  );
};
