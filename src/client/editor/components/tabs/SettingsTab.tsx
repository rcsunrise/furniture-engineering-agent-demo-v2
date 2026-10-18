import React, { useState } from "react";
import * as THREE from "three";
import { Settings, Magnet, Palette, Grid } from "lucide-react";
import type { Engineering3DEditor } from "../../Engineering3DEditor.js";

interface SettingsTabProps {
  editor: Engineering3DEditor;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ editor }) => {
  const [, setTick] = useState(0);

  const snaps = editor.snapSettings;
  const gridVisible = editor.gridHelper.visible;
  const axesVisible = editor.axesHelper.visible;
  const bgColor = `#${(editor.scene.background as THREE.Color)?.getHexString?.() || "18191c"}`;

  const handleBgColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    editor.scene.background = new THREE.Color(e.target.value);
    setTick((t) => t + 1);
  };

  return (
    <div className="flex flex-col space-y-4 p-3 text-xs text-neutral-300">
      {/* 1. Viewport & Grid */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center space-x-1">
          <Grid className="w-3.5 h-3.5 text-blue-400" />
          <span>视口与网格 (Viewport & Grid)</span>
        </label>

        <div className="space-y-2 bg-[#18191c] p-2.5 rounded border border-[#2e3238]">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-neutral-300">显示地面参考网格</span>
            <input
              type="checkbox"
              checked={gridVisible}
              onChange={(e) => {
                editor.gridHelper.visible = e.target.checked;
                editor.signals.sceneGraphChanged.dispatch();
                setTick((t) => t + 1);
              }}
              className="rounded bg-[#18191c] border-[#33373e] text-blue-600 focus:ring-0"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-neutral-300">显示坐标轴向指示 (Axes)</span>
            <input
              type="checkbox"
              checked={axesVisible}
              onChange={(e) => {
                editor.axesHelper.visible = e.target.checked;
                editor.signals.sceneGraphChanged.dispatch();
                setTick((t) => t + 1);
              }}
              className="rounded bg-[#18191c] border-[#33373e] text-blue-600 focus:ring-0"
            />
          </label>

          <div className="flex items-center justify-between pt-1">
            <span className="text-neutral-400 text-[11px]">背景颜色:</span>
            <div className="flex items-center space-x-1.5">
              <input
                type="color"
                value={bgColor}
                onChange={handleBgColorChange}
                className="w-5 h-5 rounded border border-neutral-700 cursor-pointer bg-transparent"
              />
              <span className="font-mono text-[11px] text-neutral-400 uppercase">{bgColor}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="h-[1px] bg-[#2e3238]" />

      {/* 2. Snapping Presets */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center space-x-1">
          <Magnet className="w-3.5 h-3.5 text-amber-400" />
          <span>变换吸附参数 (Transform Snapping)</span>
        </label>

        <div className="space-y-2.5 bg-[#18191c] p-2.5 rounded border border-[#2e3238]">
          <div className="flex items-center justify-between">
            <span className="text-neutral-400 text-[11px]">平移吸附 (Position Snap):</span>
            <select
              value={snaps.positionSnap ?? "off"}
              onChange={(e) => {
                editor.setSnapSettings({
                  positionSnap: e.target.value === "off" ? null : Number(e.target.value),
                });
                setTick((t) => t + 1);
              }}
              className="bg-[#22252a] text-neutral-200 text-xs rounded px-2 py-1 border border-[#33373e] outline-none"
            >
              <option value="off">关闭 (无吸附)</option>
              <option value="1">1 mm</option>
              <option value="5">5 mm</option>
              <option value="10">10 mm</option>
              <option value="50">50 mm</option>
              <option value="100">100 mm</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-neutral-400 text-[11px]">旋转吸附 (Rotation Snap):</span>
            <select
              value={snaps.rotationSnap ?? "off"}
              onChange={(e) => {
                editor.setSnapSettings({
                  rotationSnap: e.target.value === "off" ? null : Number(e.target.value),
                });
                setTick((t) => t + 1);
              }}
              className="bg-[#22252a] text-neutral-200 text-xs rounded px-2 py-1 border border-[#33373e] outline-none"
            >
              <option value="off">关闭 (自由旋转)</option>
              <option value="5">5°</option>
              <option value="15">15°</option>
              <option value="45">45°</option>
              <option value="90">90°</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-neutral-400 text-[11px]">缩放吸附 (Scale Snap):</span>
            <select
              value={snaps.scaleSnap ?? "off"}
              onChange={(e) => {
                editor.setSnapSettings({
                  scaleSnap: e.target.value === "off" ? null : Number(e.target.value),
                });
                setTick((t) => t + 1);
              }}
              className="bg-[#22252a] text-neutral-200 text-xs rounded px-2 py-1 border border-[#33373e] outline-none"
            >
              <option value="off">关闭</option>
              <option value="0.05">0.05</option>
              <option value="0.1">0.1</option>
              <option value="0.25">0.25</option>
            </select>
          </div>
        </div>
      </div>

      <div className="h-[1px] bg-[#2e3238]" />

      {/* 3. Engineering Unit Protocol */}
      <div className="space-y-1 bg-[#18191c] p-2.5 rounded border border-[#2e3238] text-[11px]">
        <div className="flex items-center justify-between text-neutral-400">
          <span>工程基准单位:</span>
          <span className="text-neutral-200 font-mono font-semibold">毫米 (mm)</span>
        </div>
        <div className="flex items-center justify-between text-neutral-400">
          <span>轴向规范:</span>
          <span className="text-neutral-200 font-mono font-semibold">Z = 垂直向上 (Z-UP)</span>
        </div>
      </div>
    </div>
  );
};
