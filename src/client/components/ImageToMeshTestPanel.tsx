import React, { useState, useEffect, useRef } from "react";
import { FurnitureEngineering } from "../../shared/fes.js";

export interface ImageToMeshTestPanelProps {
  fes?: FurnitureEngineering | null;
  onLoadGlbTo3d?: (glbUrl: string, artifact: any) => void;
  onRunAlignment?: (artifactId: string, partId: string, componentId: string) => void;
}

export function ImageToMeshTestPanel({ fes, onLoadGlbTo3d, onRunAlignment }: ImageToMeshTestPanelProps) {
  // Input fields
  const [partId, setPartId] = useState("part-arm-left");
  const [mappedComponentId, setMappedComponentId] = useState("ARM-L-OUT");
  const [provider, setProvider] = useState("comfyui_hunyuan3d");
  const [preset, setPreset] = useState("hunyuan3d-v2.1-part-v1.api.json");
  const [seed, setSeed] = useState<number>(42);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageArtifactUrl, setImageArtifactUrl] = useState<string>("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Job state
  const [activeJob, setActiveJob] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<any>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Poll job status when activeJob is queued, claimed, or running
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

    // Poll job status every 1 second
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
          <h3 style={{ margin: 0, color: "#fff", fontSize: 16 }}>
            Real Image → Local Mesh Pipeline (G4-3)
          </h3>
          <span style={{ fontSize: 12, color: "#aaa" }}>
            Local Worker + ComfyUI + Hunyuan3D v2.1
          </span>
        </div>
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
          productionTruth: false
        </span>
      </div>

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
          <strong>Error:</strong> {errorMsg}
        </div>
      )}

      {/* Form Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Left Column: Reference Image */}
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: "bold", color: "#aaa", marginBottom: 6 }}>
            1. Reference Part Image *
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
                alt="Reference Part"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <div style={{ textAlign: "center", color: "#888", fontSize: 12, padding: 10 }}>
                {isUploadingImage ? (
                  <span>Uploading image to server...</span>
                ) : (
                  <>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>📷</div>
                    Click to select reference image
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
              Use Sample Image
            </button>
            {imageArtifactUrl && (
              <span style={{ fontSize: 11, color: "#81c784", alignSelf: "center", wordBreak: "break-all" }}>
                ✓ Artifact ready
              </span>
            )}
          </div>
        </div>

        {/* Right Column: Parameters */}
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#aaa", marginBottom: 4 }}>
              Part ID
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
              placeholder="e.g. part-arm-left"
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, color: "#aaa", marginBottom: 4 }}>
              Provider
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
              Workflow Preset
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
              Random Seed
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
          ? "Submitting Job..."
          : activeJob && !["completed", "failed", "cancelled"].includes(activeJob.status)
          ? `Running Local Mesh Job (${activeJob.status})... ${(elapsedMs / 1000).toFixed(1)}s`
          : "Generate Local Mesh"}
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
            <strong style={{ color: "#fff", fontSize: 13 }}>Job Monitor</strong>
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
              {activeJob.status.toUpperCase()}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, marginBottom: 10 }}>
            <div>
              <span style={{ color: "#aaa" }}>Job ID:</span>{" "}
              <span style={{ color: "#80cbc4", fontFamily: "monospace" }}>{activeJob.id}</span>
            </div>
            <div>
              <span style={{ color: "#aaa" }}>Worker ID:</span>{" "}
              <span style={{ color: "#fff", fontFamily: "monospace" }}>
                {activeJob.claimedByWorkerId || "Waiting for Local Worker..."}
              </span>
            </div>
            <div>
              <span style={{ color: "#aaa" }}>Elapsed Time:</span>{" "}
              <span style={{ color: "#ffd54f", fontWeight: "bold" }}>{(elapsedMs / 1000).toFixed(1)}s</span>
            </div>
            <div>
              <span style={{ color: "#aaa" }}>Provider:</span>{" "}
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
              <strong>Failure Cause:</strong> {activeJob.error}
            </div>
          )}

          {/* Artifact Result Display */}
          {outputArtifact && (() => {
            const uri = String(outputArtifact.uri || "").trim();
            const isLocalPath = /^[a-zA-Z]:[\\/]/.test(uri) || uri.startsWith("file://") || uri.includes("\\ComfyUI\\") || uri.includes("/ComfyUI/");
            const meshState = !uri ? "UPLOADED" : isLocalPath ? "LOAD_FAILED" : "BROWSER_READY";

            return (
              <div
                style={{
                  padding: 12,
                  background: "#121214",
                  border: `1px solid ${meshState === "BROWSER_READY" ? "#2e7d32" : meshState === "LOAD_FAILED" ? "#c62828" : "#ed6c02"}`,
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
                  <strong style={{ color: meshState === "BROWSER_READY" ? "#81c784" : "#ff8a80", fontSize: 13 }}>
                    ✓ AI Reference Mesh Artifact Generated
                  </strong>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: "bold",
                        padding: "2px 6px",
                        background: meshState === "BROWSER_READY" ? "#1b5e20" : "#c62828",
                        borderRadius: 3,
                        color: "#fff",
                      }}
                    >
                      Mesh Artifact: {meshState}
                    </span>
                    <span style={{ fontSize: 10, padding: "2px 6px", background: "#333", borderRadius: 3, color: "#aaa" }}>
                      productionTruth = {String(outputArtifact.productionTruth ?? false)}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "#ccc", display: "grid", gap: 6 }}>
                  <div>
                    <strong>Artifact ID:</strong>{" "}
                    <span style={{ fontFamily: "monospace", color: "#80cbc4" }}>{outputArtifact.id}</span>
                  </div>
                  <div>
                    <strong>Part ID:</strong>{" "}
                    <span style={{ fontFamily: "monospace", color: "#ffd54f" }}>{partId}</span>
                  </div>
                  <div>
                    <strong>Engineering Data Status:</strong>{" "}
                    {fes ? (
                      <span style={{ color: "#a7ffeb", fontWeight: "bold" }}>
                        FES Active (SKU: {fes.sku})
                      </span>
                    ) : (
                      <span style={{ color: "#f44336", fontWeight: "bold" }}>
                        ENGINEERING DATA REQUIRED — Load FES / Excel first.
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong>Mapped Component:</strong>{" "}
                    {fes?.assembly?.components?.length ? (
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
                        {fes.assembly.components.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.id} ({c.name || "Component"})
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
                        placeholder="e.g. ARM-L-OUT"
                      />
                    )}
                  </div>
                  <div>
                    <strong>Cloud Artifact URL:</strong>{" "}
                    {isLocalPath ? (
                      <span style={{ color: "#ef5350", fontWeight: "bold" }}>
                        [ERROR: Local worker filesystem path rejected - Cloud URL required]
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
                  <div>
                    <strong>Format / Bytes:</strong> {outputArtifact.metadata?.format || "glb"} /{" "}
                    {outputArtifact.metadata?.fileBytes
                      ? `${(Number(outputArtifact.metadata.fileBytes) / 1024).toFixed(1)} KB`
                      : "N/A"}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                  {onLoadGlbTo3d && uri && !isLocalPath && (
                    <button
                      onClick={() => onLoadGlbTo3d(uri, outputArtifact)}
                      style={{
                        padding: "8px 12px",
                        background: "#2e7d32",
                        color: "#fff",
                        fontWeight: "bold",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Preview in Three.js 3D View
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (onRunAlignment) {
                        onRunAlignment(outputArtifact.id, partId, mappedComponentId);
                      }
                    }}
                    disabled={!fes}
                    style={{
                      padding: "8px 12px",
                      background: fes ? "#0288d1" : "#424242",
                      color: "#fff",
                      fontWeight: "bold",
                      border: "none",
                      borderRadius: 4,
                      cursor: fes ? "pointer" : "not-allowed",
                      fontSize: 12,
                    }}
                  >
                    {fes ? "Run Engineering Alignment" : "Load FES / Excel first."}
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
