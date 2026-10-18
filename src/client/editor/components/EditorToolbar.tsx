import React, { useState, useEffect } from "react";
import {
  Move,
  RotateCcw,
  RotateCw,
  Maximize2,
  Globe,
  Box,
  Magnet,
  Focus,
  Undo2,
  Redo2,
  Camera,
  Ruler,
  Scaling,
} from "lucide-react";
import type { Engineering3DEditor } from "../Engineering3DEditor.js";
import type { TransformMode, TransformSpace } from "../../utils/3d/transformController.js";

interface EditorToolbarProps {
  editor: Engineering3DEditor;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({ editor }) => {
  const [, setTick] = useState(0);
  const [rotateStep, setRotateStep] = useState<number>(90);

  useEffect(() => {
    const unsub1 = editor.signals.transformModeChanged.add(() => setTick((t) => t + 1));
    const unsub2 = editor.signals.transformSpaceChanged.add(() => setTick((t) => t + 1));
    const unsub3 = editor.signals.snapChanged.add(() => setTick((t) => t + 1));
    const unsub4 = editor.signals.objectSelected.add(() => setTick((t) => t + 1));
    const unsub5 = editor.signals.historyChanged.add(() => setTick((t) => t + 1));
    const unsub6 = editor.signals.projectionModeChanged.add(() => setTick((t) => t + 1));
    const unsub7 = editor.signals.rulerVisibilityChanged.add(() => setTick((t) => t + 1));

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
      unsub6();
      unsub7();
    };
  }, [editor]);

  const mode = editor.transformMode;
  const space = editor.transformSpace;
  const snaps = editor.snapSettings;
  const selectedName = editor.selected?.name || "未选择对象";

