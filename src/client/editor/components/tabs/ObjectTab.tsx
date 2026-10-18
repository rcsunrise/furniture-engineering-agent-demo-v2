import React, { useState, useEffect } from "react";
import * as THREE from "three";
import {
  Box,
  RotateCcw,
  RotateCw,
  Move,
  Maximize2,
  Trash2,
  Focus,
  Compass,
  Link2,
  Unlink,
  Ruler,
  Scaling,
  Maximize,
} from "lucide-react";
import type { Engineering3DEditor } from "../../Engineering3DEditor.js";
import {
  SetPositionCommand,
  SetRotationCommand,
  SetScaleCommand,
  RenameObjectCommand,
} from "../../commands/index.js";

interface ObjectTabProps {
  editor: Engineering3DEditor;
}

export const ObjectTab: React.FC<ObjectTabProps> = ({ editor }) => {
  const [, setTick] = useState(0);
  const [uniformLocked, setUniformLocked] = useState(true);
  const [uniformMultiplier, setUniformMultiplier] = useState("2.0");
  const [targetDimAxis, setTargetDimAxis] = useState<"x" | "y" | "z">("x");
  const [targetDimValue, setTargetDimValue] = useState("800");

  const selected = editor.selected;

  useEffect(() => {
    const unsub1 = editor.signals.objectSelected.add(() => setTick((t) => t + 1));
    const unsub2 = editor.signals.objectChanged.add(() => setTick((t) => t + 1));
    const unsub3 = editor.signals.rulerVisibilityChanged.add(() => setTick((t) => t + 1));
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [editor]);

  if (!selected) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-500 text-xs px-4">
        <Box className="w-8 h-8 mb-2 opacity-30" />
        <span>未选择对象</span>
        <span className="text-[11px] text-neutral-600 mt-1">
          在 3D 视口中点击模型或在场景树中选择
        </span>
      </div>
    );
  }

  const pos = selected.position;
  const rot = selected.rotation;
  const scale = selected.scale;

  // Convert rotation to degrees for display
  const rotDeg = {
    x: Math.round(THREE.MathUtils.radToDeg(rot.x) * 10) / 10,
    y: Math.round(THREE.MathUtils.radToDeg(rot.y) * 10) / 10,
    z: Math.round(THREE.MathUtils.radToDeg(rot.z) * 10) / 10,
  };

  // Calculate bounding box dimensions in mm
  const box = new THREE.Box3().setFromObject(selected);
  const hasValidBounds = !box.isEmpty() && isFinite(box.min.x);
  const dim = {
    x: hasValidBounds ? Math.round((box.max.x - box.min.x) * 10) / 10 : 0,
    y: hasValidBounds ? Math.round((box.max.y - box.min.y) * 10) / 10 : 0,
    z: hasValidBounds ? Math.round((box.max.z - box.min.z) * 10) / 10 : 0,
  };

  const handlePositionChange = (axis: "x" | "y" | "z", val: number) => {
    const newPos = pos.clone();
    newPos[axis] = val;
    const cmd = new SetPositionCommand(editor, selected, newPos);
    editor.execute(cmd);
  };

  const handleRotationChange = (axis: "x" | "y" | "z", deg: number) => {
    const newRot = rot.clone();
    newRot[axis] = THREE.MathUtils.degToRad(deg);
    const cmd = new SetRotationCommand(editor, selected, newRot);
    editor.execute(cmd);
  };

  const handleScaleChange = (axis: "x" | "y" | "z", val: number) => {
    const clampedVal = Math.max(0.0001, val);
    if (uniformLocked) {
      const currentVal = scale[axis] || 1;
      const factor = clampedVal / currentVal;
      const newScale = scale.clone().multiplyScalar(factor);
      editor.execute(new SetScaleCommand(editor, selected, newScale));
    } else {
      const newScale = scale.clone();
      newScale[axis] = clampedVal;
      editor.execute(new SetScaleCommand(editor, selected, newScale));
    }
  };

  const handleApplyUniformMultiplier = (multiplier: number) => {
    if (multiplier <= 0) return;
    editor.scaleSelected(multiplier);
  };

  const handleScaleToTargetDim = () => {
    const targetVal = parseFloat(targetDimValue);
    if (!targetVal || targetVal <= 0) return;
    editor.scaleSelectedToDimension(targetDimAxis, targetVal);
  };

  const handleResetTransform = () => {
    editor.execute(new SetPositionCommand(editor, selected, new THREE.Vector3(0, 0, 0)));
    editor.execute(new SetRotationCommand(editor, selected, new THREE.Euler(0, 0, 0)));
    editor.execute(new SetScaleCommand(editor, selected, new THREE.Vector3(1, 1, 1)));
  };

  return (
    <div className="flex flex-col space-y-4 p-3 text-xs text-neutral-300">
      {/* Name and Basic Details */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
          对象标识
        </label>
        <div>
          <span className="text-[10px] text-neutral-500 block mb-1">名称:</span>
          <input
            type="text"
            defaultValue={selected.name || "Object"}
            key={selected.uuid + selected.name}
            onBlur={(e) => {
              if (e.target.value !== selected.name) {
                editor.execute(new RenameObjectCommand(editor, selected, e.target.value));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-full bg-[#18191c] border border-[#33373e] rounded px-2 py-1 text-neutral-200 text-xs focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-400 pt-1">
          <div>
            <span className="text-neutral-500">类型:</span>{" "}
            <span className="text-neutral-200 font-mono">{selected.type}</span>
          </div>
          <div>
            <span className="text-neutral-500">UUID:</span>{" "}
            <span className="text-neutral-400 font-mono text-[10px] truncate block">
              {selected.uuid.substring(0, 8)}...
            </span>
          </div>
        </div>
      </div>

      <div className="h-[1px] bg-[#2e3238]" />

      {/* Position (mm) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-neutral-400 flex items-center space-x-1">
            <Move className="w-3 h-3 text-blue-400" />
            <span>位置 (Position mm)</span>
          </label>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(["x", "y", "z"] as const).map((axis) => (
            <div key={axis} className="flex items-center bg-[#18191c] border border-[#33373e] rounded px-1.5 py-0.5">
              <span className="text-[10px] font-bold text-neutral-500 uppercase mr-1">{axis}:</span>
              <input
                type="number"
                step="5"
                value={Math.round(pos[axis] * 10) / 10}
                onChange={(e) => handlePositionChange(axis, parseFloat(e.target.value) || 0)}
                className="w-full bg-transparent text-neutral-200 text-xs focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Rotation (degrees) & Parameters */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-neutral-400 flex items-center space-x-1">
            <RotateCcw className="w-3 h-3 text-emerald-400" />
            <span>旋转参数 (Rotation °)</span>
          </label>
          <button
            onClick={() => editor.resetRotationSelected()}
            className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
            title="将三轴旋转重置为 0°"
          >
            归零 (0°)
          </button>
        </div>

        {/* Axis Inputs with Quick 90deg Adjusters */}
        <div className="space-y-1">
          {(["x", "y", "z"] as const).map((axis) => {
            const axisColor =
              axis === "x" ? "text-red-400" : axis === "y" ? "text-emerald-400" : "text-blue-400";
            return (
              <div
                key={axis}
                className="flex items-center justify-between bg-[#18191c] border border-[#33373e] rounded px-1.5 py-1"
              >
                <div className="flex items-center flex-1 mr-2">
                  <span className={`text-[10px] font-bold uppercase mr-1.5 ${axisColor}`}>
                    {axis}:
                  </span>
                  <input
                    type="number"
                    step="15"
                    value={rotDeg[axis]}
                    onChange={(e) => handleRotationChange(axis, parseFloat(e.target.value) || 0)}
                    className="w-full bg-transparent text-neutral-200 text-xs focus:outline-none font-mono"
                  />
                  <span className="text-[10px] text-neutral-500">°</span>
                </div>
                {/* Quick Step Buttons for Axis */}
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => editor.rotateSelected(axis, -90)}
                    title={`${axis.toUpperCase()} 轴 -90°`}
                    className="px-1.5 py-0.5 bg-[#22252a] hover:bg-[#2c3036] border border-[#33373e] rounded text-[10px] font-mono text-neutral-300 hover:text-white transition-colors"
                  >
                    -90°
                  </button>
                  <button
                    onClick={() => editor.rotateSelected(axis, 90)}
                    title={`${axis.toUpperCase()} 轴 +90°`}
                    className="px-1.5 py-0.5 bg-[#22252a] hover:bg-[#2c3036] border border-[#33373e] rounded text-[10px] font-mono text-neutral-300 hover:text-white transition-colors"
                  >
                    +90°
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* One-Click 90° Presets for Engineering & Furniture */}
        <div className="bg-[#18191c] border border-[#2e3238] rounded p-2 space-y-2">
          <div className="flex items-center justify-between text-[10px] text-neutral-400">
            <span className="flex items-center space-x-1">
              <Compass className="w-3 h-3 text-emerald-400" />
              <span>常用 90° 旋转与姿态对齐:</span>
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => editor.rotateSelected("y", 90)}
              className="py-1 px-1 bg-[#22252a] hover:bg-[#2e3238] border border-[#373b42] rounded text-[10px] text-emerald-300 hover:text-emerald-200 text-center font-mono transition-colors"
              title="水平顺转 90°"
            >
              水平 +90°
            </button>
            <button
              onClick={() => editor.rotateSelected("y", -90)}
              className="py-1 px-1 bg-[#22252a] hover:bg-[#2e3238] border border-[#373b42] rounded text-[10px] text-emerald-300 hover:text-emerald-200 text-center font-mono transition-colors"
              title="水平逆转 90°"
            >
              水平 -90°
            </button>
            <button
              onClick={() => editor.rotateSelected("y", 180)}
              className="py-1 px-1 bg-[#22252a] hover:bg-[#2e3238] border border-[#373b42] rounded text-[10px] text-amber-300 hover:text-amber-200 text-center font-mono transition-colors"
              title="水平掉头 180°"
            >
              掉头 180°
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => editor.rotateSelected("x", 90)}
              className="py-1 px-1 bg-[#22252a] hover:bg-[#2e3238] border border-[#373b42] rounded text-[10px] text-blue-300 hover:text-blue-200 text-center font-mono transition-colors"
              title="绕 X 轴立起 90°"
            >
              立起 X+90°
            </button>
            <button
              onClick={() => editor.rotateSelected("x", -90)}
              className="py-1 px-1 bg-[#22252a] hover:bg-[#2e3238] border border-[#373b42] rounded text-[10px] text-blue-300 hover:text-blue-200 text-center font-mono transition-colors"
              title="绕 X 轴放平 -90°"
            >
              平放 X-90°
            </button>
            <button
              onClick={() => editor.rotateSelected("z", 90)}
              className="py-1 px-1 bg-[#22252a] hover:bg-[#2e3238] border border-[#373b42] rounded text-[10px] text-purple-300 hover:text-purple-200 text-center font-mono transition-colors"
              title="侧向法旋 90°"
            >
              侧旋 Z+90°
            </button>
          </div>

          {/* Quick Cardinal Orientation */}
          <div className="flex items-center justify-between pt-1 border-t border-[#26282e]">
            <span className="text-[10px] text-neutral-500">面朝向:</span>
            <div className="flex space-x-1">
              {[
                { label: "正视 0°", deg: 0 },
                { label: "右视 90°", deg: 90 },
                { label: "背视 180°", deg: 180 },
                { label: "左视 -90°", deg: -90 },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => editor.setRotationSelected("y", item.deg)}
                  className="px-1.5 py-0.5 bg-[#1e2025] hover:bg-[#282b32] border border-[#33373e] rounded text-[9px] text-neutral-300 font-mono transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="h-[1px] bg-[#2e3238]" />

      {/* 3D Physical Dimensions & CAD Ruler */}
      <div className="space-y-2 bg-[#18191c] border border-[#2e3238] rounded p-2.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-neutral-300 flex items-center space-x-1.5">
            <Ruler className="w-3.5 h-3.5 text-amber-400" />
            <span>三维物理尺寸 (mm)</span>
          </label>
          <button
            onClick={() => editor.setShowRulers(!editor.showRulers)}
            className={`flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] transition-colors border ${
              editor.showRulers
                ? "bg-amber-950/60 border-amber-600/60 text-amber-300 font-medium"
                : "bg-[#22252a] border-[#33373e] text-neutral-400 hover:text-neutral-200"
            }`}
            title="在 3D 视口中显示/隐藏 CAD 三维尺寸标尺标注线"
          >
            <Ruler className="w-3 h-3" />
            <span>{editor.showRulers ? "3D标尺: 显示中" : "3D标尺: 已隐藏"}</span>
          </button>
        </div>

        {/* Dimension Badges (X, Y, Z in mm) */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className="bg-[#202329] border border-red-900/40 rounded p-1.5 text-center">
            <span className="text-[9px] text-red-400 font-semibold block uppercase">长 (X 轴)</span>
            <span className="text-xs font-mono font-bold text-neutral-100">{dim.x}</span>
            <span className="text-[9px] text-neutral-500 ml-0.5">mm</span>
          </div>
          <div className="bg-[#202329] border border-emerald-900/40 rounded p-1.5 text-center">
            <span className="text-[9px] text-emerald-400 font-semibold block uppercase">深 (Y 轴)</span>
            <span className="text-xs font-mono font-bold text-neutral-100">{dim.y}</span>
            <span className="text-[9px] text-neutral-500 ml-0.5">mm</span>
          </div>
          <div className="bg-[#202329] border border-blue-900/40 rounded p-1.5 text-center">
            <span className="text-[9px] text-blue-400 font-semibold block uppercase">高 (Z 轴)</span>
            <span className="text-xs font-mono font-bold text-neutral-100">{dim.z}</span>
            <span className="text-[9px] text-neutral-500 ml-0.5">mm</span>
          </div>
        </div>

        {/* Scale to Specific Target Dimension */}
        <div className="bg-[#202329] border border-[#33373e] rounded p-1.5 space-y-1.5">
          <span className="text-[10px] text-neutral-400 block font-medium">按目标尺寸等比缩放:</span>
          <div className="flex items-center space-x-1.5">
            <select
              value={targetDimAxis}
              onChange={(e) => setTargetDimAxis(e.target.value as "x" | "y" | "z")}
              className="bg-[#18191c] text-neutral-200 text-[10px] rounded px-1.5 py-1 border border-[#33373e] outline-none"
            >
              <option value="x">长 (X 轴)</option>
              <option value="y">深 (Y 轴)</option>
              <option value="z">高 (Z 轴)</option>
            </select>
            <div className="flex-1 flex items-center bg-[#18191c] border border-[#33373e] rounded px-1.5 py-0.5">
              <input
                type="number"
                value={targetDimValue}
                onChange={(e) => setTargetDimValue(e.target.value)}
                placeholder="例如 800"
                className="w-full bg-transparent text-neutral-100 text-xs font-mono focus:outline-none"
              />
              <span className="text-[10px] text-neutral-500">mm</span>
            </div>
            <button
              onClick={handleScaleToTargetDim}
              className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10px] font-medium transition-colors whitespace-nowrap shadow-sm"
              title="按指定毫米尺寸等比缩放整个模型"
            >
              等比缩放
            </button>
          </div>
        </div>
      </div>

      <div className="h-[1px] bg-[#2e3238]" />

      {/* Scale & Multiplier Controls */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-neutral-300 flex items-center space-x-1">
            <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
            <span>缩放参数 (Scale)</span>
          </label>
          <button
            onClick={() => setUniformLocked(!uniformLocked)}
            className={`flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
              uniformLocked
                ? "bg-blue-950/60 border-blue-600/60 text-blue-300 font-medium"
                : "bg-[#22252a] border-[#33373e] text-neutral-400 hover:text-neutral-200"
            }`}
            title="锁定后调整任意轴将自动整体等比缩放"
          >
            {uniformLocked ? <Link2 className="w-3 h-3 text-blue-400" /> : <Unlink className="w-3 h-3 text-neutral-500" />}
            <span>{uniformLocked ? "等比联动: 开" : "自由单轴: 开"}</span>
          </button>
        </div>

        {/* Quick Multiplier Buttons */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-neutral-400">
            <span className="flex items-center space-x-1">
              <Scaling className="w-3 h-3 text-amber-400" />
              <span>快速放大/缩小倍数:</span>
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {[0.1, 0.5, 2, 5].map((factor) => (
              <button
                key={factor}
                onClick={() => handleApplyUniformMultiplier(factor)}
                className="py-1 bg-[#1e2025] hover:bg-[#282b32] border border-[#33373e] rounded text-[10px] font-mono text-neutral-200 hover:text-white transition-colors"
                title={`整体乘以 ${factor} 倍`}
              >
                ×{factor}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => handleApplyUniformMultiplier(10)}
              className="py-1 bg-[#1e2025] hover:bg-[#282b32] border border-[#33373e] rounded text-[10px] font-mono text-amber-300 hover:text-amber-200 transition-colors"
              title="整体放大 10 倍"
            >
              ×10 倍
            </button>
            <button
              onClick={() => handleApplyUniformMultiplier(100)}
              className="py-1 bg-[#1e2025] hover:bg-[#282b32] border border-[#33373e] rounded text-[10px] font-mono text-amber-300 hover:text-amber-200 transition-colors"
              title="整体放大 100 倍"
            >
              ×100 倍
            </button>
            <button
              onClick={() => handleApplyUniformMultiplier(1000)}
              className="py-1 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-600/60 rounded text-[10px] font-mono text-amber-200 font-semibold transition-colors"
              title="针对以米(m)建模导出的模型，一键转换为工程毫米(mm)"
            >
              ×1000(米→毫米)
            </button>
          </div>

          {/* Smart Fit & Custom Multiplier Input */}
          <div className="grid grid-cols-2 gap-1 pt-1">
            <button
              onClick={() => editor.autoFitSelectedToMm(800)}
              className="py-1 px-1 bg-blue-950/40 hover:bg-blue-900/50 border border-blue-600/50 rounded text-[10px] text-blue-200 font-medium transition-colors"
              title="自动将模型长边等比缩放至 800mm 常用家具尺度并居中"
            >
              自适应家具(800mm)
            </button>
            <button
              onClick={() => editor.setUniformScaleSelected(1.0)}
              className="py-1 px-1 bg-[#22252a] hover:bg-[#2c3036] border border-[#33373e] rounded text-[10px] text-neutral-300 hover:text-white transition-colors"
              title="重置缩放比例为 1.0"
            >
              重置比例 (1.0)
            </button>
          </div>

          <div className="flex items-center space-x-1.5 pt-1">
            <span className="text-[10px] text-neutral-400 whitespace-nowrap">自定义倍率:</span>
            <div className="flex-1 flex items-center bg-[#18191c] border border-[#33373e] rounded px-1.5 py-0.5">
              <span className="text-[10px] text-neutral-500 mr-1 font-mono">×</span>
              <input
                type="number"
                step="0.5"
                value={uniformMultiplier}
                onChange={(e) => setUniformMultiplier(e.target.value)}
                className="w-full bg-transparent text-neutral-100 text-xs font-mono focus:outline-none"
              />
            </div>
            <button
              onClick={() => handleApplyUniformMultiplier(parseFloat(uniformMultiplier) || 1)}
              className="px-2 py-0.5 bg-[#25282e] hover:bg-[#2e3238] border border-[#373b42] rounded text-[10px] text-neutral-200 hover:text-white transition-colors"
            >
              放大
            </button>
            <button
              onClick={() => {
                const m = parseFloat(uniformMultiplier);
                if (m > 0) handleApplyUniformMultiplier(1 / m);
              }}
              className="px-2 py-0.5 bg-[#25282e] hover:bg-[#2e3238] border border-[#373b42] rounded text-[10px] text-neutral-200 hover:text-white transition-colors"
            >
              缩小
            </button>
          </div>
        </div>

        {/* X, Y, Z Axis Inputs */}
        <div className="pt-1">
          <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1">
            <span>当前三轴缩放比 (Scale XYZ):</span>
            {uniformLocked && <span className="text-blue-400 text-[9px]">已等比锁定</span>}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(["x", "y", "z"] as const).map((axis) => {
              const axisColor =
                axis === "x" ? "text-red-400" : axis === "y" ? "text-emerald-400" : "text-blue-400";
              return (
                <div key={axis} className="flex items-center bg-[#18191c] border border-[#33373e] rounded px-1.5 py-0.5">
                  <span className={`text-[10px] font-bold uppercase mr-1 ${axisColor}`}>{axis}:</span>
                  <input
                    type="number"
                    step="0.1"
                    value={Math.round(scale[axis] * 100) / 100}
                    onChange={(e) => handleScaleChange(axis, parseFloat(e.target.value) || 1)}
                    className="w-full bg-transparent text-neutral-200 text-xs focus:outline-none font-mono"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="h-[1px] bg-[#2e3238]" />

      {/* Rendering flags */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
          渲染状态
        </label>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.visible}
              onChange={(e) => {
                selected.visible = e.target.checked;
                editor.signals.sceneGraphChanged.dispatch();
                editor.signals.objectChanged.dispatch(selected);
              }}
              className="rounded bg-[#18191c] border-[#33373e] text-blue-600 focus:ring-0"
            />
            <span className="text-neutral-300">可见性</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.castShadow}
              onChange={(e) => {
                selected.castShadow = e.target.checked;
                editor.signals.objectChanged.dispatch(selected);
              }}
              className="rounded bg-[#18191c] border-[#33373e] text-blue-600 focus:ring-0"
            />
            <span className="text-neutral-300">投射阴影</span>
          </label>
        </div>
      </div>

      <div className="h-[1px] bg-[#2e3238]" />

      {/* Quick Actions */}
      <div className="flex items-center space-x-2 pt-1">
        <button
          onClick={handleResetTransform}
          className="flex-1 py-1 px-2 bg-[#25282e] hover:bg-[#2e3238] border border-[#373b42] rounded text-neutral-300 text-xs font-medium transition-colors"
        >
          重置变换
        </button>
        <button
          onClick={() => editor.focus(selected)}
          className="p-1 px-2.5 bg-[#25282e] hover:bg-[#2e3238] border border-[#373b42] rounded text-neutral-300 transition-colors"
          title="聚焦对象 (F)"
        >
          <Focus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => editor.deleteSelected()}
          className="p-1 px-2.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 text-red-300 rounded transition-colors"
          title="删除对象 (Del)"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
