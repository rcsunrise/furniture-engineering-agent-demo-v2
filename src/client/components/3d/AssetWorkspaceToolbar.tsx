import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  Save,
  Undo2,
  Redo2,
  MoreHorizontal,
  Library,
  FolderOpen,
  FolderPlus,
  Download,
  Trash2,
  Focus,
  Sparkles,
  Layers,
  FileSpreadsheet,
  CheckCircle2,
  Activity,
  ChevronDown,
} from "lucide-react";

interface AssetWorkspaceToolbarProps {
  onOpenImportDialog: () => void;
  onOpenSaveScene: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
  onRedo?: () => void;
  canRedo?: boolean;
  onOpenAssetLibrary: () => void;
  onOpenSaveAsScene: () => void;
  onOpenScenesList: () => void;
  onExportGLB: () => void;
  onClearScene: () => void;
  onFitCamera: () => void;
  isExporting?: boolean;
  sceneName?: string;
  hasFESData?: boolean;
  fesSku?: string;
  onToggleEngineeringDataDrawer?: () => void;
  activeMode: "asset_workspace" | "engineering_fes";
  onChangeMode: (mode: "asset_workspace" | "engineering_fes") => void;
  onToggleDeveloperOverlay?: () => void;
}

export const AssetWorkspaceToolbar: React.FC<AssetWorkspaceToolbarProps> = ({
  onOpenImportDialog,
  onOpenSaveScene,
  onUndo,
  canUndo = false,
  onRedo,
  canRedo = false,
  onOpenAssetLibrary,
  onOpenSaveAsScene,
  onOpenScenesList,
  onExportGLB,
  onClearScene,
  onFitCamera,
  isExporting = false,
  sceneName,
  hasFESData = false,
  fesSku,
  onToggleEngineeringDataDrawer,
  activeMode,
  onChangeMode,
  onToggleDeveloperOverlay,
}) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    if (isMoreOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isMoreOpen]);

  return (
    <div
      id="top-command-bar"
      className="h-11 bg-neutral-950 border-b border-neutral-800/80 px-3 flex items-center justify-between text-xs text-neutral-200 select-none z-30 shrink-0"
    >
      {/* Left: Mode toggle, Scene title & Engineering Data Connection trigger */}
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Mode Switcher */}
        <div className="flex items-center bg-neutral-900 p-0.5 rounded-lg border border-neutral-800 shrink-0">
          <button
            onClick={() => onChangeMode("asset_workspace")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition flex items-center gap-1.5 ${
              activeMode === "asset_workspace"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>3D 资产空间</span>
          </button>
          <button
            onClick={() => onChangeMode("engineering_fes")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition flex items-center gap-1.5 ${
              activeMode === "engineering_fes"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>工程装配 (FES)</span>
          </button>
        </div>

        {/* Scene title badge */}
        {sceneName && (
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-neutral-900 rounded border border-neutral-800 text-[11px]">
            <span className="text-neutral-500">场景:</span>
            <span className="text-indigo-300 font-medium truncate max-w-[120px]">{sceneName}</span>
          </div>
        )}

        {/* Engineering Data Connection (Collapsible Entry) */}
        {onToggleEngineeringDataDrawer && (
          <button
            onClick={onToggleEngineeringDataDrawer}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition text-[11px] ${
              hasFESData
                ? "bg-emerald-950/40 border-emerald-800/80 text-emerald-300 hover:bg-emerald-900/50"
                : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200"
            }`}
            title="查看或导入工程数据 (FES / Excel Connection)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">工程数据:</span>
            <span>{hasFESData ? (fesSku ? fesSku : "已连接") : "未连接"}</span>
            {hasFESData && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
          </button>
        )}
      </div>

      {/* Right: STRICTLY <= 5 Primary Buttons: Import, Save, Undo, Redo, More */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* 1. Import (导入 3D) */}
        <button
          id="btn-top-import"
          onClick={onOpenImportDialog}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium shadow transition"
          title="导入 3D 模型 (GLB, OBJ, STL, FBX...)"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>导入</span>
        </button>

        {/* 2. Save (保存) */}
        <button
          id="btn-top-save"
          onClick={onOpenSaveScene}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 text-[11px] font-medium transition"
          title="保存当前场景 (Ctrl+S)"
        >
          <Save className="w-3.5 h-3.5 text-emerald-400" />
          <span>保存</span>
        </button>

        {/* 3. Undo (撤销) */}
        <button
          id="btn-top-undo"
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-neutral-900 text-neutral-300 border border-neutral-800 transition"
          title="撤销 (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>

        {/* 4. Redo (重做) */}
        <button
          id="btn-top-redo"
          onClick={onRedo}
          disabled={!canRedo}
          className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-neutral-900 text-neutral-300 border border-neutral-800 transition"
          title="重做 (Ctrl+Y)"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>

        {/* 5. More (更多 / 文件菜单) */}
        <div className="relative" ref={moreRef}>
          <button
            id="btn-top-more"
            onClick={() => setIsMoreOpen(!isMoreOpen)}
            className={`p-1.5 rounded-lg border transition flex items-center justify-center ${
              isMoreOpen
                ? "bg-neutral-800 border-neutral-700 text-white"
                : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
            }`}
            title="更多操作菜单 (Asset Library, Open, Save As, Export, Clear)"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {/* More Dropdown Menu */}
          {isMoreOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-48 bg-neutral-900 border border-neutral-700/80 rounded-xl shadow-2xl py-1.5 text-neutral-200 z-50 text-xs animate-in fade-in slide-in-from-top-1 duration-100">
              <button
                onClick={() => {
                  setIsMoreOpen(false);
                  onOpenAssetLibrary();
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-neutral-800 text-neutral-300 hover:text-white transition"
              >
                <Library className="w-3.5 h-3.5 text-indigo-400" />
                <span>3D 资产库</span>
              </button>

              <button
                onClick={() => {
                  setIsMoreOpen(false);
                  onOpenScenesList();
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-neutral-800 text-neutral-300 hover:text-white transition"
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                <span>打开场景</span>
              </button>

              <button
                onClick={() => {
                  setIsMoreOpen(false);
                  onOpenSaveAsScene();
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-neutral-800 text-neutral-300 hover:text-white transition"
              >
                <FolderPlus className="w-3.5 h-3.5 text-blue-400" />
                <span>另存为...</span>
              </button>

              <button
                onClick={() => {
                  setIsMoreOpen(false);
                  onFitCamera();
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-neutral-800 text-neutral-300 hover:text-white transition"
              >
                <Focus className="w-3.5 h-3.5 text-purple-400" />
                <span>全景对焦 (Fit)</span>
              </button>

              <div className="my-1 border-t border-neutral-800" />

              <button
                onClick={() => {
                  setIsMoreOpen(false);
                  onExportGLB();
                }}
                disabled={isExporting}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-neutral-800 text-neutral-300 hover:text-white transition disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                <span>{isExporting ? "导出中..." : "导出 GLB"}</span>
              </button>

              {onToggleDeveloperOverlay && (
                <button
                  onClick={() => {
                    setIsMoreOpen(false);
                    onToggleDeveloperOverlay();
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-neutral-800 text-neutral-300 hover:text-white transition"
                >
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  <span>开发者诊断信息</span>
                </button>
              )}

              <div className="my-1 border-t border-neutral-800" />

              <button
                onClick={() => {
                  setIsMoreOpen(false);
                  onClearScene();
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-red-950/50 text-red-400 hover:text-red-300 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空场景</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
