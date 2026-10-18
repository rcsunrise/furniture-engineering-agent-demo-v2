import React, { useState, useEffect } from "react";
import { Folder, X, Trash2, Clock, Box, ArrowRight, RefreshCw, AlertCircle } from "lucide-react";
import type { Engineering3DScene } from "../../../shared/imported3dAsset.js";

interface ScenesListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadScene: (scene: Engineering3DScene) => void;
  currentSceneId?: string;
}

export const ScenesListModal: React.FC<ScenesListModalProps> = ({
  isOpen,
  onClose,
  onLoadScene,
  currentSceneId,
}) => {
  const [scenes, setScenes] = useState<Engineering3DScene[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchScenes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scenes");
      const data = await res.json();
      if (data.success) {
        setScenes(data.scenes || []);
      } else {
        setError(data.error || "获取场景失败");
      }
    } catch (e: any) {
      setError(e?.message || "网络请求异常");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchScenes();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDeleteScene = async (sceneId: string, sceneName: string) => {
    if (!confirm(`确定要删除场景「${sceneName}」吗？（关联的原 3D 模型资产不会被删除）`)) return;

    try {
      const res = await fetch(`/api/scenes/${sceneId}`, { method: "DELETE" });
      if (res.ok) {
        setScenes((prev) => prev.filter((s) => s.id !== sceneId));
      } else {
        const err = await res.json();
        alert(`删除失败: ${err.error}`);
      }
    } catch (e: any) {
      alert(`删除请求错误: ${e.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl w-full max-w-2xl h-[70vh] flex flex-col overflow-hidden text-neutral-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-semibold text-white">已保存场景列表 (PostgreSQL)</h3>
            <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full">
              {scenes.length} 个场景
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-neutral-400 gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
              <span className="text-xs">加载场景列表中...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-48 text-red-400 gap-2">
              <AlertCircle className="w-5 h-5" />
              <span className="text-xs">{error}</span>
            </div>
          ) : scenes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-neutral-500">
              <Folder className="w-10 h-10 mb-2 stroke-1 text-neutral-600" />
              <p className="text-sm font-medium text-neutral-400">暂无已保存场景</p>
              <p className="text-xs text-neutral-500 mt-1">在顶部点击「保存场景」即可保存当前视图与模型组合</p>
            </div>
          ) : (
            scenes.map((scene, idx) => {
              const isCurrent = scene.id === currentSceneId;
              return (
                <div
                  key={`${scene.id || "scene"}_${idx}`}
                  className={`p-4 rounded-xl border flex items-center justify-between transition ${
                    isCurrent
                      ? "bg-indigo-950/20 border-indigo-500/40"
                      : "bg-neutral-950 border-neutral-800 hover:border-neutral-700"
                  }`}
                >
                  <div className="space-y-1 min-w-0 flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-white truncate">{scene.name}</h4>
                      {isCurrent && (
                        <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 rounded">
                          当前场景
                        </span>
                      )}
                    </div>
                    {scene.description && (
                      <p className="text-xs text-neutral-400 line-clamp-1">{scene.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-[11px] text-neutral-500 pt-1">
                      <span className="flex items-center gap-1">
                        <Box className="w-3.5 h-3.5 text-neutral-400" />
                        {scene.instances?.length || 0} 个模型实例
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-neutral-400" />
                        更新于 {new Date(scene.updatedAt || scene.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleDeleteScene(scene.id, scene.name)}
                      className="p-2 text-neutral-500 hover:text-red-400 rounded-lg hover:bg-neutral-800 transition"
                      title="删除场景"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        onLoadScene(scene);
                        onClose();
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow transition"
                    >
                      <span>打开场景</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
