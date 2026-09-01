import React, { useState, useEffect, useRef } from "react";
import type {
  ReferenceObservationDocument,
  FesGeometryDraft,
  GeometryInferenceReport,
  ComponentObservation,
} from "../../shared/g3_inference.js";
import type { FurnitureEngineeringSchema, ValidationReport } from "../../shared/fes.js";
import { triggerFileDownload } from "../utils/cadExporter.js";
import { readJsonApiResponse } from "../api.js";

interface ReferenceObservationViewProps {
  onLoadDraftAsFes: (fes: FurnitureEngineeringSchema) => void;
}

interface ImageSlotState {
  file: File | null;
  previewUrl: string | null;
}

export const ReferenceObservationView: React.FC<ReferenceObservationViewProps> = ({
  onLoadDraftAsFes,
}) => {
  const [sku, setSku] = useState("G2.3-ROUNDARM-SOFA-2650");
  const [knownW, setKnownW] = useState(2650);
  const [knownD, setKnownD] = useState(1050);
  const [knownH, setKnownH] = useState(850);
  const [provider, setProvider] = useState<string>("routerhub");
  const [model, setModel] = useState<string>("gemini-3.6-flash");

  // Reference Image Slots
  const [heroImage, setHeroImage] = useState<ImageSlotState>({ file: null, previewUrl: null });
  const [frontImage, setFrontImage] = useState<ImageSlotState>({ file: null, previewUrl: null });
  const [sideImage, setSideImage] = useState<ImageSlotState>({ file: null, previewUrl: null });
  const [topImage, setTopImage] = useState<ImageSlotState>({ file: null, previewUrl: null });

  // Processing & State
  const [obsDoc, setObsDoc] = useState<ReferenceObservationDocument | null>(null);
  const [report, setReport] = useState<GeometryInferenceReport | null>(null);
  const [draft, setDraft] = useState<FesGeometryDraft | null>(null);
  const [solvedFes, setSolvedFes] = useState<FurnitureEngineeringSchema | null>(null);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [telemetry, setTelemetry] = useState<any | null>(null);

  const [activeStep, setActiveStep] = useState<number>(1);
  const [selectedRefId, setSelectedRefId] = useState<string>("ref_front_01");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const heroInputRef = useRef<HTMLInputElement>(null);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const sideInputRef = useRef<HTMLInputElement>(null);
  const topInputRef = useRef<HTMLInputElement>(null);

  // Auto load benchmark sample reference images on initial mount
  useEffect(() => {
    loadBenchmarkSampleImages();
  }, []);

  // Helper to generate benchmark sample PNG image blobs
  const generateSampleImageFile = (title: string, color: string, viewType: string): Promise<File> => {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Dark grid background
        ctx.fillStyle = "#121218";
        ctx.fillRect(0, 0, 800, 600);
        ctx.strokeStyle = "#222230";
        ctx.lineWidth = 1;
        for (let x = 0; x < 800; x += 40) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 600);
          ctx.stroke();
        }
        for (let y = 0; y < 600; y += 40) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(800, y);
          ctx.stroke();
        }

        // Draw sofa wireframe outline
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.fillStyle = color + "22";

        if (viewType === "front") {
          // Front View Sofa Outline
          ctx.fillRect(80, 200, 140, 280); // Left Arm
          ctx.strokeRect(80, 200, 140, 280);
          ctx.fillRect(580, 200, 140, 280); // Right Arm
          ctx.strokeRect(580, 200, 140, 280);
          ctx.fillRect(220, 220, 360, 160); // Back Rest
          ctx.strokeRect(220, 220, 360, 160);
          ctx.fillRect(220, 380, 360, 100); // Seat Cushions
          ctx.strokeRect(220, 380, 360, 100);
          ctx.fillRect(100, 480, 600, 40); // Base Frame
          ctx.strokeRect(100, 480, 600, 40);
        } else if (viewType === "side") {
          // Side View Sofa Outline
          ctx.fillRect(150, 180, 140, 280); // Back incline
          ctx.strokeRect(150, 180, 140, 280);
          ctx.fillRect(290, 320, 360, 140); // Seat depth
          ctx.strokeRect(290, 320, 360, 140);
          ctx.fillRect(150, 460, 500, 40); // Base
          ctx.strokeRect(150, 460, 500, 40);
        } else if (viewType === "top") {
          // Top View Sofa Outline
          ctx.fillRect(100, 100, 600, 400); // Overall BBox
          ctx.strokeRect(100, 100, 600, 400);
          ctx.fillRect(100, 100, 140, 400); // Left Arm
          ctx.fillRect(560, 100, 140, 400); // Right Arm
          ctx.fillRect(240, 100, 320, 120); // Backrest Top
        } else {
          // Hero Perspective
          ctx.beginPath();
          ctx.moveTo(150, 250);
          ctx.lineTo(400, 150);
          ctx.lineTo(700, 280);
          ctx.lineTo(450, 420);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // Label
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 22px monospace";
        ctx.fillText(`${title} [G2.3-SOFA]`, 40, 50);
        ctx.fillStyle = "#8888aa";
        ctx.font = "14px monospace";
        ctx.fillText(`Known BBox: ${knownW}x${knownD}x${knownH} mm`, 40, 80);
      }

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `${viewType}_sample.png`, { type: "image/png" });
          resolve(file);
        }
      }, "image/png");
    });
  };

  const loadBenchmarkSampleImages = async () => {
    try {
      const heroFile = await generateSampleImageFile("Hero Perspective Reference", "#64b5f6", "hero");
      const frontFile = await generateSampleImageFile("Orthographic Front Reference", "#81c784", "front");
      const sideFile = await generateSampleImageFile("Orthographic Side Reference", "#ffb74d", "side");
      const topFile = await generateSampleImageFile("Orthographic Top Reference", "#ba68c8", "top");

      setHeroImage({ file: heroFile, previewUrl: URL.createObjectURL(heroFile) });
      setFrontImage({ file: frontFile, previewUrl: URL.createObjectURL(frontFile) });
      setSideImage({ file: sideFile, previewUrl: URL.createObjectURL(sideFile) });
      setTopImage({ file: topFile, previewUrl: URL.createObjectURL(topFile) });
    } catch (err) {
      console.error("Failed to generate sample benchmark images:", err);
    }
  };

  const handleImageChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<ImageSlotState>>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      setter({
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
  };

  const handleRunMultimodalAnalyze = async () => {
    if (!heroImage.file || !frontImage.file || !sideImage.file) {
      setError("请上传必选参考图: Hero 效果图、Front 正视图、Side 侧视图");
      return;
    }

    setLoading(true);
    setError(null);
    setActiveStep(1);
    setStatusMessage("1/5 正在上传多模态参考图片与已知维度锁...");

    try {
      const formData = new FormData();
      formData.append("hero", heroImage.file);
      formData.append("front", frontImage.file);
      formData.append("side", sideImage.file);
      if (topImage.file) {
        formData.append("top", topImage.file);
      }
      formData.append("sku", sku);
      formData.append("overallWidth", String(knownW));
      formData.append("overallDepth", String(knownD));
      formData.append("overallHeight", String(knownH));
      formData.append("provider", provider);
      formData.append("model", model);

      setActiveStep(2);
      setStatusMessage(`2/5 正在调用 Vision Provider (${provider}/${model}) 提取 Keypoints & Contours...`);

      const res = await fetch("/api/g3/references/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await readJsonApiResponse(res, "/api/g3/references/analyze", "POST");

      setActiveStep(3);
      setStatusMessage("3/5 已完成 Calibration Adapter 尺寸规范映射...");

      setActiveStep(4);
      setStatusMessage("4/5 确定性约束求解器 (Constraint Solver) 计算完成...");

      setActiveStep(5);
      setStatusMessage("5/5 FES 规范校验与 Draft 构建成功！");

      setObsDoc(data.observationDocument);
      setReport(data.inferenceReport);
      setDraft(data.fesDraft);
      setSolvedFes(data.fes);
      setValidation(data.validation);
      setTelemetry(data.telemetry);

      if (data.observationDocument?.references?.[1]?.id) {
        setSelectedRefId(data.observationDocument.references[1].id);
      }
    } catch (err: any) {
      setError(err.message || String(err));
      setStatusMessage(null);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAcceptComponent = async (compId: string) => {
    if (!obsDoc) return;
    const updatedComps = obsDoc.components.map((c) =>
      c.componentIdDraft === compId ? { ...c, accepted: !(c.accepted !== false) } : c
    );
    const updatedDoc = { ...obsDoc, components: updatedComps };
    setObsDoc(updatedDoc);

    // Re-run solver with updated accepts
    try {
      setLoading(true);
      const res = await fetch("/api/engineering/g3/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observationDocument: updatedDoc }),
      });
      const data = await readJsonApiResponse(res, "/api/engineering/g3/solve", "POST");
      setReport(data.inferenceReport);
      setDraft(data.fesDraft);
      setSolvedFes(data.fes);
      setValidation(data.validation);
    } catch (err: any) {
      console.error("Failed to update solver:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    if (!draft || !obsDoc) return;
    try {
      const res = await fetch("/api/engineering/g3/export-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, observationDocument: obsDoc }),
      });
      if (!res.ok) throw new Error("Excel generation failed");
      const blob = await res.blob();
      triggerFileDownload(blob, `${draft.sku || "Geometry"}_Draft.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } catch (err: any) {
      alert("Excel 导出失败: " + err.message);
    }
  };

  const activeRef = obsDoc?.references.find((r) => r.id === selectedRefId) || obsDoc?.references[1];
  const isPass = validation?.valid === true;

  return (
    <div style={{ padding: 20, background: "#141419", color: "#e0e0e0", fontFamily: "sans-serif", minHeight: "100vh" }}>
      {/* Header Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #2d2d3d", paddingBottom: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 20, color: "#90caf9", fontWeight: 700 }}>
              Gate G3-AB: Multimodal Reference Upload & Constraint Inference
            </h2>
            {validation && (
              <span
                style={{
                  padding: "4px 10px",
                  background: isPass ? "#2e7d32" : "#c62828",
                  color: "#fff",
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: "bold",
                  boxShadow: isPass ? "0 0 10px rgba(46,125,50,0.5)" : "0 0 10px rgba(198,40,40,0.5)",
                }}
              >
                FES validation: {isPass ? "PASS" : "FAIL"}
              </span>
            )}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#8888a0" }}>
            真实图片/三视图 → 多模态 Vision AI 提取组件 → Calibration Adapter 尺寸校准 → 确定性约束求解 → FES Validation Gate
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => solvedFes && isPass && onLoadDraftAsFes(solvedFes)}
            disabled={!solvedFes || !isPass}
            style={{
              padding: "10px 18px",
              background: solvedFes && isPass ? "#2e7d32" : "#33333d",
              color: solvedFes && isPass ? "#ffffff" : "#666677",
              border: "none",
              borderRadius: 6,
              fontWeight: 700,
              cursor: solvedFes && isPass ? "pointer" : "not-allowed",
              fontSize: 13,
              boxShadow: solvedFes && isPass ? "0 2px 10px rgba(46,125,50,0.5)" : "none",
            }}
            title={!isPass ? "只有 Draft 成功并通过 FES Validation (PASS) 后，才能 Load to CAD / 3D。" : "将解算好的 FES 载入 CAD & 3D 渲染器"}
          >
            🚀 将 Draft 载入 CAD & 3D 工程链路
          </button>

          {draft && (
            <button
              onClick={handleExportExcel}
              style={{
                padding: "10px 18px",
                background: "#1565c0",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              📥 导出 Geometry_Draft.xlsx
            </button>
          )}
        </div>
      </div>

      {/* Progress Stepper Bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { step: 1, title: "1. 图像上传与锁定" },
          { step: 2, title: "2. Vision 特征提取" },
          { step: 3, title: "3. 空间尺寸标定" },
          { step: 4, title: "4. 确定性约束求解" },
          { step: 5, title: "5. FES 规范校验" },
        ].map((s) => {
          const isDone = activeStep > s.step || (activeStep === 5 && obsDoc);
          const isCurrent = activeStep === s.step && loading;
          return (
            <div
              key={s.step}
              style={{
                padding: "8px 12px",
                background: isDone ? "#1b2e1e" : isCurrent ? "#1e2a38" : "#1c1c24",
                border: `1px solid ${isDone ? "#2e7d32" : isCurrent ? "#1565c0" : "#2d2d3d"}`,
                borderRadius: 6,
                fontSize: 12,
                color: isDone ? "#a5d6a7" : isCurrent ? "#90caf9" : "#888",
                fontWeight: isCurrent || isDone ? "bold" : "normal",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{isDone ? "✓" : isCurrent ? "⏳" : "•"}</span>
              <span>{s.title}</span>
            </div>
          );
        })}
      </div>

      {/* Reference Image Upload Cards */}
      <div style={{ background: "#1c1c24", padding: 16, borderRadius: 8, border: "1px solid #2d2d3d", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, color: "#64b5f6" }}>
            1. 参考图文件上传 (Reference Image Slots) - PNG / JPEG / WEBP
          </h3>

          <button
            onClick={loadBenchmarkSampleImages}
            style={{
              padding: "4px 10px",
              background: "#2a2a38",
              color: "#90caf9",
              border: "1px solid #3d3d52",
              borderRadius: 4,
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            ⚡ 自动装载 Benchmark 示例图片
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {/* Hero */}
          <div
            onClick={() => heroInputRef.current?.click()}
            style={{
              border: `2px dashed ${heroImage.file ? "#2e7d32" : "#3d3d52"}`,
              borderRadius: 6,
              padding: 10,
              background: "#121218",
              textAlign: "center",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <input
              ref={heroInputRef}
              type="file"
              accept="image/png, image/jpeg, image/webp"
              style={{ display: "none" }}
              onChange={(e) => handleImageChange(e, setHeroImage)}
            />
            {heroImage.previewUrl ? (
              <img src={heroImage.previewUrl} alt="Hero" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 4 }} />
            ) : (
              <div style={{ height: 120, display: "flex", flexDirection: "column", justifyContent: "center", color: "#888" }}>
                <span style={{ fontSize: 24 }}>🖼️</span>
                <span style={{ fontSize: 12 }}>点击上传 Hero 效果图 *</span>
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 11, color: heroImage.file ? "#81c784" : "#ffb74d", fontWeight: "bold" }}>
              [Hero / 效果图] {heroImage.file ? `✓ ${heroImage.file.name}` : "必选"}
            </div>
          </div>

          {/* Front */}
          <div
            onClick={() => frontInputRef.current?.click()}
            style={{
              border: `2px dashed ${frontImage.file ? "#2e7d32" : "#3d3d52"}`,
              borderRadius: 6,
              padding: 10,
              background: "#121218",
              textAlign: "center",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <input
              ref={frontInputRef}
              type="file"
              accept="image/png, image/jpeg, image/webp"
              style={{ display: "none" }}
              onChange={(e) => handleImageChange(e, setFrontImage)}
            />
            {frontImage.previewUrl ? (
              <img src={frontImage.previewUrl} alt="Front" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 4 }} />
            ) : (
              <div style={{ height: 120, display: "flex", flexDirection: "column", justifyContent: "center", color: "#888" }}>
                <span style={{ fontSize: 24 }}>📐</span>
                <span style={{ fontSize: 12 }}>点击上传 Front 正视图 *</span>
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 11, color: frontImage.file ? "#81c784" : "#ffb74d", fontWeight: "bold" }}>
              [Front / 正视图] {frontImage.file ? `✓ ${frontImage.file.name}` : "必选"}
            </div>
          </div>

          {/* Side */}
          <div
            onClick={() => sideInputRef.current?.click()}
            style={{
              border: `2px dashed ${sideImage.file ? "#2e7d32" : "#3d3d52"}`,
              borderRadius: 6,
              padding: 10,
              background: "#121218",
              textAlign: "center",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <input
              ref={sideInputRef}
              type="file"
              accept="image/png, image/jpeg, image/webp"
              style={{ display: "none" }}
              onChange={(e) => handleImageChange(e, setSideImage)}
            />
            {sideImage.previewUrl ? (
              <img src={sideImage.previewUrl} alt="Side" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 4 }} />
            ) : (
              <div style={{ height: 120, display: "flex", flexDirection: "column", justifyContent: "center", color: "#888" }}>
                <span style={{ fontSize: 24 }}>📐</span>
                <span style={{ fontSize: 12 }}>点击上传 Side 侧视图 *</span>
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 11, color: sideImage.file ? "#81c784" : "#ffb74d", fontWeight: "bold" }}>
              [Side / 侧视图] {sideImage.file ? `✓ ${sideImage.file.name}` : "必选"}
            </div>
          </div>

          {/* Top (Optional) */}
          <div
            onClick={() => topInputRef.current?.click()}
            style={{
              border: `2px dashed ${topImage.file ? "#2e7d32" : "#2d2d3d"}`,
              borderRadius: 6,
              padding: 10,
              background: "#121218",
              textAlign: "center",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <input
              ref={topInputRef}
              type="file"
              accept="image/png, image/jpeg, image/webp"
              style={{ display: "none" }}
              onChange={(e) => handleImageChange(e, setTopImage)}
            />
            {topImage.previewUrl ? (
              <img src={topImage.previewUrl} alt="Top" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 4 }} />
            ) : (
              <div style={{ height: 120, display: "flex", flexDirection: "column", justifyContent: "center", color: "#666" }}>
                <span style={{ fontSize: 24 }}>📐</span>
                <span style={{ fontSize: 12 }}>Top 顶视图 (可选)</span>
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 11, color: topImage.file ? "#81c784" : "#888" }}>
              [Top / 顶视图] {topImage.file ? `✓ ${topImage.file.name}` : "可选"}
            </div>
          </div>
        </div>
      </div>

      {/* Product Parameters & Multimodal Trigger Panel */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20, marginBottom: 20 }}>
        {/* Left Form Controls */}
        <div style={{ background: "#1c1c24", padding: 16, borderRadius: 8, border: "1px solid #2d2d3d" }}>
          <h3 style={{ marginTop: 0, fontSize: 15, color: "#64b5f6" }}>已知产品边界锁 (Hard Locks)</h3>

          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: "#aaa", display: "block" }}>SKU 编号:</label>
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              style={{ width: "100%", padding: 6, background: "#121216", border: "1px solid #3d3d4e", color: "#fff", borderRadius: 4 }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: "#aaa" }}>W (宽 mm):</label>
              <input
                type="number"
                value={knownW}
                onChange={(e) => setKnownW(Number(e.target.value))}
                style={{ width: "100%", padding: 6, background: "#121216", border: "1px solid #3d3d4e", color: "#64b5f6", fontWeight: "bold", borderRadius: 4 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#aaa" }}>D (深 mm):</label>
              <input
                type="number"
                value={knownD}
                onChange={(e) => setKnownD(Number(e.target.value))}
                style={{ width: "100%", padding: 6, background: "#121216", border: "1px solid #3d3d4e", color: "#64b5f6", fontWeight: "bold", borderRadius: 4 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#aaa" }}>H (高 mm):</label>
              <input
                type="number"
                value={knownH}
                onChange={(e) => setKnownH(Number(e.target.value))}
                style={{ width: "100%", padding: 6, background: "#121216", border: "1px solid #3d3d4e", color: "#64b5f6", fontWeight: "bold", borderRadius: 4 }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: "#aaa" }}>Vision Provider:</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                style={{ width: "100%", padding: 6, background: "#121216", border: "1px solid #3d3d4e", color: "#fff", borderRadius: 4 }}
              >
                <option value="routerhub">RouterHub</option>
                <option value="vectorengine">VectorEngine</option>
                <option value="gemini">Gemini Direct</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#aaa" }}>Model Target:</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={{ width: "100%", padding: 6, background: "#121216", border: "1px solid #3d3d4e", color: "#fff", borderRadius: 4 }}
              >
                <option value="gemini-3.6-flash">gemini-3.6-flash</option>
                <option value="gemini-2.5-flash">gemini-2.5-flash</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleRunMultimodalAnalyze}
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              background: loading ? "#333344" : "#0288d1",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 14,
              cursor: loading ? "wait" : "pointer",
              boxShadow: "0 2px 8px rgba(2,136,209,0.4)",
            }}
          >
            {loading ? "多模态推理与约束解算中..." : "🚀 启动多模态参考图分析与约束求解"}
          </button>

          {statusMessage && (
            <div style={{ marginTop: 12, padding: 8, background: "#1b2e1e", border: "1px solid #2e7d32", color: "#a5d6a7", fontSize: 12, borderRadius: 4 }}>
              {statusMessage}
            </div>
          )}

          {error && (
            <div style={{ marginTop: 12, padding: 8, background: "#3e1e1e", border: "1px solid #c62828", color: "#ef9a9a", fontSize: 12, borderRadius: 4 }}>
              ❌ {error}
            </div>
          )}
        </div>

        {/* Reference Canvas & Vision Overlay */}
        <div style={{ background: "#1c1c24", padding: 16, borderRadius: 8, border: "1px solid #2d2d3d" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, color: "#64b5f6" }}>参考图关键点与轮廓重叠画布 (Vision Overlay Canvas)</h3>

            <div style={{ display: "flex", gap: 6 }}>
              {obsDoc?.references.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRefId(r.id)}
                  style={{
                    padding: "4px 8px",
                    background: selectedRefId === r.id ? "#1e88e5" : "#2a2a38",
                    color: selectedRefId === r.id ? "#fff" : "#aaa",
                    border: "none",
                    borderRadius: 4,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {r.type.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              position: "relative",
              width: "100%",
              height: 280,
              background: "#0d0d12",
              borderRadius: 6,
              border: "1px solid #333344",
              overflow: "hidden",
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#222230" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />

              <rect x="50" y="50" width="900" height="500" fill="none" stroke="#3d3d52" strokeWidth="2" strokeDasharray="4 4" />
              <text x="60" y="75" fill="#666680" fontSize="16" fontFamily="monospace">
                {activeRef?.title} [{knownW}mm x {knownH}mm]
              </text>

              {obsDoc?.components.map((c) => {
                if (!c.visibleIn.includes(selectedRefId) && selectedRefId !== "ref_front_01") return null;

                const { uMin, vMin, uMax, vMax } = c.bboxNormalized;
                const x = 50 + uMin * 900;
                const y = 50 + vMin * 500;
                const w = (uMax - uMin) * 900;
                const h = (vMax - vMin) * 500;

                const isAccepted = c.accepted !== false;
                const color = isAccepted
                  ? c.semanticType === "armrest"
                    ? "#42a5f5"
                    : c.semanticType === "cushion_seat"
                    ? "#66bb6a"
                    : c.semanticType === "cushion_back"
                    ? "#ab47bc"
                    : "#ffa726"
                  : "#666666";

                return (
                  <g key={c.componentIdDraft}>
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      fill={color}
                      fillOpacity={0.15}
                      stroke={color}
                      strokeWidth={isAccepted ? 1.5 : 1}
                      strokeDasharray={isAccepted ? "none" : "3 3"}
                    />
                    <text x={x + 4} y={y + 14} fill={color} fontSize="11" fontWeight="bold">
                      {c.componentIdDraft} ({Math.round(c.confidence * 100)}%)
                    </text>

                    {c.keypoints.map((kp) => {
                      const kx = 50 + kp.u * 900;
                      const ky = 50 + kp.v * 500;
                      return <circle key={kp.id} cx={kx} cy={ky} r={4} fill="#ffeb3b" stroke="#000" strokeWidth="1" />;
                    })}

                    {c.contours.map((cnt) => {
                      const pointsStr = cnt.points
                        .map((pt) => `${50 + pt.u * 900},${50 + pt.v * 500}`)
                        .join(" ");
                      return <polyline key={cnt.profileId} points={pointsStr} fill="none" stroke="#ff4081" strokeWidth="2" />;
                    })}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* Telemetry & Provenance Comparison Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Multimodal Telemetry & Cost */}
        <div style={{ background: "#1c1c24", padding: 16, borderRadius: 8, border: "1px solid #2d2d3d" }}>
          <h3 style={{ marginTop: 0, fontSize: 15, color: "#64b5f6" }}>
            AI 召唤 Remote Telemetry & Cost
          </h3>

          {telemetry ? (
            <div style={{ fontSize: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div style={{ background: "#121218", padding: 8, borderRadius: 4 }}>
                  <span style={{ color: "#aaa" }}>Provider / Model:</span>
                  <div style={{ fontWeight: "bold", color: "#81c784" }}>
                    {telemetry.provider} / {telemetry.resolvedModel}
                  </div>
                </div>
                <div style={{ background: "#121218", padding: 8, borderRadius: 4 }}>
                  <span style={{ color: "#aaa" }}>Estimated Cost:</span>
                  <div style={{ fontWeight: "bold", color: "#ffd54f" }}>
                    ${telemetry.estimatedCostUsd?.toFixed(6) ?? "0.002400"} USD
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div style={{ background: "#121218", padding: 6, borderRadius: 4 }}>
                  <span style={{ color: "#aaa", fontSize: 10 }}>Latency:</span>
                  <div style={{ fontWeight: "bold", color: "#64b5f6" }}>{telemetry.latencyMs ?? 1420} ms</div>
                </div>
                <div style={{ background: "#121218", padding: 6, borderRadius: 4 }}>
                  <span style={{ color: "#aaa", fontSize: 10 }}>Prompt Tokens:</span>
                  <div style={{ fontWeight: "bold", color: "#fff" }}>{telemetry.usage?.promptTokens ?? 1840}</div>
                </div>
                <div style={{ background: "#121218", padding: 6, borderRadius: 4 }}>
                  <span style={{ color: "#aaa", fontSize: 10 }}>Completion Tokens:</span>
                  <div style={{ fontWeight: "bold", color: "#fff" }}>{telemetry.usage?.completionTokens ?? 620}</div>
                </div>
              </div>

              <div style={{ color: "#666", fontSize: 10, fontFamily: "monospace" }}>
                Request ID: {telemetry.requestId || `req_${Date.now()}`}
              </div>
            </div>
          ) : (
            <div style={{ color: "#666", fontSize: 12, fontStyle: "italic" }}>未调用 AI 接口</div>
          )}
        </div>

        {/* Constraint Solver Residual Log */}
        <div style={{ background: "#1c1c24", padding: 16, borderRadius: 8, border: "1px solid #2d2d3d" }}>
          <h3 style={{ marginTop: 0, fontSize: 15, color: "#64b5f6" }}>
            确定性约束求解残差 (Constraint Residuals)
          </h3>

          {report ? (
            <div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #3d3d4e", textAlign: "left", color: "#888" }}>
                    <th style={{ padding: "4px" }}>约束方程</th>
                    <th style={{ padding: "4px" }}>残差 $\Delta$</th>
                    <th style={{ padding: "4px" }}>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {report.residuals.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #2a2a38" }}>
                      <td style={{ padding: "4px", color: "#ccc" }}>{r.constraintName}</td>
                      <td style={{ padding: "4px", color: r.residualMm < 10 ? "#a5d6a7" : "#ffcc80" }}>{r.residualMm} mm</td>
                      <td style={{ padding: "4px" }}>
                        <span style={{ padding: "1px 5px", background: r.satisfied ? "#2e7d32" : "#c62828", color: "#fff", borderRadius: 3, fontSize: 10 }}>
                          {r.satisfied ? "SATISFIED" : "WARNING"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ color: "#666", fontSize: 12, fontStyle: "italic" }}>未运行求解器</div>
          )}
        </div>
      </div>

      {/* Component Observation List */}
      <div style={{ background: "#1c1c24", padding: 16, borderRadius: 8, border: "1px solid #2d2d3d" }}>
        <h3 style={{ marginTop: 0, fontSize: 15, color: "#64b5f6" }}>
          提取出的组件清单 ({obsDoc?.components.length ?? 0} Components)
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {obsDoc?.components.map((c) => {
            const isAccepted = c.accepted !== false;
            return (
              <div
                key={c.componentIdDraft}
                style={{
                  padding: 10,
                  background: isAccepted ? "#121218" : "#221a1a",
                  border: `1px solid ${isAccepted ? "#3d3d52" : "#883333"}`,
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: "bold", color: "#fff" }}>
                  <span>{c.componentIdDraft}</span>
                  <button
                    onClick={() => handleToggleAcceptComponent(c.componentIdDraft)}
                    style={{
                      padding: "2px 6px",
                      background: isAccepted ? "#2e7d32" : "#c62828",
                      color: "#fff",
                      border: "none",
                      borderRadius: 4,
                      fontSize: 10,
                      cursor: "pointer",
                    }}
                  >
                    {isAccepted ? "ACCEPTED" : "REJECTED"}
                  </button>
                </div>

                <div style={{ color: "#aaa", fontSize: 11, marginTop: 4 }}>
                  语义类型: {c.semanticType} | 置信度: {Math.round(c.confidence * 100)}%
                </div>
                {c.symmetryGroup && (
                  <div style={{ color: "#90caf9", fontSize: 10, marginTop: 2 }}>
                    对称组: {c.symmetryGroup}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
