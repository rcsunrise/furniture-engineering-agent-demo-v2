import React, { useState, useEffect } from "react";
import * as THREE from "three";
import { Palette, Layers } from "lucide-react";
import type { Engineering3DEditor } from "../../Engineering3DEditor.js";

interface MaterialTabProps {
  editor: Engineering3DEditor;
}

export const MaterialTab: React.FC<MaterialTabProps> = ({ editor }) => {
  const [, setTick] = useState(0);

  const selected = editor.selected;

  useEffect(() => {
    const unsub1 = editor.signals.objectSelected.add(() => setTick((t) => t + 1));
    const unsub2 = editor.signals.objectChanged.add(() => setTick((t) => t + 1));
    return () => {
      unsub1();
      unsub2();
    };
  }, [editor]);

  if (!selected) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-500 text-xs px-4">
        <Palette className="w-8 h-8 mb-2 opacity-30" />
        <span>未选择网格对象</span>
      </div>
    );
  }

  // Find mesh or material
  let mesh: THREE.Mesh | null = null;
  if ((selected as THREE.Mesh).isMesh) {
    mesh = selected as THREE.Mesh;
  } else {
    selected.traverse((c) => {
      if (!mesh && (c as THREE.Mesh).isMesh) {
        mesh = c as THREE.Mesh;
      }
    });
  }

  if (!mesh || !mesh.material) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-500 text-xs px-4">
        <Palette className="w-8 h-8 mb-2 opacity-30" />
        <span>选中对象无有效材质</span>
      </div>
    );
  }

  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const stdMat = mat as THREE.MeshStandardMaterial;

  const hexColor = stdMat.color ? `#${stdMat.color.getHexString()}` : "#cccccc";

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (stdMat.color) {
      stdMat.color.set(e.target.value);
      stdMat.needsUpdate = true;
      editor.signals.objectChanged.dispatch(selected);
      setTick((t) => t + 1);
    }
  };

  const handleRoughnessChange = (val: number) => {
    if (stdMat.roughness !== undefined) {
      stdMat.roughness = val;
      stdMat.needsUpdate = true;
      editor.signals.objectChanged.dispatch(selected);
      setTick((t) => t + 1);
    }
  };

  const handleMetalnessChange = (val: number) => {
    if (stdMat.metalness !== undefined) {
      stdMat.metalness = val;
      stdMat.needsUpdate = true;
      editor.signals.objectChanged.dispatch(selected);
      setTick((t) => t + 1);
    }
  };

  const handleOpacityChange = (val: number) => {
    stdMat.opacity = val;
    stdMat.transparent = val < 1.0;
    stdMat.needsUpdate = true;
    editor.signals.objectChanged.dispatch(selected);
    setTick((t) => t + 1);
  };

  const handleWireframeToggle = (wireframe: boolean) => {
    stdMat.wireframe = wireframe;
    stdMat.needsUpdate = true;
    editor.signals.objectChanged.dispatch(selected);
    setTick((t) => t + 1);
  };

  return (
    <div className="flex flex-col space-y-4 p-3 text-xs text-neutral-300">
      {/* Material Type Overview */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
          材质属性
        </label>
        <div className="grid grid-cols-2 gap-2 text-[11px] bg-[#18191c] p-2 rounded border border-[#2e3238]">
          <div>
            <span className="text-neutral-500 block">材质名称:</span>
            <span className="text-neutral-200 font-medium truncate block">
              {mat.name || "Default Material"}
            </span>
          </div>
          <div>
            <span className="text-neutral-500 block">材质类型:</span>
            <span className="text-neutral-200 font-mono">{mat.type}</span>
          </div>
        </div>
      </div>

      <div className="h-[1px] bg-[#2e3238]" />

      {/* Color Picker */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-neutral-400 flex items-center justify-between">
          <span>基础颜色 (Base Color)</span>
          <span className="font-mono text-neutral-400 uppercase">{hexColor}</span>
        </label>
        <div className="flex items-center space-x-2 bg-[#18191c] border border-[#2e3238] rounded p-1.5">
          <input
            type="color"
            value={hexColor}
            onChange={handleColorChange}
            className="w-7 h-7 rounded border border-neutral-700 cursor-pointer bg-transparent"
          />
          <span className="text-xs text-neutral-300 font-mono">{hexColor}</span>
        </div>
      </div>

      {/* Roughness */}
      {stdMat.roughness !== undefined && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-neutral-400">粗糙度 (Roughness):</span>
            <span className="font-mono text-neutral-200">
              {Math.round(stdMat.roughness * 100) / 100}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={stdMat.roughness}
            onChange={(e) => handleRoughnessChange(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-[#2e3238] rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
      )}

      {/* Metalness */}
      {stdMat.metalness !== undefined && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-neutral-400">金属度 (Metalness):</span>
            <span className="font-mono text-neutral-200">
              {Math.round(stdMat.metalness * 100) / 100}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={stdMat.metalness}
            onChange={(e) => handleMetalnessChange(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-[#2e3238] rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
      )}

      {/* Opacity */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-neutral-400">不透明度 (Opacity):</span>
          <span className="font-mono text-neutral-200">
            {Math.round(stdMat.opacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0.05"
          max="1"
          step="0.05"
          value={stdMat.opacity}
          onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-[#2e3238] rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>

      <div className="h-[1px] bg-[#2e3238]" />

      {/* Wireframe toggle */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-neutral-300 text-xs">线框显示 (Wireframe)</span>
        <input
          type="checkbox"
          checked={!!stdMat.wireframe}
          onChange={(e) => handleWireframeToggle(e.target.checked)}
          className="rounded bg-[#18191c] border-[#33373e] text-blue-600 focus:ring-0"
        />
      </div>
    </div>
  );
};
