import React, { useState } from "react";
import type {
  GeometryReconstructionContext,
  ReconstructionReadinessResult,
  GeometryReconstructionMethod,
  EngineeringGeometryCandidate,
} from "../../shared/geometryReconstruction";
import { evaluateReconstructionReadiness } from "../../shared/geometryReconstruction";
import { ProfileReconstructionPanel } from "./ProfileReconstructionPanel";

interface GeometryReconstructionPanelProps {
  sessionId?: string;
  canonicalComponentId?: string;
  context?: GeometryReconstructionContext | null;
  onRefresh?: () => void;
  onCandidateCreated?: (candidate: EngineeringGeometryCandidate) => void;
}

export const GeometryReconstructionPanel: React.FC<GeometryReconstructionPanelProps> = ({
  sessionId = "N/A",
  canonicalComponentId = "UNMAPPED",
  context,
  onRefresh,
  onCandidateCreated,
}) => {
  const [activeTab, setActiveTab] = useState<"profile" | "contract">("profile");
  const [selectedMethod, setSelectedMethod] =
    useState<GeometryReconstructionMethod>("profile_reconstruction");
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const readiness: ReconstructionReadinessResult = evaluateReconstructionReadiness(
    context,
    selectedMethod
  );

  const handleTriggerReconstruct = () => {
    if (selectedMethod === "profile_reconstruction") {
      setActiveTab("profile");
    } else {
      setNoticeMessage(
        `NOT IMPLEMENTED IN G4-5B-1: Method '${selectedMethod}' is reserved for Gate G4-5B-2/3/4. Only 'profile_reconstruction' is available in G4-5B-1.`
      );
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: "4px", backgroundColor: "#18181b", padding: "4px", borderRadius: "6px" }}>
        <button
          onClick={() => setActiveTab("profile")}
          style={{
            flex: 1,
            padding: "6px 12px",
            borderRadius: "4px",
            border: "none",
            backgroundColor: activeTab === "profile" ? "#27272a" : "transparent",
            color: activeTab === "profile" ? "#38bdf8" : "#a1a1aa",
            fontWeight: activeTab === "profile" ? "bold" : "normal",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          📐 G4-5B-1 截面轮廓重建器
        </button>
        <button
          onClick={() => setActiveTab("contract")}
          style={{
            flex: 1,
            padding: "6px 12px",
            borderRadius: "4px",
            border: "none",
            backgroundColor: activeTab === "contract" ? "#27272a" : "transparent",
            color: activeTab === "contract" ? "#38bdf8" : "#a1a1aa",
            fontWeight: activeTab === "contract" ? "bold" : "normal",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          📋 G4-5B-0 重建契约与就绪度
        </button>
      </div>

      {activeTab === "profile" ? (
        <ProfileReconstructionPanel
          sessionId={sessionId}
          canonicalComponentId={canonicalComponentId}
          context={context}
          onCandidateCreated={onCandidateCreated}
        />
      ) : (
        <div
          style={{
            backgroundColor: "#1e1e1e",
            color: "#d4d4d4",
            padding: "16px",
            borderRadius: "8px",
            border: "1px solid #333",
            fontFamily: "sans-serif",
            fontSize: "13px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
              borderBottom: "1px solid #333",
              paddingBottom: "8px",
            }}
          >
            <h3 style={{ margin: 0, color: "#4fc3f7", fontSize: "14px", fontWeight: "bold" }}>
              📐 几何重建契约与就绪度评估 (G4-5B-0)
            </h3>
            <span
              style={{
                fontSize: "11px",
                backgroundColor: "#263238",
                color: "#80deea",
                padding: "2px 8px",
                borderRadius: "4px",
                border: "1px solid #00838f",
              }}
            >
              Gate: G4-5B-0
            </span>
          </div>

          {/* Contract Context Matrix */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "14px" }}>
            <div style={{ backgroundColor: "#252526", padding: "8px", borderRadius: "4px" }}>
              <div style={{ color: "#888", fontSize: "11px" }}>会话 ID</div>
              <div style={{ fontFamily: "monospace", color: "#80cbc4", fontWeight: "bold" }}>{sessionId}</div>
            </div>
            <div style={{ backgroundColor: "#252526", padding: "8px", borderRadius: "4px" }}>
              <div style={{ color: "#888", fontSize: "11px" }}>标准构件 ID</div>
              <div style={{ fontFamily: "monospace", color: "#ffd54f", fontWeight: "bold" }}>{canonicalComponentId}</div>
            </div>
            <div style={{ backgroundColor: "#252526", padding: "8px", borderRadius: "4px" }}>
              <div style={{ color: "#888", fontSize: "11px" }}>构件类型</div>
              <div style={{ fontWeight: "bold" }}>{context?.component?.type || "无"}</div>
            </div>
            <div style={{ backgroundColor: "#252526", padding: "8px", borderRadius: "4px" }}>
              <div style={{ color: "#888", fontSize: "11px" }}>就绪状态</div>
              <div
                style={{
                  fontWeight: "bold",
                  color: readiness.status === "READY" ? "#81c784" : readiness.status.startsWith("BLOCKED_") ? "#e57373" : "#ffb74d",
                }}
              >
                {readiness.status === "READY" ? "就绪 (READY)" : readiness.status}
              </div>
            </div>
          </div>

          {/* Prerequisites Matrix */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: "8px",
              marginBottom: "14px",
              fontSize: "12px",
            }}
          >
            <div style={{ backgroundColor: "#2b2b2b", padding: "6px 8px", borderRadius: "4px" }}>
              <span style={{ color: "#aaa" }}>参考网格: </span>
              <span style={{ color: context?.truthState?.hasReferenceMesh ? "#81c784" : "#ff8a65", fontWeight: "bold" }}>
                {context?.truthState?.hasReferenceMesh ? "就绪" : "缺失"}
              </span>
            </div>
            <div style={{ backgroundColor: "#2b2b2b", padding: "6px 8px", borderRadius: "4px" }}>
              <span style={{ color: "#aaa" }}>FES尺寸: </span>
              <span style={{ color: context?.truthState?.hasProvidedDimensions ? "#81c784" : "#ff8a65", fontWeight: "bold" }}>
                {context?.truthState?.hasProvidedDimensions ? `${context.component.sizeX}×${context.component.sizeY}×${context.component.sizeZ}` : "缺失"}
              </span>
            </div>
            <div style={{ backgroundColor: "#2b2b2b", padding: "6px 8px", borderRadius: "4px" }}>
              <span style={{ color: "#aaa" }}>轮廓截面: </span>
              <span style={{ color: context?.truthState?.hasEngineeringProfiles ? "#81c784" : "#888", fontWeight: "bold" }}>
                {context?.truthState?.hasEngineeringProfiles ? "已提供" : "无"}
              </span>
            </div>
            <div style={{ backgroundColor: "#2b2b2b", padding: "6px 8px", borderRadius: "4px" }}>
              <span style={{ color: "#aaa" }}>放样体: </span>
              <span style={{ color: context?.truthState?.hasEngineeringLoft ? "#81c784" : "#888", fontWeight: "bold" }}>
                {context?.truthState?.hasEngineeringLoft ? "已提供" : "无"}
              </span>
            </div>
            <div style={{ backgroundColor: "#2b2b2b", padding: "6px 8px", borderRadius: "4px" }}>
              <span style={{ color: "#aaa" }}>软体曲面: </span>
              <span style={{ color: context?.truthState?.hasEngineeringSoftSurface ? "#81c784" : "#888", fontWeight: "bold" }}>
                {context?.truthState?.hasEngineeringSoftSurface ? "已提供" : "无"}
              </span>
            </div>
          </div>

          {/* Method Selector & Trigger */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              backgroundColor: "#252526",
              padding: "10px",
              borderRadius: "4px",
            }}
          >
            <label style={{ color: "#ccc", fontSize: "12px", fontWeight: "bold" }}>重建算法:</label>
            <select
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value as GeometryReconstructionMethod)}
              style={{
                backgroundColor: "#333",
                color: "#fff",
                border: "1px solid #555",
                borderRadius: "4px",
                padding: "4px 8px",
                fontSize: "12px",
              }}
            >
              <option value="profile_reconstruction">正交截面重建 (G4-5B-1)</option>
              <option value="loft_reconstruction">三维放样重建 (G4-5B-2)</option>
              <option value="soft_surface_reconstruction">软体曲面重建 (G4-5B-2)</option>
              <option value="mesh_parametric_fitting">网格参数化拟合 (G4-5B-3)</option>
              <option value="hybrid">混合协同重建</option>
            </select>

            <button
              onClick={handleTriggerReconstruct}
              style={{
                backgroundColor: "#0277bd",
                color: "#ffffff",
                border: "none",
                borderRadius: "4px",
                padding: "6px 14px",
                fontSize: "12px",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              执行几何重建
            </button>
          </div>

          {/* Notice box */}
          {noticeMessage && (
            <div
              style={{
                marginTop: "10px",
                backgroundColor: "#37474f",
                color: "#80deea",
                padding: "8px 12px",
                borderRadius: "4px",
                borderLeft: "4px solid #00bcd4",
                fontSize: "12px",
              }}
            >
              {noticeMessage}
            </div>
          )}

          {/* Readiness Reasons */}
          {readiness.reasons.length > 0 && (
            <div style={{ marginTop: "10px", color: "#aaa", fontSize: "11px" }}>
              <span style={{ fontWeight: "bold", color: "#ccc" }}>契约就绪度说明: </span>
              {readiness.reasons.join(" ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
