import React, { useState, useEffect } from "react";
import * as THREE from "three";
import { Box, Sparkles, RefreshCw, Compass } from "lucide-react";
import type { Engineering3DEditor } from "../../Engineering3DEditor.js";

interface GeometryTabProps {
  editor: Engineering3DEditor;
}

export const GeometryTab: React.FC<GeometryTabProps> = ({ editor }) => {
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
        <Box className="w-8 h-8 mb-2 opacity-30" />
        <span>未选择网格对象</span>
      </div>
    );
  }

  // Find mesh or geometries in selected
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

  if (!mesh || !mesh.geometry) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-500 text-xs px-4">
        <Box className="w-8 h-8 mb-2 opacity-30" />
        <span>选中对象无有效几何体</span>
        <span className="text-[11px] text-neutral-600 mt-1">
          当前选中节点不包含 THREE.BufferGeometry
        </span>
      </div>
    );
  }

  const geom = mesh.geometry;
  geom.computeBoundingBox();
  const bbox = geom.boundingBox || new THREE.Box3();
  const size = new THREE.Vector3();
  bbox.getSize(size);

  const vertCount = geom.attributes.position ? geom.attributes.position.count : 0;
  const triCount = geom.index ? geom.index.count / 3 : vertCount / 3;

  const handleComputeNormals = () => {
    geom.computeVertexNormals();
    if (geom.attributes.normal) {
      geom.attributes.normal.needsUpdate = true;
    }
    editor.signals.objectChanged.dispatch(selected);
  };

  const handleCenterGeometry = () => {
    geom.center();
    geom.computeBoundingBox();
    editor.signals.objectChanged.dispatch(selected);
  };

  return (
    <div className="flex flex-col space-y-4 p-3 text-xs text-neutral-300">
      {/* Geometry Overview */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
          几何体概要
        </label>
        <div className="grid grid-cols-2 gap-2 text-[11px] bg-[#18191c] p-2 rounded border border-[#2e3238]">
          <div>
            <span className="text-neutral-500 block">几何类型:</span>
            <span className="text-neutral-200 font-mono">{geom.type}</span>
          </div>
          <div>
            <span className="text-neutral-500 block">UUID:</span>
            <span className="text-neutral-400 font-mono text-[10px] truncate block">
              {geom.uuid.substring(0, 8)}...
            </span>
          </div>
          <div>
            <span className="text-neutral-500 block">顶点数量 (Vertices):</span>
            <span className="text-neutral-200 font-mono font-medium">
              {vertCount.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-neutral-500 block">三角面数 (Triangles):</span>
            <span className="text-neutral-200 font-mono font-medium text-blue-400">
              {Math.round(triCount).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <div className="h-[1px] bg-[#2e3238]" />

      {/* Bounding Box Dimensions (mm) */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center space-x-1">
          <Compass className="w-3.5 h-3.5 text-blue-400" />
          <span>几何边界尺寸 (Bounding Dimensions mm)</span>
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          <div className="bg-[#18191c] border border-[#2e3238] rounded p-1.5 text-center">
            <span className="text-[10px] text-neutral-500 uppercase block">宽度 (X)</span>
            <span className="text-neutral-200 font-mono font-semibold">
              {Math.round(size.x * 10) / 10}
            </span>
          </div>
          <div className="bg-[#18191c] border border-[#2e3238] rounded p-1.5 text-center">
            <span className="text-[10px] text-neutral-500 uppercase block">深度 (Y)</span>
            <span className="text-neutral-200 font-mono font-semibold">
              {Math.round(size.y * 10) / 10}
            </span>
          </div>
          <div className="bg-[#18191c] border border-[#2e3238] rounded p-1.5 text-center">
            <span className="text-[10px] text-neutral-500 uppercase block">高度 (Z)</span>
            <span className="text-neutral-200 font-mono font-semibold text-emerald-400">
              {Math.round(size.z * 10) / 10}
            </span>
          </div>
        </div>
      </div>

      <div className="h-[1px] bg-[#2e3238]" />

      {/* Geometry Operations */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
          几何体优化操作
        </label>
        <div className="space-y-1.5">
          <button
            onClick={handleComputeNormals}
            className="w-full py-1.5 px-2.5 bg-[#25282e] hover:bg-[#2e3238] border border-[#373b42] rounded text-left flex items-center justify-between text-neutral-200 transition-colors"
          >
            <span className="flex items-center space-x-2">
              <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
              <span>重新计算表面法线 (Vertex Normals)</span>
            </span>
          </button>
          <button
            onClick={handleCenterGeometry}
            className="w-full py-1.5 px-2.5 bg-[#25282e] hover:bg-[#2e3238] border border-[#373b42] rounded text-left flex items-center justify-between text-neutral-200 transition-colors"
          >
            <span className="flex items-center space-x-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>几何体中心原点对齐 (Center Geometry)</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
