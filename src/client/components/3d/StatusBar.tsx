import React, { useState, useRef, useEffect } from "react";
import {
  Globe,
  Magnet,
  Grid,
  Eye,
  Camera,
  Terminal,
  ChevronDown,
  Box,
  Compass,
} from "lucide-react";
import type { TransformSpace, SnapSettings } from "../../utils/3d/transformController.js";
import type { WorkspaceViewMode } from "../../utils/3d/viewModeManager.js";
import type { CameraPreset, ProjectionMode } from "../../utils/3d/cameraController.js";
import type { InteractionMode } from "./ViewToolbar.js";

interface StatusBarProps {
  interactionMode: InteractionMode;
  selectedInstanceName?: string | null;
  transformSpace: TransformSpace;
  onSelectTransformSpace: (space: TransformSpace) => void;
  snapSettings: SnapSettings;
  onUpdateSnapSettings: (settings: Partial<SnapSettings>) => void;
  projectionMode: ProjectionMode;
  onToggleProjectionMode: () => void;
  viewMode: WorkspaceViewMode;
  onSelectViewMode: (mode: WorkspaceViewMode) => void;
  onSelectCameraPreset: (preset: CameraPreset) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  triangleCount?: number;
  showDeveloperOverlay: boolean;
  onToggleDeveloperOverlay: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  interactionMode,
  selectedInstanceName,
  transformSpace,
  onSelectTransformSpace,
  snapSettings,
  onUpdateSnapSettings,
  projectionMode,
  onToggleProjectionMode,
  viewMode,
  onSelectViewMode,
  onSelectCameraPreset,
  showGrid,
  onToggleGrid,
  triangleCount = 0,
  showDeveloperOverlay,
  onToggleDeveloperOverlay,
}) => {
  const [isSnapOpen, setIsSnapOpen] = useState(false);
  const snapRef = useRef<HTMLDivElement>(null);

  // Close snap popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (snapRef.current && !snapRef.current.contains(e.target as Node)) {
        setIsSnapOpen(false);
      }
    };
    if (isSnapOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isSnapOpen]);

  const modeLabels: Record<InteractionMode, string> = {
    select: "选择 (Q)",
    translate: "位移 (W)",
    rotate: "旋转 (E)",
    scale: "缩放 (R)",
    split: "拆分模式",
    measure: "测量模式",
    section: "剖切模式",
  };

  const hasActiveSnapping = (snapSettings.positionSnap ?? 0) > 0 || (snapSettings.rotationSnap ?? 0) > 0;

  return (
    <div
      id="workspace-status-bar"
      className="h-8.5 bg-neutral-950 border-t border-neutral-800/80 px-3 flex items-center justify-between text-neutral-300 text-xs select-none z-30 shrink-0 font-sans"
    >
      {/* Left: Context Mode & Selection info */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-neutral-900 border border-neutral-800 rounded text-[11px] font-medium text-indigo-300">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          <span>{modeLabels[interactionMode]}</span>
        </div>

        {selectedInstanceName ? (
          <div className="text-[11px] text-neutral-400 truncate max-w-[180px] flex items-center gap-1">
            <span className="text-neutral-600">选中:</span>
            <span className="text-white font-medium">{selectedInstanceName}</span>
          </div>
        ) : (
          <span className="text-[10px] text-neutral-600 hidden sm:inline">未选择构件</span>
        )}
      </div>

      {/* Center / Right: Controls & Indicators */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* 1. Camera Projection Toggle (透视 / 正交) */}
        <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded p-0.5">
          <button
            onClick={onToggleProjectionMode}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
              projectionMode === "perspective"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
            title="透视投影 (Perspective Projection)"
          >
            透视
          </button>
          <button
            onClick={onToggleProjectionMode}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
              projectionMode === "orthographic"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
            title="正交投影 (Orthographic Projection)"
          >
            正交
          </button>
        </div>

        <div className="h-3.5 w-px bg-neutral-800" />

        {/* 2. View Preset Dropdown */}
        <div className="relative flex items-center">
          <select
            onChange={(e) => onSelectCameraPreset(e.target.value as CameraPreset)}
            defaultValue=""
            className="bg-neutral-900 border border-neutral-800 text-[10px] text-neutral-300 rounded px-1.5 py-1 focus:outline-none cursor-pointer"
            title="标准视角切换"
          >
            <option value="" disabled>
              视角预设
            </option>
            <option value="FRONT">前视 (Front)</option>
            <option value="BACK">后视 (Back)</option>
            <option value="LEFT">左视 (Left)</option>
            <option value="RIGHT">右视 (Right)</option>
            <option value="TOP">俯视 (Top)</option>
            <option value="BOTTOM">仰视 (Bottom)</option>
            <option value="ISO">轴测 (ISO)</option>
          </select>
        </div>

        {/* 3. Render ViewMode Dropdown (实体 / 线框 / 半透 / X光) */}
        <select
          value={viewMode}
          onChange={(e) => onSelectViewMode(e.target.value as WorkspaceViewMode)}
          className="bg-neutral-900 border border-neutral-800 text-[10px] text-neutral-300 rounded px-1.5 py-1 focus:outline-none cursor-pointer"
          title="模型渲染显示模式"
        >
          <option value="solid">渲染: 实体</option>
          <option value="wireframe">渲染: 线框</option>
          <option value="ghost">渲染: 半透</option>
          <option value="xray">渲染: X光</option>
        </select>

        <div className="h-3.5 w-px bg-neutral-800" />

        {/* 4. WORLD / LOCAL Coordinate Dropdown */}
        <select
          value={transformSpace}
          onChange={(e) => onSelectTransformSpace(e.target.value as TransformSpace)}
          className="bg-neutral-900 border border-neutral-800 text-[10px] font-mono text-indigo-300 rounded px-1.5 py-1 focus:outline-none cursor-pointer"
          title="坐标空间: 世界坐标 (WORLD) / 局部坐标 (LOCAL)"
        >
          <option value="world">WORLD</option>
          <option value="local">LOCAL</option>
        </select>

        {/* 5. Magnet Snap Popover */}
        <div className="relative" ref={snapRef}>
          <button
            onClick={() => setIsSnapOpen(!isSnapOpen)}
            className={`p-1.5 rounded border transition flex items-center gap-1 ${
              hasActiveSnapping
                ? "bg-indigo-950/80 border-indigo-700 text-indigo-300"
                : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
            }`}
            title="吸附设置 (Position & Rotation Snapping)"
          >
            <Magnet className="w-3.5 h-3.5" />
            <ChevronDown className="w-2.5 h-2.5" />
          </button>

          {/* Snap Popover */}
          {isSnapOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-48 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl p-3 text-neutral-200 z-50 space-y-2.5">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-1 text-[11px] font-semibold text-white">
                <span className="flex items-center gap-1">
                  <Magnet className="w-3 h-3 text-indigo-400" />
                  吸附参数
                </span>
                {hasActiveSnapping && (
                  <span className="text-[9px] bg-indigo-900/60 text-indigo-300 px-1 py-0.2 rounded font-mono">
                    已开启
                  </span>
                )}
              </div>

              {/* Position Snap */}
              <div>
                <label className="text-[10px] text-neutral-400 block mb-1">位移吸附 (mm):</label>
                <select
                  value={snapSettings.positionSnap ?? "off"}
                  onChange={(e) =>
                    onUpdateSnapSettings({
                      positionSnap: e.target.value === "off" ? null : parseFloat(e.target.value),
                    })
                  }
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:outline-none"
                >
                  <option value="off">关闭 (自由移动)</option>
                  <option value="1">1 mm</option>
                  <option value="5">5 mm</option>
                  <option value="10">10 mm (常用)</option>
                  <option value="50">50 mm (粗调)</option>
                </select>
              </div>

              {/* Rotation Snap */}
              <div>
                <label className="text-[10px] text-neutral-400 block mb-1">旋转吸附 (角度):</label>
                <select
                  value={snapSettings.rotationSnap ?? "off"}
                  onChange={(e) =>
                    onUpdateSnapSettings({
                      rotationSnap: e.target.value === "off" ? null : parseFloat(e.target.value),
                    })
                  }
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:outline-none"
                >
                  <option value="off">关闭 (自由旋转)</option>
                  <option value="1">1°</option>
                  <option value="5">5°</option>
                  <option value="15">15° (常用)</option>
                  <option value="45">45° (直角微调)</option>
                  <option value="90">90° (垂直翻转)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* 6. Grid Toggle */}
        <button
          onClick={onToggleGrid}
          className={`p-1.5 rounded border transition ${
            showGrid
              ? "bg-neutral-800 border-neutral-700 text-indigo-400"
              : "bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-300"
          }`}
          title="切换地面参考网格"
        >
          <Grid className="w-3.5 h-3.5" />
        </button>

        <div className="h-3.5 w-px bg-neutral-800" />

        {/* 7. Engineering Unit & Stats */}
        <span className="text-[10px] font-mono text-neutral-400 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800/80">
          单位: mm
        </span>

        {triangleCount > 0 && (
          <span className="text-[10px] font-mono text-neutral-400 hidden md:inline">
            ▲ {(triangleCount / 1000).toFixed(1)}k 面
          </span>
        )}

        {/* 8. Developer Overlay Toggle */}
        <button
          onClick={onToggleDeveloperOverlay}
          className={`p-1.5 rounded border transition ${
            showDeveloperOverlay
              ? "bg-amber-950/60 border-amber-700 text-amber-300"
              : "bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-300"
          }`}
          title="切换开发者调试信息面板 (Developer Overlay)"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
