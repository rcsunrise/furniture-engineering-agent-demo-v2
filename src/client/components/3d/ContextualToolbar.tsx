import React from "react";
import {
  Scissors,
  Ruler,
  SplitSquareVertical,
  Sliders,
  Layers,
  Sparkles,
  RotateCcw,
  RotateCw,
  Check,
  Trash2,
  Minimize2,
} from "lucide-react";
import type { InteractionMode } from "./ViewToolbar.js";

interface ContextualToolbarProps {
  interactionMode: InteractionMode;
  isExplodeActive?: boolean;
  explodeProgress: number;
  onExplodeChange: (val: number) => void;
  // Split controls
  selectedFaceCount?: number;
  onExtractFaces?: () => void;
  onSplitMaterials?: () => void;
  onSplitConnected?: () => void;
  hasSelectedInstance?: boolean;
  // Section controls
  sectionPlane?: "XY" | "YZ" | "XZ";
  onSelectSectionPlane?: (plane: "XY" | "YZ" | "XZ") => void;
  sectionOffset?: number;
  onSectionOffsetChange?: (val: number) => void;
  // Measure controls
  measureDistance?: number | null;
  onResetMeasure?: () => void;
  // Quick rotate controls
  onRotate?: (axis: "x" | "y" | "z", deg: number) => void;
  onResetRotation?: () => void;
}

