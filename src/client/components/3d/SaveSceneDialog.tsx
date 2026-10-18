import React, { useState, useEffect } from "react";
import { Save, X, FileText, Check, Loader2 } from "lucide-react";
import type { Engineering3DScene } from "../../../shared/imported3dAsset.js";

interface SaveSceneDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentScene: Engineering3DScene | null;
  onSave: (name: string, description: string, isSaveAs: boolean) => Promise<void>;
  isSaveAsMode?: boolean;
}

export const SaveSceneDialog: React.FC<SaveSceneDialogProps> = ({
  isOpen,
  onClose,
  currentScene,
  onSave,
  isSaveAsMode = false,
}) => {
  const [sceneName, setSceneName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (currentScene && !isSaveAsMode) {
        setSceneName(currentScene.name);
        setDescription(currentScene.description || "");
      } else if (currentScene && isSaveAsMode) {
        setSceneName(`${currentScene.name} (副本)`);
        setDescription(currentScene.description || "");
      } else {
        setSceneName(`3D 场景 ${new Date().toLocaleDateString()}`);
        setDescription("");
      }
      setError(null);
    }
  }, [isOpen, currentScene, isSaveAsMode]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!sceneName.trim()) {
      setError("请输入场景名称");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSave(sceneName.trim(), description.trim(), isSaveAsMode);
      onClose();
    } catch (err: any) {
      setError(err?.message || "保存场景失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-neutral-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-2">
            <Save className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-semibold text-white">
              {isSaveAsMode ? "另存为 3D 场景 (Save As)" : "保存 3D 场景 (Save Scene)"}
            </h3>
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
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">
              场景名称 *
            </label>
            <input
              type="text"
              value={sceneName}
              onChange={(e) => setSceneName(e.target.value)}
              placeholder="例如：客厅组合沙发三维装配方案"
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">
              备注说明 (可选)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="记录此场景的视角排布、模型组合或装配说明..."
              rows={3}
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <p className="text-[11px] text-neutral-500">
            仅保存轻量级模型引用、相机机位与位姿变换，不重复保存几何网格。
          </p>

          {error && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-800 text-red-300 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-800 bg-neutral-950/60">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow disabled:opacity-50 transition"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>保存中...</span>
              </>
            ) : (
              <span>确认保存</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
