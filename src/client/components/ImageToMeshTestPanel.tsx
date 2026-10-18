import React, { useState, useEffect, useRef } from "react";
import { FurnitureEngineering } from "../../shared/fes.js";

export interface ImageToMeshTestPanelProps {
  fes?: FurnitureEngineering | null;
  isActive?: boolean;
  onLoadGlbTo3d?: (glbUrl: string, artifact: any) => void;
  onRunAlignment?: (artifactId: string, partId: string, componentId: string) => void;
  onJobStatusChange?: (status: string | null) => void;
  onLoadSample?: (sampleName: string) => void;
}

const STORAGE_KEY = "fes_image_to_mesh_state_v1";

function loadPersistedMeshState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed to load persisted image to mesh state:", e);
    return null;
  }
}

function savePersistedMeshState(state: any) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    try {
      // If image base64 exceeds quota, drop it and keep the rest
      const shallow = { ...state, imagePreview: null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(shallow));
    } catch (e2) {
      console.warn("Failed to save image to mesh state:", e2);
    }
  }
}

export function ImageToMeshTestPanel({
  fes,
  isActive = true,
  onLoadGlbTo3d,
  onRunAlignment,
  onJobStatusChange,
  onLoadSample,
}: ImageToMeshTestPanelProps) {
  // Initialize from persisted storage if available
  const persisted = useRef(loadPersistedMeshState()).current;

  // Input fields
  const [partId, setPartId] = useState<string>(() => persisted?.partId || "part-arm-left");
  const [mappedComponentId, setMappedComponentId] = useState<string>(() => persisted?.mappedComponentId || "ARM-L-OUT");
  const [provider, setProvider] = useState<string>(() => persisted?.provider || "comfyui_hunyuan3d");
  const [preset, setPreset] = useState<string>(() => persisted?.preset || "hunyuan3d-v2.1-part-v1.api.json");
  const [seed, setSeed] = useState<number>(() => persisted?.seed ?? 42);
  const [imagePreview, setImagePreview] = useState<string | null>(() => persisted?.imagePreview || null);
  const [imageArtifactUrl, setImageArtifactUrl] = useState<string>(() => persisted?.imageArtifactUrl || "");
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Job state
  const [activeJob, setActiveJob] = useState<any | null>(() => persisted?.activeJob || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Local GLB Upload & Preview state
  const [customArtifactUri, setCustomArtifactUri] = useState<string | null>(() => persisted?.customArtifactUri || null);
  const [isUploadingLocalGlb, setIsUploadingLocalGlb] = useState(false);
  const [glbLoadError, setGlbLoadError] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const glbFileInputRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<any>(null);

  // Save changes to localStorage
  useEffect(() => {
    savePersistedMeshState({
      partId,
      mappedComponentId,
      provider,
      preset,
      seed,
      imagePreview,
      imageArtifactUrl,
      activeJob,
      customArtifactUri,
    });
  }, [
    partId,
    mappedComponentId,
    provider,
    preset,
    seed,
    imagePreview,
    imageArtifactUrl,
    activeJob,
    customArtifactUri,
  ]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Broadcast real-time job status to parent / header
  useEffect(() => {
    onJobStatusChange?.(activeJob?.status || null);
  }, [activeJob?.status, onJobStatusChange]);

  // Viewport-aware driver: when becoming active, immediately query active job status
  const prevActiveRef = useRef(isActive);
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      if (activeJob?.id) {
        fetch(`/api/worker/jobs/${encodeURIComponent(activeJob.id)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => {
            if (json?.success && json.data) {
              setActiveJob(json.data);
            }
          })
          .catch((err) => console.warn("Viewport activation sync failed:", err));
      }
      // Trigger canvas/viewport layout event
      window.dispatchEvent(new Event("resize"));
    }
    prevActiveRef.current = isActive;
  }, [isActive, activeJob?.id]);

  // Check persisted job status on initial mount
  useEffect(() => {
    if (persisted?.activeJob?.id) {
      fetch(`/api/worker/jobs/${encodeURIComponent(persisted.activeJob.id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json?.success && json.data) {
            setActiveJob(json.data);
          }
        })
        .catch((err) => console.warn("Initial persisted job check failed:", err));
    }
  }, []);

  // Poll job status when activeJob is queued, claimed, or running (continues in background)
  useEffect(() => {
    if (!activeJob || ["completed", "failed", "cancelled"].includes(activeJob.status)) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const startTime = new Date(activeJob.createdAt || Date.now()).getTime();

    // Start timer for elapsed time
    if (!timerRef.current) {
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTime);
      }, 100);
    }

    // Poll job status every 1 second (both active and background)
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/worker/jobs/${encodeURIComponent(activeJob.id)}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.data) {
          setActiveJob(json.data);
          if (["completed", "failed", "cancelled"].includes(json.data.status)) {
            clearInterval(pollInterval);
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
          }
        }
      } catch (err) {
        console.warn("Poll job error:", err);
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [activeJob?.id, activeJob?.status]);

  const [uploadedArtifact, setUploadedArtifact] = useState<any | null>(null);

  // Handle local image file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setImagePreview(base64);

      try {
        const res = await fetch("/api/worker/artifacts/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileData: base64,
            workspaceId: "default-ws",
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.success && (json.artifact || json.url)) {
          const canonical = json.artifact || {
            id: json.artifactId || `art-img-${Date.now()}`,
            workspaceId: "default-ws",
            kind: "reference_image",
            format: "png",
            mimeType: "image/png",
            downloadUrl: json.downloadUrl || json.url,
            originalName: file.name,
            bytes: json.fileBytes || 0,
            productionTruth: false,
          };
          setUploadedArtifact(canonical);
          setImageArtifactUrl(canonical.downloadUrl);
        } else {
          throw new Error(json.error?.message || "Failed to upload image");
        }
      } catch (err: any) {
        setErrorMsg(`Image upload failed: ${err.message}`);
      } finally {
        setIsUploadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Load sample furniture reference image (rendered to PNG canvas for valid magic bytes)
  const handleLoadSampleImage = async () => {
    setIsUploadingImage(true);
    setErrorMsg(null);

    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#1e1e24";
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "#0288d1";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(40, 40, 176, 176, 16) : ctx.rect(40, 40, 176, 176);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("SOFA ARM REF", 128, 134);
    }

    const pngBase64 = canvas.toDataURL("image/png");
    setImagePreview(pngBase64);

    try {
      const res = await fetch("/api/worker/artifacts/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: "sample_sofa_arm.png",
          fileData: pngBase64,
          workspaceId: "default-ws",
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && (json.artifact || json.url)) {
        const canonical = json.artifact || {
          id: json.artifactId || `art-img-${Date.now()}`,
          workspaceId: "default-ws",
          kind: "reference_image",
          format: "png",
          mimeType: "image/png",
          downloadUrl: json.downloadUrl || json.url,
          originalName: "sample_sofa_arm.png",
          bytes: json.fileBytes || 0,
          productionTruth: false,
        };
        setUploadedArtifact(canonical);
        setImageArtifactUrl(canonical.downloadUrl);
      }
    } catch (err: any) {
      setErrorMsg(`Sample image upload failed: ${err.message}`);
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Submit Image-to-Mesh Job
  const handleGenerateMesh = async () => {
    if (!imageArtifactUrl && !imagePreview && !uploadedArtifact) {
      setErrorMsg("Please select or upload a reference image first");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setActiveJob(null);
    setElapsedMs(0);

    const imageUrlToUse = imageArtifactUrl || imagePreview;
    const inputArtifactToUse = uploadedArtifact || {
      id: `art-ref-${Date.now()}`,
      workspaceId: "default-ws",
      kind: "reference_image",
      format: "png",
      mimeType: "image/png",
      downloadUrl: imageUrlToUse,
      uri: imageUrlToUse,
      originalName: "reference_image.png",
      bytes: 1024,
      productionTruth: false,
    };

    try {
      const res = await fetch("/api/worker/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "default-ws",
          capabilityId: "image_to_mesh",
          provider,
          inputPayload: {
            sku: "DEMO-SOFA-01",
            partId,
            imageUri: inputArtifactToUse.downloadUrl || imageUrlToUse,
            inputImageUrl: inputArtifactToUse.downloadUrl || imageUrlToUse,
            inputArtifacts: [inputArtifactToUse],
            preset,
            seed: Number(seed),
          },
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error?.message || `HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json.success && json.data) {
        setActiveJob(json.data);
      } else {
        throw new Error("Job creation failed");
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetSession = () => {
    if (window.confirm("确定要重置当前网格生成会话与输入信息吗？")) {
      setActiveJob(null);
      setImagePreview(null);
      setImageArtifactUrl("");
      setUploadedArtifact(null);
      setCustomArtifactUri(null);
      setGlbLoadError(null);
      setErrorMsg(null);
      setElapsedMs(0);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    }
  };

  const outputArtifact = activeJob?.outputArtifacts?.[0];

  return (
    <div
      style={{
        padding: 20,
        background: "#16161a",
        border: "1px solid #2d2d38",
        borderRadius: 8,
        color: "#e0e0e0",
        fontFamily: "sans-serif",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          paddingBottom: 10,
          borderBottom: "1px solid #2a2a35",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ margin: 0, color: "#fff", fontSize: 16 }}>
              真实图片 → 本地网格生成管线 (G4-3)
            </h3>
            {isActive ? (
              <span
                title="DOM 级持久驻留与视口感知容器已生效，切换节点/标签不丢失状态与任务"
                style={{
                  fontSize: 10,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "rgba(76, 175, 80, 0.2)",
                  color: "#81c784",
                  border: "1px solid #4caf50",
                  fontWeight: "bold",
                }}
              >
                ● 视口: 活跃 (DOM 驻留)
              </span>
            ) : (
              <span
                title="组件在后台持久驻留中，任务和轮询保持运行"
                style={{
                  fontSize: 10,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "rgba(255, 152, 0, 0.2)",
                  color: "#ffb74d",
                  border: "1px solid #ff9800",
                  fontWeight: "bold",
                }}
              >
                ⏳ 视口: 后台守护
              </span>
            )}
          </div>
          <span style={{ fontSize: 12, color: "#aaa" }}>
            本地 Worker + ComfyUI + Hunyuan3D 混元三维 v2.1
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={handleResetSession}
            title="重置当前面板会话与缓存数据"
            style={{
              fontSize: 11,
              padding: "4px 8px",
              background: "#2a2a35",
              color: "#bbb",
              border: "1px solid #3d3d4e",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            ↺ 重置会话
          </button>
          <span
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 4,
              background: "rgba(79, 195, 247, 0.15)",
              color: "#4fc3f7",
              border: "1px solid #4fc3f7",
              fontWeight: "bold",
            }}
          >
            生产真值 productionTruth: 否 (AI参考)
          </span>
        </div>
      </div>

      {activeJob?.status === "completed" && outputArtifact && (
        <div
          style={{
            marginBottom: 14,
            padding: "8px 12px",
            background: "rgba(46, 125, 50, 0.2)",
            border: "1px solid #2e7d32",
            borderRadius: 6,
            color: "#a5d6a7",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>
            ✓ <strong>网格生成已就绪！</strong> 数据与模型在切换节点期间全程 DOM 驻留保持。
          </span>
          <span style={{ fontSize: 11, color: "#81c784" }}>
            任务: {activeJob.id?.slice(0, 16)}...
          </span>
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 14px",
            background: "rgba(244, 67, 54, 0.15)",
            border: "1px solid #f44336",
            borderRadius: 6,
            color: "#ff8a80",
            fontSize: 13,
          }}
        >
          <strong>错误:</strong> {errorMsg}
        </div>
      )}

      {/* Form Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Left Column: Reference Image */}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: "bold", color: "#aaa", marginBottom: 6 }}>
            1. 部件参考图 (Reference Image) *
          </label>
          <div
            style={{
              height: 140,
              background: "#1c1c24",
              border: "2px dashed #3d3d4e",
              borderRadius: 6,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              position: "relative",
              overflow: "hidden",
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="参考部件"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <div style={{ textAlign: "center", color: "#888", fontSize: 12, padding: 10 }}>
                {isUploadingImage ? (
                  <span>正在上传图片至服务器...</span>
                ) : (
                  <>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>📷</div>
                    点击选择参考图片上传
                  </>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={handleLoadSampleImage}
              disabled={isUploadingImage}
              style={{
                flex: 1,
                padding: "6px 10px",
                background: "#2a2a35",
                color: "#ccc",
                border: "1px solid #3d3d4e",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              使用示例图片
            </button>
            {imageArtifactUrl && (
              <span style={{ fontSize: 11, color: "#81c784", alignSelf: "center", wordBreak: "break-all" }}>
                ✓ 图像产物已就绪
              </span>
            )}
          </div>
        </div>

        {/* Right Column: Parameters */}
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#aaa", marginBottom: 4 }}>
              部件标识 (Part ID)
            </label>
            <input
              type="text"
              value={partId}
              onChange={(e) => setPartId(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 10px",
                background: "#1c1c24",
                border: "1px solid #3d3d4e",
                borderRadius: 4,
                color: "#fff",
                fontSize: 13,
              }}
              placeholder="例如: part-arm-left"
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, color: "#aaa", marginBottom: 4 }}>
              推理引擎 (Provider)
            </label>
            <input
              type="text"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 10px",
                background: "#1c1c24",
                border: "1px solid #3d3d4e",
                borderRadius: 4,
                color: "#fff",
                fontSize: 13,
              }}
              readOnly
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, color: "#aaa", marginBottom: 4 }}>
              工作流预设 (Preset)
            </label>
            <input
              type="text"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 10px",
                background: "#1c1c24",
                border: "1px solid #3d3d4e",
                borderRadius: 4,
                color: "#fff",
                fontSize: 13,
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, color: "#aaa", marginBottom: 4 }}>
              随机种子 (Seed)
            </label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              style={{
                width: "100%",
                padding: "6px 10px",
                background: "#1c1c24",
                border: "1px solid #3d3d4e",
                borderRadius: 4,
                color: "#fff",
                fontSize: 13,
              }}
            />
          </div>
        </div>
      </div>

      {/* Action Button */}
      <button
        onClick={handleGenerateMesh}
        disabled={isSubmitting || isUploadingImage || (activeJob && !["completed", "failed", "cancelled"].includes(activeJob.status))}
        style={{
          width: "100%",
          padding: "10px 16px",
          background:
            isSubmitting || (activeJob && !["completed", "failed", "cancelled"].includes(activeJob.status))
              ? "#1e3a5f"
              : "#0288d1",
          color: "#fff",
          fontWeight: "bold",
          fontSize: 14,
          border: "none",
          borderRadius: 6,
          cursor:
            isSubmitting || (activeJob && !["completed", "failed", "cancelled"].includes(activeJob.status))
              ? "not-allowed"
              : "pointer",
          marginBottom: 16,
          transition: "background 0.2s ease",
        }}
      >
        {isSubmitting
          ? "正在提交任务..."
          : activeJob && !["completed", "failed", "cancelled"].includes(activeJob.status)
          ? `本地网格生成中 (${activeJob.status === "running" ? "运行中" : activeJob.status === "queued" ? "排队中" : activeJob.status})... ${(elapsedMs / 1000).toFixed(1)}s`
          : "🚀 开始生成本地 3D 网格"}
      </button>

      {/* Execution Monitor & Display */}
      {activeJob && (
        <div
          style={{
            padding: 14,
            background: "#1c1c24",
            border: "1px solid #3d3d4e",
            borderRadius: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
              paddingBottom: 6,
              borderBottom: "1px solid #2a2a35",
            }}
          >
            <strong style={{ color: "#fff", fontSize: 13 }}>任务监控 (Job Monitor)</strong>
            <span
              style={{
                fontSize: 12,
                fontWeight: "bold",
                padding: "2px 8px",
                borderRadius: 4,
                background:
                  activeJob.status === "completed"
                    ? "#1b5e20"
                    : activeJob.status === "failed"
                    ? "#c62828"
                    : "#0288d1",
                color: "#fff",
              }}
            >
              {activeJob.status === "completed"
                ? "已完成 (COMPLETED)"
                : activeJob.status === "failed"
                ? "失败 (FAILED)"
                : activeJob.status === "running"
                ? "运行中 (RUNNING)"
                : activeJob.status.toUpperCase()}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, marginBottom: 10 }}>
            <div>
              <span style={{ color: "#aaa" }}>任务编号 (Job ID):</span>{" "}
              <span style={{ color: "#80cbc4", fontFamily: "monospace" }}>{activeJob.id}</span>
            </div>
            <div>
              <span style={{ color: "#aaa" }}>工作节点 (Worker ID):</span>{" "}
              <span style={{ color: "#fff", fontFamily: "monospace" }}>
                {activeJob.claimedByWorkerId || "等待本地 Worker 认领..."}
              </span>
            </div>
            <div>
              <span style={{ color: "#aaa" }}>执行耗时:</span>{" "}
              <span style={{ color: "#ffd54f", fontWeight: "bold" }}>{(elapsedMs / 1000).toFixed(1)}秒</span>
            </div>
            <div>
              <span style={{ color: "#aaa" }}>推理引擎:</span>{" "}
              <span style={{ color: "#fff" }}>{activeJob.provider}</span>
            </div>
          </div>

          {activeJob.error && (
            <div
              style={{
                padding: 10,
                background: "rgba(244, 67, 54, 0.1)",
                border: "1px solid #f44336",
                borderRadius: 4,
                color: "#ff8a80",
                fontSize: 12,
                marginBottom: 10,
              }}
            >
              <strong>失败原因:</strong> {activeJob.error}
            </div>
          )}

          {/* Artifact Result Display */}
          {outputArtifact && (() => {
            const uri = String(customArtifactUri || outputArtifact.uri || "").trim();
            const isLocalPath =
              /^[a-zA-Z]:[\\/]/.test(uri) ||
              uri.startsWith("file://") ||
              uri.includes("\\ComfyUI\\") ||
              uri.includes("/ComfyUI/");
            const meshState = !uri ? "UPLOADED" : isLocalPath ? "LOCAL_FILE" : "BROWSER_READY";

            const handlePreviewClick = async () => {
              if (!uri || !onLoadGlbTo3d) return;
              setIsLoadingPreview(true);
              setGlbLoadError(null);
              try {
                const checkRes = await fetch(uri);
                if (!checkRes.ok) {
                  throw new Error(
                    `服务器端未找到该模型文件 (HTTP ${checkRes.status})。请点击下方“选择本地生成的 GLB 文件”直接上传即可预览。`
                  );
                }
                onLoadGlbTo3d(uri, { ...outputArtifact, uri });
              } catch (err: any) {
                console.warn("[ImageToMeshTestPanel] Preview load warning:", err);
                setGlbLoadError(
                  err?.message || "无法从服务器加载该 3D 模型文件。请点击下方上传本地生成的 GLB 文件进行预览。"
                );
              } finally {
                setIsLoadingPreview(false);
              }
            };

            const handleGlbFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0];
              if (!file || !outputArtifact) return;

              setIsUploadingLocalGlb(true);
              setGlbLoadError(null);

              try {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("artifactId", outputArtifact.id);
                formData.append("partId", partId);
                formData.append("jobId", activeJob?.id || "job");

                const res = await fetch("/api/worker/artifacts/upload", {
                  method: "POST",
                  headers: {
                    "x-worker-token": "browser-client",
                  },
                  body: formData,
                });

                if (!res.ok) {
                  const errJson = await res.json().catch(() => ({}));
                  throw new Error(errJson?.error?.message || `HTTP ${res.status}`);
                }

                const resData = await res.json();
                const newUrl =
                  resData.downloadUrl || resData.url || `/api/worker/artifacts/file/${outputArtifact.id}`;
                setCustomArtifactUri(newUrl);

                if (onLoadGlbTo3d) {
                  onLoadGlbTo3d(newUrl, { ...outputArtifact, uri: newUrl });
                }
              } catch (err: any) {
                console.error("Failed to upload local GLB:", err);
                setGlbLoadError(`本地 GLB 上传失败: ${err.message || err}`);
              } finally {
                setIsUploadingLocalGlb(false);
              }
            };

            return (
              <div
                style={{
                  padding: 12,
                  background: "#121214",
                  border: `1px solid ${meshState === "BROWSER_READY" ? "#2e7d32" : meshState === "LOCAL_FILE" ? "#f57c00" : "#ed6c02"}`,
                  borderRadius: 6,
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <strong
                    style={{
                      color: meshState === "BROWSER_READY" ? "#81c784" : "#ffb74d",
                      fontSize: 13,
                    }}
                  >
                    ✓ AI 参考网格产物已生成 (AI Reference Mesh Artifact)
                  </strong>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: "bold",
                        padding: "2px 6px",
                        background: meshState === "BROWSER_READY" ? "#1b5e20" : "#e65100",
                        borderRadius: 3,
                        color: "#fff",
                      }}
                    >
                      产物状态: {meshState === "BROWSER_READY" ? "浏览器就绪" : meshState === "LOCAL_FILE" ? "本地文件" : "已上传"}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        background: "#333",
                        borderRadius: 3,
                        color: "#aaa",
                      }}
                    >
                      生产真值 productionTruth = 否 (参考)
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "#ccc", display: "grid", gap: 6 }}>
                  <div>
                    <strong>产物编号 (Artifact ID):</strong>{" "}
                    <span style={{ fontFamily: "monospace", color: "#80cbc4" }}>{outputArtifact.id}</span>
                  </div>
                  <div>
                    <strong>部件名称 (Part ID):</strong>{" "}
                    <span style={{ fontFamily: "monospace", color: "#ffd54f" }}>{partId}</span>
                  </div>
                  <div>
                    <strong>工程数据状态:</strong>{" "}
                    {fes ? (
                      <span style={{ color: "#a7ffeb", fontWeight: "bold" }}>
                        FES 工程模型激活 (款号: {fes.sku})
                      </span>
                    ) : (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                        <span style={{ color: "#f44336", fontWeight: "bold" }}>
                          需要工程数据 — 请先载入 FES 工程表或 Excel。
                        </span>
                        {onLoadSample && (
                          <button
                            type="button"
                            onClick={() => onLoadSample("est_sofa_roundarm_2650.xlsx")}
                            style={{
                              padding: "2px 8px",
                              background: "#00897b",
                              color: "#fff",
                              border: "none",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: "bold",
                              cursor: "pointer",
                            }}
                          >
                            ⚡ 一键加载沙发工程表 (Sofa FES)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong>映射工程组件:</strong>{" "}
                    {(() => {
                      const comps = (fes as any)?.assembly?.components || fes?.components || [];
                      return comps.length > 0 ? (
                        <select
                          value={mappedComponentId}
                          onChange={(e) => setMappedComponentId(e.target.value)}
                          style={{
                            padding: "3px 8px",
                            background: "#1c1c24",
                            color: "#fff",
                            border: "1px solid #4fc3f7",
                            borderRadius: 4,
                            fontSize: 12,
                          }}
                        >
                          {comps.map((c: any, cIdx: number) => (
                            <option key={`${c.id || "comp"}_${cIdx}`} value={c.id}>
                              {c.id} ({c.name || "工程组件"})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={mappedComponentId}
                          onChange={(e) => setMappedComponentId(e.target.value)}
                          style={{
                            padding: "3px 8px",
                            background: "#1c1c24",
                            color: "#fff",
                            border: "1px solid #3d3d4e",
                            borderRadius: 4,
                            fontSize: 12,
                          }}
                          placeholder="例如: ARM-L-OUT"
                        />
                      );
                    })()}
                  </div>
                  <div>
                    <strong>云端产物地址:</strong>{" "}
                    {isLocalPath ? (
                      <span style={{ color: "#ffb74d" }}>
                        本地 Worker 文件路径: <code>{uri}</code> (请直接点击下方上传以在浏览器中预览)
                      </span>
                    ) : (
                      <a
                        href={uri}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#4fc3f7", textDecoration: "underline", wordBreak: "break-all" }}
                      >
                        {uri}
                      </a>
                    )}
                  </div>
                </div>

                {glbLoadError && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 8,
                      background: "rgba(244, 67, 54, 0.15)",
                      border: "1px solid #f44336",
                      borderRadius: 4,
                      color: "#ff8a80",
                      fontSize: 12,
                    }}
                  >
                    ⚠️ {glbLoadError}
                  </div>
                )}

                {/* Local GLB Upload / Sync box */}
                <div
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    background: "#1c1c26",
                    border: "1px dashed #3f51b5",
                    borderRadius: 4,
                  }}
                >
                  <div style={{ fontSize: 12, color: "#ccc", marginBottom: 6 }}>
                    <strong>本地模型直连上传通道：</strong>
                    <span style={{ color: "#90caf9", marginLeft: 4 }}>
                      若 Worker 生成后未自动同步至云端，可直接选择本地生成的文件上传，即可在 Three.js 3D 中预览！
                    </span>
                  </div>
                  <input
                    ref={glbFileInputRef}
                    type="file"
                    accept=".glb,.gltf"
                    style={{ display: "none" }}
                    onChange={handleGlbFileUpload}
                  />
                  <button
                    type="button"
                    disabled={isUploadingLocalGlb}
                    onClick={() => glbFileInputRef.current?.click()}
                    style={{
                      padding: "6px 14px",
                      background: isUploadingLocalGlb ? "#455a64" : "#1976d2",
                      color: "#fff",
                      fontWeight: "bold",
                      border: "none",
                      borderRadius: 4,
                      cursor: isUploadingLocalGlb ? "not-allowed" : "pointer",
                      fontSize: 12,
                    }}
                  >
                    {isUploadingLocalGlb ? "⏳ 正在上传本地 GLB 模型..." : "📂 选择本地生成的 GLB 文件上传并预览"}
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                  {onLoadGlbTo3d && uri && !isLocalPath && (
                    <button
                      onClick={handlePreviewClick}
                      disabled={isLoadingPreview}
                      style={{
                        padding: "8px 12px",
                        background: isLoadingPreview ? "#388e3c" : "#2e7d32",
                        color: "#fff",
                        fontWeight: "bold",
                        border: "none",
                        borderRadius: 4,
                        cursor: isLoadingPreview ? "wait" : "pointer",
                        fontSize: 12,
                      }}
                    >
                      {isLoadingPreview ? "正在加载 3D 模型..." : "👁️ 在 Three.js 3D 视口中预览"}
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (fes && onRunAlignment) {
                        onRunAlignment(outputArtifact.id, partId, mappedComponentId);
                      } else if (!fes && onLoadSample) {
                        onLoadSample("est_sofa_roundarm_2650.xlsx");
                      }
                    }}
                    style={{
                      padding: "8px 12px",
                      background: fes ? "#0288d1" : "#00897b",
                      color: "#fff",
                      fontWeight: "bold",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {fes ? "📐 执行工程对齐分析 (Run Alignment)" : "⚡ 加载工程表 (Load Sofa FES)"}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
