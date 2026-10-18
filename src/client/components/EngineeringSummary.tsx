import React from "react";
import type { FurnitureEngineeringData } from "../../shared/fes.js";
import type { UploadState } from "../hooks/useEngineeringData.js";

interface EngineeringSummaryProps {
  uploadState: UploadState;
  fes: FurnitureEngineeringData | null;
  selectedComponentId: string | null;
}

export function EngineeringSummary({ uploadState, fes, selectedComponentId }: EngineeringSummaryProps) {
  return (
    <aside
      style={{
        padding: 14,
        borderLeft: "1px solid #2d2d38",
        background: "#18181c",
        overflowY: "auto",
      }}
    >
      <h3 style={{ margin: "0 0 12px 0", fontSize: 15, color: "#fff" }}>工程结构指标</h3>
      {uploadState === "success" && fes ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13, color: "#ccc" }}>
          <div>款号 (SKU): <strong style={{ color: "#fff" }}>{fes.sku}</strong></div>
          <div>单位: <strong>{fes.units}</strong></div>
          <div>组件数量: <strong>{fes.components.length}</strong></div>
          <div>外形宽度 (X): <strong>{fes.overall.width} mm</strong></div>
          <div>外形深度 (Y): <strong>{fes.overall.depth} mm</strong></div>
          <div>外形高度 (Z): <strong>{fes.overall.height} mm</strong></div>
          <hr style={{ borderColor: "#2a2a35", width: "100%", margin: "8px 0" }} />
          {selectedComponentId ? (
            <div style={{ background: "#222228", padding: 10, borderRadius: 6, border: "1px solid #ffb300" }}>
              <div style={{ fontWeight: "bold", color: "#ffe082" }}>选定部件: {selectedComponentId}</div>
              {(() => {
                const comp = fes.components.find((x) => x.id === selectedComponentId);
                if (!comp) return null;
                return (
                  <div style={{ fontSize: 12, marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div>名称: {comp.name}</div>
                    <div>类型: {comp.type}</div>
                    <div>尺寸: {comp.size.x} × {comp.size.y} × {comp.size.z} mm</div>
                    <div>基准位置: [{comp.position.x}, {comp.position.y}, {comp.position.z}]</div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#888" }}>在 CAD 或 3D 中点击部件可查看具体属性。</div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "#777" }}>暂无工程数据</div>
      )}
    </aside>
  );
}
