import React from "react";
import { Terminal, X, Cpu, Camera, Layers, AlertCircle } from "lucide-react";

interface DeveloperOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  camPos: { x: number; y: number; z: number };
  camTarget: { x: number; y: number; z: number };
  diagnostics: {
    componentCount: number;
    renderedMeshCount: number;
    fallbackCount: number;
    failedComponentCount: number;
  };
  totalTriangles?: number;
  instanceCount?: number;
}

export const DeveloperOverlay: React.FC<DeveloperOverlayProps> = ({
  isOpen,
  onClose,
  camPos,
  camTarget,
  diagnostics,
  totalTriangles = 0,
  instanceCount = 0,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="developer-overlay"
      className="absolute bottom-12 right-4 z-40 w-72 bg-neutral-950/95 border border-neutral-700/80 rounded-xl shadow-2xl p-3 text-neutral-200 text-xs backdrop-blur-md font-mono select-none"
    >
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-2">
        <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-[11px]">
          <Terminal className="w-3.5 h-3.5" />
          <span>开发者调试信息 (Developer Overlay)</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2 text-[11px]">
        {/* Camera Info */}
        <div className="bg-neutral-900/80 p-2 rounded border border-neutral-800 space-y-1">
          <div className="flex items-center gap-1 text-indigo-400 font-semibold text-[10px]">
            <Camera className="w-3 h-3" />
            <span>相机位姿 (Camera Pose)</span>
          </div>
          <div className="text-[10px] text-neutral-300">
            Pos: [{camPos.x}, {camPos.y}, {camPos.z}]
          </div>
          <div className="text-[10px] text-neutral-300">
            Target: [{camTarget.x}, {camTarget.y}, {camTarget.z}]
          </div>
        </div>

        {/* Geometry & Render Diagnostics */}
        <div className="bg-neutral-900/80 p-2 rounded border border-neutral-800 space-y-1">
          <div className="flex items-center gap-1 text-emerald-400 font-semibold text-[10px]">
            <Cpu className="w-3 h-3" />
            <span>渲染与几何诊断 (Diagnostics)</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-neutral-400">构件总数:</span>
            <span className="text-white">{diagnostics.componentCount || instanceCount}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-neutral-400">渲染网格 (Meshes):</span>
            <span className="text-white">{diagnostics.renderedMeshCount}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-neutral-400">多边形三角面:</span>
            <span className="text-white">{totalTriangles.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-neutral-400">降级代理 (Fallback):</span>
            <span className={diagnostics.fallbackCount > 0 ? "text-amber-400" : "text-neutral-400"}>
              {diagnostics.fallbackCount}
            </span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-neutral-400">渲染失败:</span>
            <span className={diagnostics.failedComponentCount > 0 ? "text-red-400" : "text-neutral-400"}>
              {diagnostics.failedComponentCount}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
