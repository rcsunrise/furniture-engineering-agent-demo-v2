import React, { useState, useRef } from "react";
import { Upload, FileBox, X, Check, AlertCircle, Loader2 } from "lucide-react";
import { ModelLoaderService } from "../../utils/3d/modelLoaderService.js";
import { CoordinateSystemAdapter } from "../../utils/3d/coordinateSystemAdapter.js";
import type { Imported3DAsset, CoordinateUpAxis } from "../../../shared/imported3dAsset.js";
import * as THREE from "three";

interface ModelImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onModelImported: (asset: Imported3DAsset, object: THREE.Object3D) => void;
}

export const ModelImportDialog: React.FC<ModelImportDialogProps> = ({
  isOpen,
  onClose,
  onModelImported,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState("");
  const [sourceUp, setSourceUp] = useState<CoordinateUpAxis>("Y_UP");
  const [unitScale, setUnitScale] = useState<number>(1.0);
  const [alignGround, setAlignGround] = useState<boolean>(true);
  const [centerOrigin, setCenterOrigin] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    setModelName(baseName);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "stl" || ext === "ply") {
      setSourceUp("Z_UP");
      setUnitScale(1.0); // CAD STL/PLY are standard mm
    } else {
      setSourceUp("Y_UP");
      setUnitScale(1000.0); // GLTF/GLB models are authored in meters according to spec
    }
    setErrorMessage(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const buffer = await selectedFile.arrayBuffer();
      // 1. Parse model in Three.js
      const parsed = await ModelLoaderService.loadModel(buffer, selectedFile.name);

      // 2. Wrap and align according to chosen coordinate settings
      const { wrapper, computedBoundingBox, dimensions } = CoordinateSystemAdapter.wrapAndAlign(
        parsed.rootObject,
        {
          sourceUp,
          targetUp: "Y_UP",
          alignGround,
          centerOrigin,
          scaleFactor: unitScale,
        }
      );

      // 3. Upload to server storage (engineering-3d-assets bucket + PostgreSQL metadata)
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("name", modelName.trim() || parsed.rootObject.name);
      formData.append("detectedUp", sourceUp);
      formData.append("stats", JSON.stringify(parsed.stats));
      formData.append("materials", JSON.stringify(parsed.materials));
      if (parsed.thumbnailWebP) {
        formData.append("thumbnailUrl", parsed.thumbnailWebP);
      }

      let asset: Imported3DAsset;
      try {
        const res = await fetch("/api/assets/upload", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const result = await res.json();
          asset = result.asset;
        } else {
          const errJson = await res.json().catch(() => ({}));
          console.warn("Server asset upload failed:", errJson.error || res.status);
          throw new Error(errJson.error || `Server status ${res.status}`);
        }
      } catch (uploadErr) {
        console.warn("Falling back to local in-memory asset instantiation:", uploadErr);
        asset = {
          id: `local-asset-${Date.now()}`,
          name: modelName.trim() || parsed.rootObject.name || "ImportedModel",
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          format: (selectedFile.name.split(".").pop()?.toLowerCase() as any) || "glb",
          storageBucket: "engineering-3d-assets",
          storagePath: `local://${selectedFile.name}`,
          downloadUrl: "",
          thumbnailUrl: parsed.thumbnailWebP,
          stats: parsed.stats,
          materials: parsed.materials,
          coordinateSystem: {
            detectedUp: sourceUp,
            targetUp: "Y_UP",
            conversionApplied: sourceUp === "Z_UP" ? "X_ROTATION_NEGATIVE_90" : "NONE",
          },
          metadata: {
            originalName: selectedFile.name,
            mimeType: selectedFile.type || "application/octet-stream",
            uploadedAt: new Date().toISOString(),
          },
          productionTruth: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      // Notify parent to add to scene
      onModelImported(asset, wrapper);
      onClose();
    } catch (err: any) {
      console.error("Import error:", err);
      setErrorMessage(err?.message || "Failed to load 3D model.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden text-neutral-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/50">
          <div className="flex items-center gap-2">
            <FileBox className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-semibold text-white">导入 3D 资产</h3>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Dropzone with explicit click trigger */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf,.obj,.stl,.ply,.fbx,.zip"
            className="hidden"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFileSelect(file);
                e.target.value = "";
              }
            }}
          />
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 select-none ${
              isDragOver
                ? "border-indigo-500 bg-indigo-950/30"
                : selectedFile
                ? "border-emerald-500/60 bg-emerald-950/10"
                : "border-neutral-700 hover:border-neutral-500 bg-neutral-950/30"
            }`}
          >
            {selectedFile ? (
              <div className="flex items-center gap-3 text-emerald-400">
                <Check className="w-6 h-6" />
                <div className="text-left">
                  <p className="font-medium text-white">{selectedFile.name}</p>
                  <p className="text-xs text-neutral-400">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-300 mb-1">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-white">
                  拖拽 3D 文件至此处，或点击选择
                </p>
                <span className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition pointer-events-none">
                  浏览本地文件 (.glb, .obj, .stl...)
                </span>
                <p className="text-xs text-neutral-400">
                  支持 GLB、GLTF、OBJ、STL、PLY、FBX 及包含纹理的 ZIP
                </p>
              </>
            )}
          </div>

          {/* Configuration Form */}
          {selectedFile && (
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  资产名称
                </label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    源模型朝上轴 (Up Axis)
                  </label>
                  <select
                    value={sourceUp}
                    onChange={(e) => setSourceUp(e.target.value as CoordinateUpAxis)}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Y_UP">Y-UP (标准 GLTF/GLB/FBX)</option>
                    <option value="Z_UP">Z-UP (标准 STL/CAD)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    单位比例
                  </label>
                  <select
                    value={unitScale}
                    onChange={(e) => setUnitScale(parseFloat(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value={1.0}>毫米 (mm, 1×)</option>
                    <option value={10.0}>厘米 (cm, 10×)</option>
                    <option value={1000.0}>米 (m, 1000×)</option>
                    <option value={25.4}>英寸 (inches, 25.4×)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alignGround}
                    onChange={(e) => setAlignGround(e.target.checked)}
                    className="rounded bg-neutral-950 border-neutral-700 text-indigo-500 focus:ring-0"
                  />
                  <span>自动底面贴地 (Ground Z=0)</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={centerOrigin}
                    onChange={(e) => setCenterOrigin(e.target.checked)}
                    className="rounded bg-neutral-950 border-neutral-700 text-indigo-500 focus:ring-0"
                  />
                  <span>水平居中 (Center X/Y)</span>
                </label>
              </div>
            </div>
          )}

          {/* Error display */}
          {errorMessage && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-950/40 border border-red-800 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-800 bg-neutral-950/50">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedFile || loading}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>处理并导入中...</span>
              </>
            ) : (
              <span>确认导入并置入场景</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
