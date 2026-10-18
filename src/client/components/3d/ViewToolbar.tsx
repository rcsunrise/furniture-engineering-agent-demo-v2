import React from "react";
import {
  MousePointer,
  Move,
  RotateCcw,
  Maximize2,
  Scissors,
  Ruler,
  SplitSquareVertical,
  Globe,
  Compass,
  Layers,
  Eye,
  EyeOff,
  Focus,
  SunMedium,
  Grid,
  Undo2,
  Redo2,
} from "lucide-react";
import type { TransformMode, TransformSpace, SnapSettings } from "../../utils/3d/transformController.js";
import type { WorkspaceViewMode } from "../../utils/3d/viewModeManager.js";
import type { CameraPreset } from "../../utils/3d/cameraController.js";

export type InteractionMode =
  | "select"
  | "translate"
  | "rotate"
  | "scale"
  | "split"
  | "measure"
  | "section";

interface ViewToolbarProps {
  interactionMode: InteractionMode;
  onSelectInteractionMode: (mode: InteractionMode) => void;
  transformSpace: TransformSpace;
  onToggleTransformSpace: () => void;
  snapSettings: SnapSettings;
  onUpdateSnapSettings: (settings: Partial<SnapSettings>) => void;
  viewMode: WorkspaceViewMode;
  onSelectViewMode: (mode: WorkspaceViewMode) => void;
  onSelectCameraPreset: (preset: CameraPreset) => void;
  onFitAll: () => void;
  onFitSelection: () => void;
  hasSelection: boolean;
  isIsolated: boolean;
  onToggleIsolation: () => void;
  explodeProgress: number; // 0 to 100
  onExplodeChange: (val: number) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const ViewToolbar: React.FC<ViewToolbarProps> = ({
  interactionMode,
  onSelectInteractionMode,
  transformSpace,
  onToggleTransformSpace,
  snapSettings,
  onUpdateSnapSettings,
  viewMode,
  onSelectViewMode,
  onSelectCameraPreset,
  onFitAll,
  onFitSelection,
  hasSelection,
  isIsolated,
  onToggleIsolation,
  explodeProgress,
  onExplodeChange,
  showGrid,
  onToggleGrid,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  return (
    <div className="h-12 bg-neutral-950/95 border-t border-neutral-800/80 px-3 flex items-center justify-between text-neutral-300 text-xs select-none backdrop-blur-md z-30">
      {/* Left: Interaction Modes & Transform Gizmos (Section B & D) */}
      <div className="flex items-center gap-1">
        {/* Undo / Redo */}
        {onUndo && (
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`p-1.5 rounded transition flex items-center ${
              canUndo
                ? "text-neutral-300 hover:text-white hover:bg-neutral-800 cursor-pointer"
                : "text-neutral-600 cursor-not-allowed"
            }`}
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
        )}
        {onRedo && (
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={`p-1.5 rounded transition flex items-center mr-1 ${
              canRedo
                ? "text-neutral-300 hover:text-white hover:bg-neutral-800 cursor-pointer"
                : "text-neutral-600 cursor-not-allowed"
            }`}
            title="重做 (Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="h-4 w-px bg-neutral-800 mx-0.5" />

        {/* Select */}
        <button
          onClick={() => onSelectInteractionMode("select")}
          className={`p-1.5 rounded-lg flex items-center gap-1 transition ${
            interactionMode === "select"
              ? "bg-indigo-600 text-white font-medium"
              : "hover:bg-neutral-800 text-neutral-400"
          }`}
          title="选择模式 (Select) - 鼠标点击模型进行选中"
        >
          <MousePointer className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">选择</span>
        </button>

        {/* Translate (W) */}
        <button
          onClick={() => onSelectInteractionMode("translate")}
          className={`p-1.5 rounded-lg flex items-center gap-1 transition ${
            interactionMode === "translate"
              ? "bg-indigo-600 text-white font-medium"
              : "hover:bg-neutral-800 text-neutral-400"
          }`}
          title="位移 Gizmo (W) - 移动选中对象"
        >
          <Move className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">移动 (W)</span>
        </button>

        {/* Rotate (E) */}
        <button
          onClick={() => onSelectInteractionMode("rotate")}
          className={`p-1.5 rounded-lg flex items-center gap-1 transition ${
            interactionMode === "rotate"
              ? "bg-indigo-600 text-white font-medium"
              : "hover:bg-neutral-800 text-neutral-400"
          }`}
          title="旋转 Gizmo (E) - 旋转选中对象"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">旋转 (E)</span>
        </button>

        {/* Scale (R) */}
        <button
          onClick={() => onSelectInteractionMode("scale")}
          className={`p-1.5 rounded-lg flex items-center gap-1 transition ${
            interactionMode === "scale"
              ? "bg-indigo-600 text-white font-medium"
              : "hover:bg-neutral-800 text-neutral-400"
          }`}
          title="缩放 Gizmo (R) - 缩放选中对象"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">缩放 (R)</span>
        </button>

        <div className="h-4 w-px bg-neutral-800 mx-1" />

        {/* Split Mode */}
        <button
          onClick={() => onSelectInteractionMode("split")}
          className={`p-1.5 rounded-lg flex items-center gap-1 transition ${
            interactionMode === "split"
              ? "bg-amber-600 text-white font-medium"
              : "hover:bg-neutral-800 text-neutral-400"
          }`}
          title="模型拆分模式 (Split) - 表面选择与连通分量拆分"
        >
          <Scissors className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">拆分</span>
        </button>

        {/* Measure Mode */}
        <button
          onClick={() => onSelectInteractionMode("measure")}
          className={`p-1.5 rounded-lg flex items-center gap-1 transition ${
            interactionMode === "measure"
              ? "bg-emerald-600 text-white font-medium"
              : "hover:bg-neutral-800 text-neutral-400"
          }`}
          title="测量模式 (Measure) - 尺寸与间距测量"
        >
          <Ruler className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">测量</span>
        </button>

        {/* Section / Cut Mode */}
        <button
          onClick={() => onSelectInteractionMode("section")}
          className={`p-1.5 rounded-lg flex items-center gap-1 transition ${
            interactionMode === "section"
              ? "bg-cyan-600 text-white font-medium"
              : "hover:bg-neutral-800 text-neutral-400"
          }`}
          title="剖切视图模式 (Section)"
        >
          <SplitSquareVertical className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">剖切</span>
        </button>

        <div className="h-4 w-px bg-neutral-800 mx-1" />

        {/* Transform Space: World vs Local (Section D) */}
        <button
          onClick={onToggleTransformSpace}
          className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded text-[10px] font-mono text-indigo-300 flex items-center gap-1"
          title="切换变换空间 (World 世界坐标 / Local 局部坐标)"
        >
          <Globe className="w-3 h-3" />
          {transformSpace.toUpperCase()}
        </button>

        {/* Snaps Dropdown (Section E) */}
        <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded px-1.5 py-0.5">
          <span className="text-[10px] text-neutral-500 font-mono">吸附:</span>
          {/* Position snap */}
          <select
            value={snapSettings.positionSnap ?? "off"}
            onChange={(e) =>
              onUpdateSnapSettings({
                positionSnap: e.target.value === "off" ? null : parseFloat(e.target.value),
              })
            }
            className="bg-transparent text-[10px] text-neutral-300 font-mono focus:outline-none cursor-pointer"
            title="位置吸附增量 (mm)"
          >
            <option value="off" className="bg-neutral-900">位移: 关闭</option>
            <option value="1" className="bg-neutral-900">位移: 1mm</option>
            <option value="5" className="bg-neutral-900">位移: 5mm</option>
            <option value="10" className="bg-neutral-900">位移: 10mm</option>
            <option value="50" className="bg-neutral-900">位移: 50mm</option>
          </select>

          {/* Rotation snap */}
          <select
            value={snapSettings.rotationSnap ?? "off"}
            onChange={(e) =>
              onUpdateSnapSettings({
                rotationSnap: e.target.value === "off" ? null : parseFloat(e.target.value),
              })
            }
            className="bg-transparent text-[10px] text-neutral-300 font-mono focus:outline-none cursor-pointer"
            title="旋转吸附角度 (度)"
          >
            <option value="off" className="bg-neutral-900">旋转: 关闭</option>
            <option value="1" className="bg-neutral-900">旋转: 1°</option>
            <option value="5" className="bg-neutral-900">旋转: 5°</option>
            <option value="15" className="bg-neutral-900">旋转: 15°</option>
            <option value="30" className="bg-neutral-900">旋转: 30°</option>
            <option value="45" className="bg-neutral-900">旋转: 45°</option>
            <option value="90" className="bg-neutral-900">旋转: 90°</option>
            <option value="180" className="bg-neutral-900">旋转: 180°</option>
          </select>
        </div>
      </div>

      {/* Center: Explode Slider (Section P) */}
      <div className="flex items-center gap-2 bg-neutral-900/80 border border-neutral-800 rounded-lg px-2.5 py-1">
        <span className="text-[10px] text-neutral-400 font-medium">爆炸拆解:</span>
        <input
          type="range"
          min="0"
          max="100"
          value={explodeProgress}
          onChange={(e) => onExplodeChange(parseFloat(e.target.value))}
          className="w-24 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          title={`装配爆炸比例: ${Math.round(explodeProgress)}%`}
        />
        <span className="text-[10px] font-mono text-indigo-400 w-8 text-right">
          {Math.round(explodeProgress)}%
        </span>
      </div>

      {/* Right: Camera Presets, Fit, View Modes & Isolation (Section F & Q) */}
      <div className="flex items-center gap-1.5">
        {/* Camera Fit All */}
        <button
          onClick={onFitAll}
          className="p-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded text-neutral-300 hover:text-white transition"
          title="全景适屏 (Fit All) - 聚焦全部模型"
        >
          <Focus className="w-3.5 h-3.5" />
        </button>

        {/* Camera Fit Selection (F) */}
        <button
          onClick={onFitSelection}
          disabled={!hasSelection}
          className={`p-1.5 bg-neutral-900 border border-neutral-800 rounded transition ${
            hasSelection
              ? "text-neutral-300 hover:text-white hover:bg-neutral-800 cursor-pointer"
              : "text-neutral-600 cursor-not-allowed"
          }`}
          title="聚焦选中 (F) - 聚焦当前选中的模型"
        >
          <span className="text-[10px] font-bold font-mono">F</span>
        </button>

        {/* Isolate Selection (Section Q) */}
        {hasSelection && (
          <button
            onClick={onToggleIsolation}
            className={`px-2 py-1 rounded text-[11px] font-medium border flex items-center gap-1 transition ${
              isIsolated
                ? "bg-amber-600/30 border-amber-500 text-amber-300"
                : "bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-300"
            }`}
            title={isIsolated ? "退出隔离模式 (Exit Isolation)" : "隔离显示当前选中模型 (Isolate)"}
          >
            {isIsolated ? <EyeOff className="w-3 h-3 text-amber-400" /> : <Eye className="w-3 h-3 text-neutral-400" />}
            <span>{isIsolated ? "退出隔离" : "隔离"}</span>
          </button>
        )}

        {/* View Mode Selector (Section Q: Solid, Wireframe, Ghost, X-Ray) */}
        <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded p-0.5">
          {(["solid", "wireframe", "ghost", "xray"] as WorkspaceViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onSelectViewMode(mode)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition uppercase ${
                viewMode === mode
                  ? "bg-indigo-600 text-white"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
              title={`视图渲染模式: ${mode}`}
            >
              {mode === "solid"
                ? "实体"
                : mode === "wireframe"
                ? "线框"
                : mode === "ghost"
                ? "半透"
                : "X光"}
            </button>
          ))}
        </div>

        {/* Toggle Grid */}
        <button
          onClick={onToggleGrid}
          className={`p-1.5 rounded border transition ${
            showGrid
              ? "bg-neutral-800 border-neutral-700 text-indigo-400"
              : "bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-300"
          }`}
          title="显示/隐藏 地面参考网格"
        >
          <Grid className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