export const ContextualToolbar: React.FC<ContextualToolbarProps> = ({
  interactionMode,
  isExplodeActive = false,
  explodeProgress,
  onExplodeChange,
  selectedFaceCount = 0,
  onExtractFaces,
  onSplitMaterials,
  onSplitConnected,
  hasSelectedInstance = false,
  sectionPlane = "XZ",
  onSelectSectionPlane,
  sectionOffset = 0,
  onSectionOffsetChange,
  measureDistance = null,
  onResetMeasure,
  onRotate,
  onResetRotation,
}) => {
  // Only show if a contextual mode is active or explode is being used
  const showExplode = isExplodeActive || explodeProgress > 0;
  const showSplit = interactionMode === "split";
  const showMeasure = interactionMode === "measure";
  const showSection = interactionMode === "section";
  const showRotate = (interactionMode === "rotate") && hasSelectedInstance;

  if (!showExplode && !showSplit && !showMeasure && !showSection && !showRotate) {
    return null;
  }

  return (
    <div
      id="contextual-toolbar"
      className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-3 py-1.5 bg-neutral-900/90 backdrop-blur-md border border-neutral-700/80 rounded-xl shadow-2xl text-xs text-neutral-200 animate-in fade-in slide-in-from-top-2 duration-150"
    >
      {/* 1. Explode Mode Contextual Controls */}
      {showExplode && (
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-indigo-400 font-semibold text-[11px]">
            <Sliders className="w-3.5 h-3.5" />
            <span>装配爆炸拆解:</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={explodeProgress}
            onChange={(e) => onExplodeChange(parseFloat(e.target.value))}
            className="w-28 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
          <span className="font-mono text-indigo-300 w-9 text-right font-medium">
            {Math.round(explodeProgress)}%
          </span>
          <div className="flex gap-1 ml-1">
            <button
              onClick={() => onExplodeChange(0)}
              className="px-1.5 py-0.5 bg-neutral-800 hover:bg-neutral-700 rounded text-[10px] text-neutral-300 transition"
              title="重置爆炸"
            >
              0%
            </button>
            <button
              onClick={() => onExplodeChange(100)}
              className="px-1.5 py-0.5 bg-neutral-800 hover:bg-neutral-700 rounded text-[10px] text-neutral-300 transition"
              title="完全爆炸"
            >
              100%
            </button>
          </div>
        </div>
      )}

      {/* 2. Split Mode Contextual Controls */}
      {showSplit && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-[11px] mr-1">
            <Scissors className="w-3.5 h-3.5" />
            <span>拆分工具:</span>
          </div>
          <span className="bg-neutral-800 text-amber-300 px-2 py-0.5 rounded text-[11px] font-mono">
            已选多边形面: {selectedFaceCount}
          </span>
          {onExtractFaces && (
            <button
              onClick={onExtractFaces}
              disabled={selectedFaceCount === 0}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:hover:bg-amber-600 text-white rounded font-medium transition text-[11px]"
              title="提取选中面为新独立构件"
            >
              提取所选面
            </button>
          )}
          {onSplitMaterials && (
            <button
              onClick={onSplitMaterials}
              disabled={!hasSelectedInstance}
              className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-300 rounded transition text-[11px]"
              title="按不同材质分组拆分为多个零件"
            >
              材质分组
            </button>
          )}
          {onSplitConnected && (
            <button
              onClick={onSplitConnected}
              disabled={!hasSelectedInstance}
              className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-300 rounded transition text-[11px]"
              title="按几何孤立连通块拆分"
            >
              孤立块拆解
            </button>
          )}
        </div>
      )}

      {/* 3. Measure Mode Contextual Controls */}
      {showMeasure && (
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
            <Ruler className="w-3.5 h-3.5" />
            <span>空间测量:</span>
          </div>
          <div className="bg-neutral-800 px-2 py-0.5 rounded text-neutral-200 font-mono text-[11px]">
            {measureDistance !== null ? (
              <span>
                测量距离: <strong className="text-emerald-400">{measureDistance.toFixed(1)}</strong> mm
              </span>
            ) : (
              <span className="text-neutral-400">在 3D 表面点选 2 个点进行测量</span>
            )}
          </div>
          {onResetMeasure && (
            <button
              onClick={onResetMeasure}
              className="p-1 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded"
              title="清除测量点"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* 4. Section Mode Contextual Controls */}
      {showSection && (
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-cyan-400 font-semibold text-[11px]">
            <SplitSquareVertical className="w-3.5 h-3.5" />
            <span>剖切平面:</span>
          </div>
          <div className="flex bg-neutral-800 p-0.5 rounded border border-neutral-700">
            {(["XY", "YZ", "XZ"] as const).map((p) => (
              <button
                key={p}
                onClick={() => onSelectSectionPlane?.(p)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition ${
                  sectionPlane === p ? "bg-cyan-600 text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-neutral-400">偏移:</span>
            <input
              type="range"
              min="-500"
              max="500"
              value={sectionOffset}
              onChange={(e) => onSectionOffsetChange?.(parseFloat(e.target.value))}
              className="w-20 h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-cyan-500"
            />
            <span className="text-[10px] font-mono text-cyan-300 w-8">{Math.round(sectionOffset)}</span>
          </div>
        </div>
      )}

      {/* 5. Rotate Mode Contextual Quick 90° Controls */}
      {showRotate && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
            <RotateCw className="w-3.5 h-3.5" />
            <span>90° 旋转快捷参数:</span>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => onRotate?.("y", 90)}
              className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 rounded text-[10px] font-mono text-emerald-300 transition cursor-pointer"
              title="水平顺转 90°"
            >
              水平 +90°
            </button>
            <button
              onClick={() => onRotate?.("y", -90)}
              className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 rounded text-[10px] font-mono text-emerald-300 transition cursor-pointer"
              title="水平逆转 90°"
            >
              水平 -90°
            </button>
            <button
              onClick={() => onRotate?.("x", 90)}
              className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 rounded text-[10px] font-mono text-blue-300 transition cursor-pointer"
              title="绕 X 轴立起 90°"
            >
              立起 X+90°
            </button>
            <button
              onClick={() => onRotate?.("z", 90)}
              className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 rounded text-[10px] font-mono text-purple-300 transition cursor-pointer"
              title="侧向侧旋 90°"
            >
              侧旋 Z+90°
            </button>
            <button
              onClick={() => onRotate?.("y", 180)}
              className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 rounded text-[10px] font-mono text-amber-300 transition cursor-pointer"
              title="水平掉头 180°"
            >
              180°
            </button>
            <button
              onClick={() => onResetRotation?.()}
              className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 rounded text-[10px] text-neutral-400 hover:text-white transition cursor-pointer"
              title="重置旋转为 0°"
            >
              归零
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