  return (
    <div className="h-[34px] min-h-[34px] bg-[#1a1c20] border-t border-[#2e3238] flex items-center justify-between px-3 text-xs text-neutral-300 select-none z-30">
      {/* Left: Transform Controls (W, E, R) */}
      <div className="flex items-center space-x-1.5">
        <div className="flex items-center bg-[#22252a] rounded p-0.5 border border-[#33373e]">
          <button
            onClick={() => editor.setTransformMode("translate")}
            title="平移模式 (W)"
            className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] transition-colors ${
              mode === "translate"
                ? "bg-blue-600 text-white shadow-sm font-medium"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-[#2c3036]"
            }`}
          >
            <Move className="w-3.5 h-3.5" />
            <span>平移 (W)</span>
          </button>
          <button
            onClick={() => editor.setTransformMode("rotate")}
            title="旋转模式 (E)"
            className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] transition-colors ${
              mode === "rotate"
                ? "bg-blue-600 text-white shadow-sm font-medium"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-[#2c3036]"
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>旋转 (E)</span>
          </button>
          <button
            onClick={() => editor.setTransformMode("scale")}
            title="缩放模式 (R)"
            className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] transition-colors ${
              mode === "scale"
                ? "bg-blue-600 text-white shadow-sm font-medium"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-[#2c3036]"
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>缩放 (R)</span>
          </button>
        </div>

        <div className="h-4 w-[1px] bg-[#33373e] mx-1" />

        {/* Space: World / Local */}
        <button
          onClick={() => editor.setTransformSpace(space === "world" ? "local" : "world")}
          title={`切换坐标系空间: 当前 ${space === "world" ? "世界空间" : "局部空间"}`}
          className="flex items-center space-x-1.5 px-2 py-1 bg-[#22252a] hover:bg-[#2c3036] border border-[#33373e] rounded text-[11px] text-neutral-300 transition-colors"
        >
          {space === "world" ? <Globe className="w-3.5 h-3.5 text-blue-400" /> : <Box className="w-3.5 h-3.5 text-amber-400" />}
          <span>{space === "world" ? "世界 (World)" : "局部 (Local)"}</span>
        </button>

        <div className="h-4 w-[1px] bg-[#33373e] mx-1" />

        {/* Snapping Controls */}
        <div className="flex items-center space-x-1 bg-[#22252a] px-2 py-0.5 border border-[#33373e] rounded">
          <Magnet
            className={`w-3.5 h-3.5 mr-1 ${
              snaps.positionSnap || snaps.rotationSnap ? "text-blue-400" : "text-neutral-500"
            }`}
          />
          <span className="text-[10px] text-neutral-400">位置吸附:</span>
          <select
            value={snaps.positionSnap ?? "off"}
            onChange={(e) =>
              editor.setSnapSettings({
                positionSnap: e.target.value === "off" ? null : Number(e.target.value),
              })
            }
            className="bg-[#18191c] text-neutral-200 text-[11px] rounded px-1.5 py-0.5 border border-[#33373e] outline-none"
          >
            <option value="off">关</option>
            <option value="1">1 mm</option>
            <option value="5">5 mm</option>
            <option value="10">10 mm</option>
            <option value="50">50 mm</option>
            <option value="100">100 mm</option>
          </select>

          <span className="text-[10px] text-neutral-400 ml-1.5">角度:</span>
          <select
            value={snaps.rotationSnap ?? "off"}
            onChange={(e) =>
              editor.setSnapSettings({
                rotationSnap: e.target.value === "off" ? null : Number(e.target.value),
              })
            }
            className="bg-[#18191c] text-neutral-200 text-[11px] rounded px-1.5 py-0.5 border border-[#33373e] outline-none"
            title="旋转手柄吸附步长"
          >
            <option value="off">关</option>
            <option value="1">1°</option>
            <option value="5">5°</option>
            <option value="10">10°</option>
            <option value="15">15°</option>
            <option value="30">30°</option>
            <option value="45">45°</option>
            <option value="90">90°</option>
            <option value="180">180°</option>
          </select>
        </div>

        {/* Quick Rotation Parameters Controls */}
        <div
          className={`flex items-center space-x-1 px-2 py-0.5 border rounded transition-colors ${
            mode === "rotate"
              ? "bg-blue-950/40 border-blue-600/60 shadow-xs"
              : "bg-[#22252a] border-[#33373e]"
          }`}
        >
          <RotateCw className="w-3.5 h-3.5 text-emerald-400 mr-0.5" />
          <span className="text-[10px] text-neutral-300 font-medium">旋转参数:</span>

          <select
            value={rotateStep}
            onChange={(e) => setRotateStep(Number(e.target.value))}
            className="bg-[#18191c] text-neutral-200 text-[11px] rounded px-1 py-0.5 border border-[#33373e] outline-none font-mono"
            title="快捷旋转步长 (度)"
          >
            <option value="90">90°</option>
            <option value="45">45°</option>
            <option value="30">30°</option>
            <option value="15">15°</option>
            <option value="180">180°</option>
          </select>

          <div className="flex items-center space-x-0.5">
            <button
              onClick={() => editor.rotateSelected("y", rotateStep)}
              disabled={!editor.selected}
              title={`绕垂直 Y 轴水平顺时针旋转 +${rotateStep}°`}
              className="px-1.5 py-0.5 bg-[#18191c] hover:bg-[#2c3036] disabled:opacity-30 disabled:cursor-not-allowed border border-[#33373e] rounded text-[10px] font-mono text-emerald-300 hover:text-emerald-200 transition-colors"
            >
              Y+{rotateStep}°
            </button>
            <button
              onClick={() => editor.rotateSelected("y", -rotateStep)}
              disabled={!editor.selected}
              title={`绕垂直 Y 轴水平逆时针旋转 -${rotateStep}°`}
              className="px-1.5 py-0.5 bg-[#18191c] hover:bg-[#2c3036] disabled:opacity-30 disabled:cursor-not-allowed border border-[#33373e] rounded text-[10px] font-mono text-emerald-300 hover:text-emerald-200 transition-colors"
            >
              Y-{rotateStep}°
            </button>
            <button
              onClick={() => editor.rotateSelected("x", rotateStep)}
              disabled={!editor.selected}
              title={`绕 X 轴旋转 +${rotateStep}° (立起/平躺)`}
              className="px-1.5 py-0.5 bg-[#18191c] hover:bg-[#2c3036] disabled:opacity-30 disabled:cursor-not-allowed border border-[#33373e] rounded text-[10px] font-mono text-blue-300 hover:text-blue-200 transition-colors"
            >
              X+{rotateStep}°
            </button>
            <button
              onClick={() => editor.rotateSelected("z", rotateStep)}
              disabled={!editor.selected}
              title={`绕 Z 轴侧向旋转 +${rotateStep}°`}
              className="px-1.5 py-0.5 bg-[#18191c] hover:bg-[#2c3036] disabled:opacity-30 disabled:cursor-not-allowed border border-[#33373e] rounded text-[10px] font-mono text-purple-300 hover:text-purple-200 transition-colors"
            >
              Z+{rotateStep}°
            </button>
            <button
              onClick={() => editor.rotateSelected("y", 180)}
              disabled={!editor.selected}
              title="水平掉头 180°"
              className="px-1.5 py-0.5 bg-[#18191c] hover:bg-[#2c3036] disabled:opacity-30 disabled:cursor-not-allowed border border-[#33373e] rounded text-[10px] font-mono text-amber-300 hover:text-amber-200 transition-colors"
            >
              180°
            </button>
            <button
              onClick={() => editor.resetRotationSelected()}
              disabled={!editor.selected}
              title="重置旋转角度为 0°"
              className="px-1.5 py-0.5 bg-[#18191c] hover:bg-[#2c3036] disabled:opacity-30 disabled:cursor-not-allowed border border-[#33373e] rounded text-[10px] text-neutral-400 hover:text-white transition-colors"
            >
              归零
            </button>
          </div>
        </div>

        <div className="h-4 w-[1px] bg-[#33373e] mx-1" />

        {/* Focus Button */}
        <button
          onClick={() => editor.focus()}
          title="聚焦选中对象 (F)"
          className="flex items-center space-x-1 px-2 py-1 bg-[#22252a] hover:bg-[#2c3036] border border-[#33373e] rounded text-[11px] text-neutral-300 transition-colors"
        >
          <Focus className="w-3.5 h-3.5 text-neutral-400" />
          <span>聚焦 (F)</span>
        </button>

        <div className="h-4 w-[1px] bg-[#33373e] mx-1" />

        {/* 3D CAD Dimension Ruler Toggle */}
        <button
          onClick={() => editor.setShowRulers(!editor.showRulers)}
          title={`三维长宽高尺寸标尺: ${editor.showRulers ? "已开启" : "已隐藏"}`}
          className={`flex items-center space-x-1 px-2 py-1 border rounded text-[11px] transition-colors ${
            editor.showRulers
              ? "bg-amber-950/50 border-amber-600/60 text-amber-300 font-medium"
              : "bg-[#22252a] border-[#33373e] text-neutral-400 hover:text-neutral-200 hover:bg-[#2c3036]"
          }`}
        >
          <Ruler className="w-3.5 h-3.5" />
          <span>3D标尺</span>
        </button>

        {/* Quick Uniform Scale Buttons in Toolbar */}
        <div className="flex items-center space-x-0.5 bg-[#22252a] px-1.5 py-0.5 border border-[#33373e] rounded">
          <Scaling className="w-3.5 h-3.5 text-amber-400 mr-1" />
          <span className="text-[10px] text-neutral-400">等比缩放:</span>
          <button
            onClick={() => editor.scaleSelected(0.5)}
            disabled={!editor.selected}
            title="整体缩小一半 (0.5x)"
            className="px-1 py-0.5 bg-[#18191c] hover:bg-[#2c3036] disabled:opacity-30 disabled:cursor-not-allowed border border-[#33373e] rounded text-[10px] font-mono text-neutral-300 transition-colors"
          >
            0.5x
          </button>
          <button
            onClick={() => editor.scaleSelected(2)}
            disabled={!editor.selected}
            title="整体放大 2 倍 (2x)"
            className="px-1 py-0.5 bg-[#18191c] hover:bg-[#2c3036] disabled:opacity-30 disabled:cursor-not-allowed border border-[#33373e] rounded text-[10px] font-mono text-amber-300 hover:text-amber-200 transition-colors"
          >
            2x
          </button>
          <button
            onClick={() => editor.scaleSelected(10)}
            disabled={!editor.selected}
            title="整体放大 10 倍 (10x)"
            className="px-1 py-0.5 bg-[#18191c] hover:bg-[#2c3036] disabled:opacity-30 disabled:cursor-not-allowed border border-[#33373e] rounded text-[10px] font-mono text-amber-300 hover:text-amber-200 transition-colors"
          >
            10x
          </button>
          <button
            onClick={() => editor.scaleSelected(1000)}
            disabled={!editor.selected}
            title="米转毫米 (1000x)"
            className="px-1.5 py-0.5 bg-amber-950/40 hover:bg-amber-900/50 disabled:opacity-30 disabled:cursor-not-allowed border border-amber-600/50 rounded text-[10px] font-mono text-amber-200 transition-colors"
          >
            1000x(m→mm)
          </button>
          <button
            onClick={() => editor.autoFitSelectedToMm(800)}
            disabled={!editor.selected}
            title="自动等比自适应至常用家具尺寸 (800mm)"
            className="px-1.5 py-0.5 bg-blue-950/40 hover:bg-blue-900/50 disabled:opacity-30 disabled:cursor-not-allowed border border-blue-600/50 rounded text-[10px] text-blue-200 transition-colors"
          >
            自适应(800mm)
          </button>
        </div>

        <div className="h-4 w-[1px] bg-[#33373e] mx-1" />

        {/* Quick Undo / Redo */}
        <button
          disabled={!editor.history.canUndo()}
          onClick={() => editor.undo()}
          title="撤销 (Ctrl+Z)"
          className={`p-1 rounded bg-[#22252a] border border-[#33373e] ${
            editor.history.canUndo()
              ? "text-neutral-300 hover:bg-[#2c3036]"
              : "text-neutral-600 cursor-not-allowed opacity-50"
          }`}
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          disabled={!editor.history.canRedo()}
          onClick={() => editor.redo()}
          title="重做 (Ctrl+Y)"
          className={`p-1 rounded bg-[#22252a] border border-[#33373e] ${
            editor.history.canRedo()
              ? "text-neutral-300 hover:bg-[#2c3036]"
              : "text-neutral-600 cursor-not-allowed opacity-50"
          }`}
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right: Selection status & camera mode */}
      <div className="flex items-center space-x-3 text-neutral-400 text-[11px]">
        <div className="flex items-center space-x-1.5 truncate max-w-[240px]">
          <span className="text-neutral-500">当前选择:</span>
          <span className="text-neutral-200 font-medium truncate">{selectedName}</span>
        </div>

        <div className="h-3 w-[1px] bg-[#33373e]" />

        <button
          onClick={() =>
            editor.setProjectionMode(
              editor.projectionMode === "perspective" ? "orthographic" : "perspective"
            )
          }
          className="flex items-center space-x-1 hover:text-neutral-200"
          title="切换透视/正交相机"
        >
          <Camera className="w-3.5 h-3.5 text-neutral-400" />
          <span className="uppercase">{editor.projectionMode === "perspective" ? "透视" : "正交"}</span>
        </button>
      </div>
    </div>
  );
};
