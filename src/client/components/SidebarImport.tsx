import React from "react";
import type { FurnitureEngineeringData } from "../../shared/fes.js";
import type { UploadState } from "../hooks/useEngineeringData.js";

interface SidebarImportProps {
  uploadState: UploadState;
  fes: FurnitureEngineeringData | null;
  uploadError: string | null;
  retryAfterMs?: number | null;
  onRetryUpload?: () => void;
  isDragging: boolean;
  setIsDragging: (val: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onUploadFile: (file: File) => void;
  onLoadSample: (sampleName: string) => void;
  selectedComponentId: string | null;
  onSelectComponent: (id: string | null) => void;
}

export function SidebarImport({
  uploadState,
  fes,
  uploadError,
  retryAfterMs,
  onRetryUpload,
  isDragging,
  setIsDragging,
  fileInputRef,
  onUploadFile,
  onLoadSample,
  selectedComponentId,
  onSelectComponent,
}: SidebarImportProps) {
  const isUploading = uploadState === "uploading";

  return (
    <aside
      style={{
        padding: 14,
        borderRight: "1px solid #2d2d38",
        background: "#18181c",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 15, color: "#fff" }}>工程 Excel 导入</h3>

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!isUploading) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (isUploading) return;
          const f = e.dataTransfer.files?.[0];
          if (f) onUploadFile(f);
        }}
        onClick={() => {
          if (!isUploading) fileInputRef.current?.click();
        }}
        style={{
          border: `2px dashed ${isUploading ? "#ffb74d" : isDragging ? "#4fc3f7" : "#3d3d4e"}`,
          background: isUploading ? "#221d15" : isDragging ? "#1e2c38" : "#202026",
          borderRadius: 8,
          padding: "16px 12px",
          textAlign: "center",
          cursor: isUploading ? "not-allowed" : "pointer",
          opacity: isUploading ? 0.75 : 1,
          transition: "all 0.2s",
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 4 }}>{isUploading ? "⏳" : "📊"}</div>
        <div style={{ color: "#fff", fontWeight: "bold", fontSize: 13 }}>
          {isUploading ? "Parsing workbook..." : "拖拽 Excel 到此处上传"}
        </div>
        <div style={{ color: "#888", fontSize: 11, marginTop: 4 }}>
          {isUploading ? "请稍候，正验证解析与生成 CAD-IR..." : "或点击浏览 (.xlsx / .xls)"}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          disabled={isUploading}
          style={{ display: "none" }}
          onChange={(e) => {
            if (isUploading) return;
            const f = e.target.files?.[0];
            if (f) {
              onUploadFile(f);
              e.target.value = "";
            }
          }}
        />
      </div>

      {/* Error Banner */}
      {uploadError && (
        <div
          style={{
            background: "#3a1315",
            border: "1px solid #d32f2f",
            borderRadius: 6,
            padding: 10,
            color: "#ff8a80",
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: 2 }}>⚠️ 解析出现错误:</div>
          <div style={{ marginBottom: 6 }}>{uploadError}</div>
          {onRetryUpload && (
            <button
              onClick={onRetryUpload}
              disabled={isUploading}
              style={{
                marginBottom: 6,
                padding: "4px 8px",
                background: "#d32f2f",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                fontSize: 11,
                cursor: isUploading ? "not-allowed" : "pointer",
                fontWeight: "bold",
              }}
            >
              🔄 Retry Parse (重试解析)
            </button>
          )}
          <div style={{ fontSize: 11, color: "#ffcdd2", borderTop: "1px dashed rgba(255,255,255,0.2)", paddingTop: 6 }}>
            💡 解决建议：请在 Excel 或 WPS 中将文件重新【另存为】标准的 .xlsx 格式后上传；或点击下方预置按钮一键加载标准工程表。
          </div>
        </div>
      )}

      {/* Quick Load Preset Sample Workbooks */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
        <div style={{ fontSize: 11, color: "#888", fontWeight: "bold" }}>⚡ 快速测试预置工程表：</div>
        <button
          disabled={isUploading}
          onClick={() => !isUploading && onLoadSample("engineering_valid.xlsx")}
          style={{
            padding: "6px 10px",
            background: "#22222a",
            color: isUploading ? "#666" : "#4fc3f7",
            border: "1px solid #3d3d4e",
            borderRadius: 4,
            fontSize: 12,
            cursor: isUploading ? "not-allowed" : "pointer",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>🚀 智能功能沙发</span>
          <span style={{ fontSize: 10, opacity: 0.7 }}>DEMO-001</span>
        </button>
        <button
          disabled={isUploading}
          onClick={() => !isUploading && onLoadSample("valid.xlsx")}
          style={{
            padding: "6px 10px",
            background: "#22222a",
            color: isUploading ? "#666" : "#81c784",
            border: "1px solid #3d3d4e",
            borderRadius: 4,
            fontSize: 12,
            cursor: isUploading ? "not-allowed" : "pointer",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>✅ 标准构造椅</span>
          <span style={{ fontSize: 10, opacity: 0.7 }}>VALID</span>
        </button>
        <button
          disabled={isUploading}
          onClick={() => !isUploading && onLoadSample("out_of_bounds_x.xlsx")}
          style={{
            padding: "6px 10px",
            background: "#22222a",
            color: isUploading ? "#666" : "#ffb74d",
            border: "1px solid #3d3d4e",
            borderRadius: 4,
            fontSize: 12,
            cursor: isUploading ? "not-allowed" : "pointer",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>⚠️ 越界结构校验件</span>
          <span style={{ fontSize: 10, opacity: 0.7 }}>OOB-X</span>
        </button>
      </div>

      {uploadState === "success" && fes && (
        <>
          <div
            style={{
              padding: 10,
              background: "#222228",
              borderRadius: 6,
              border: "1px solid #2a2a35",
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: "bold", color: "#fff", fontSize: 13 }}>SKU: {fes.sku}</div>
            <div style={{ color: "#aaa", marginTop: 4 }}>
              Product Type: <strong>{fes.productType}</strong>
            </div>
            <div style={{ color: "#aaa", marginTop: 2 }}>
              Overall: {fes.overall.width} × {fes.overall.depth} × {fes.overall.height} {fes.units}
            </div>
          </div>

          <div style={{ fontWeight: "bold", fontSize: 13, color: "#aaa", marginTop: 8 }}>
            部件维度列表 ({fes.components.length})：
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {fes.components.map((c) => {
              const isSelected = selectedComponentId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => onSelectComponent(isSelected ? null : c.id)}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 4,
                    background: isSelected ? "#332a00" : "#222228",
                    border: `1px solid ${isSelected ? "#ffb300" : "#2d2d38"}`,
                    cursor: "pointer",
                    fontSize: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontWeight: "bold", color: isSelected ? "#ffe082" : "#fff" }}>{c.id}</span>
                  <span style={{ fontSize: 11, color: "#aaa" }}>{c.type}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
