import React, { useState, useEffect } from "react";
import {
  Library,
  X,
  Plus,
  Trash2,
  Box,
  Layers,
  Triangle,
  RefreshCw,
  AlertCircle,
  Clock,
  ArrowRight,
} from "lucide-react";
import type { Imported3DAsset } from "../../../shared/imported3dAsset.js";

interface AssetLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAsset: (asset: Imported3DAsset) => void;
  onOpenImportDialog: () => void;
}

export const AssetLibraryModal: React.FC<AssetLibraryModalProps> = ({
  isOpen,
  onClose,
  onSelectAsset,
  onOpenImportDialog,
}) => {
  const [assets, setAssets] = useState<Imported3DAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [inUseWarning, setInUseWarning] = useState<{
    assetName: string;
    scenes: Array<{ id: string; name: string }>;
  } | null>(null);

  const fetchAssets = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/assets");
      const data = await res.json();
      if (data.success) {
        setAssets(data.assets || []);
      } else {
        setError(data.error || "获取资产列表失败");
      }
    } catch (e: any) {
      setError(e?.message || "网络请求异常");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAssets();
      setInUseWarning(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDeleteAsset = async (asset: Imported3DAsset) => {
    if (!confirm(`确定要删除 3D 资产「${asset.name}」吗？`)) return;

    setDeletingId(asset.id);
    setInUseWarning(null);
    try {
      const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
      const data = await res.json();

      if (res.status === 409) {
        // Referenced by scenes
        setInUseWarning({
          assetName: asset.name,
          scenes: data.referencingScenes || [],
        });
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "删除失败");
      }

      // Success
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    } catch (err: any) {
      alert(`删除失败: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = assets.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.format.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden text-neutral-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-3">
            <Library className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-semibold text-white">3D 资产库 (Storage Bucket: engineering-3d-assets)</h3>
            <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full">
              共 {assets.length} 个模型
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onOpenImportDialog();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              <span>导入新 3D 模型</span>
            </button>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar / Search */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-800/80 bg-neutral-900/50">
          <input
            type="text"
            placeholder="按名称、文件名或格式搜索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-80 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={fetchAssets}
            disabled={loading}
            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white px-2 py-1 rounded hover:bg-neutral-800 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>刷新</span>
          </button>
        </div>

        {/* Warning Banner if asset is referenced */}
        {inUseWarning && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-amber-950/50 border border-amber-800 text-amber-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-300">
                无法删除资产「{inUseWarning.assetName}」
              </p>
              <p className="text-neutral-300 mt-1">
                该 3D 模型正被以下 {inUseWarning.scenes.length} 个场景引用，请先在场景中移除或删除关联场景：
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {inUseWarning.scenes.map((sc, idx) => (
                  <span
                    key={`${sc.id || "sc"}_${idx}`}
                    className="bg-neutral-800 border border-neutral-700 px-2 py-0.5 rounded text-neutral-300 font-mono text-[11px]"
                  >
                    {sc.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Content Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-neutral-400">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-400 mb-3" />
              <p className="text-sm">正在加载资产库...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 text-red-400">
              <AlertCircle className="w-8 h-8 mb-2" />
              <p className="text-sm">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-neutral-500 text-center">
              <Box className="w-12 h-12 mb-3 stroke-1 text-neutral-600" />
              <p className="text-sm font-medium text-neutral-400">暂无 3D 资产</p>
              <p className="text-xs text-neutral-500 mt-1">
                点击右上角「导入新 3D 模型」上传 GLB/GLTF/OBJ/STL/PLY/FBX
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((asset, idx) => (
                <div
                  key={`${asset.id || "asset"}_${idx}`}
                  className="group bg-neutral-950 border border-neutral-800 hover:border-neutral-600 rounded-xl overflow-hidden transition flex flex-col"
                >
                  {/* Thumbnail / Header */}
                  <div className="relative h-40 bg-neutral-900 flex items-center justify-center overflow-hidden border-b border-neutral-800/80">
                    {asset.thumbnailUrl ? (
                      <img
                        src={asset.thumbnailUrl}
                        alt={asset.name}
                        className="w-full h-full object-contain p-2"
                      />
                    ) : (
                      <Box className="w-12 h-12 text-neutral-700" />
                    )}
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-indigo-300 text-[10px] font-mono uppercase font-bold tracking-wider">
                      {asset.format}
                    </span>
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/70 text-neutral-400 text-[10px] font-mono">
                      {(asset.fileSize / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>

                  {/* Body Info */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold text-white truncate" title={asset.name}>
                          {asset.name}
                        </h4>
                        <button
                          onClick={() => handleDeleteAsset(asset)}
                          disabled={deletingId === asset.id}
                          className="text-neutral-500 hover:text-red-400 p-1 rounded hover:bg-neutral-800 transition"
                          title="删除资产"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-[11px] text-neutral-400 truncate mt-0.5" title={asset.fileName}>
                        {asset.fileName}
                      </p>

                      {/* Stats grid */}
                      <div className="grid grid-cols-3 gap-1 mt-3 bg-neutral-900/60 p-2 rounded-lg text-[11px] text-neutral-400 border border-neutral-800/50">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-neutral-500">网格/顶点</span>
                          <span className="text-neutral-300 font-mono font-medium">
                            {asset.stats?.meshCount ?? 1} / {asset.stats?.vertexCount?.toLocaleString() ?? "-"}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-neutral-500">三角面数</span>
                          <span className="text-neutral-300 font-mono font-medium">
                            {asset.stats?.triangleCount?.toLocaleString() ?? "-"}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-neutral-500">尺寸 (W×D×H)</span>
                          <span className="text-neutral-300 font-mono text-[10px]" title="宽×深×高 (mm)">
                            {asset.stats?.dimensions
                              ? `${Math.round(asset.stats.dimensions.width)}×${Math.round(asset.stats.dimensions.depth)}×${Math.round(asset.stats.dimensions.height)}`
                              : "-"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="mt-4 pt-3 border-t border-neutral-900 flex items-center justify-between">
                      <div className="flex items-center gap-1 text-[10px] text-neutral-500">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                      </div>
                      <button
                        onClick={() => {
                          onSelectAsset(asset);
                          onClose();
                        }}
                        className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-indigo-600/90 hover:bg-indigo-600 rounded-lg transition shadow"
                      >
                        <span>置入场景</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
