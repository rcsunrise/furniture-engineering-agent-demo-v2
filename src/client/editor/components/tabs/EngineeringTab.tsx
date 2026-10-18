import React, { useState, useEffect } from "react";
import * as THREE from "three";
import {
  FileCode2,
  Compass,
  Scissors,
  Share2,
  ShieldCheck,
  AlertTriangle,
  Layers,
  ArrowRight,
} from "lucide-react";
import type { Engineering3DEditor } from "../../Engineering3DEditor.js";
import { AssignEngineeringComponentCommand } from "../../commands/index.js";
import { CoordinateSystemAdapter } from "../../../utils/3d/coordinateSystemAdapter.js";
import { ModelSplitService } from "../../../utils/3d/modelSplitService.js";
import { findBestExactComponentMatch, validateObjectAgainstComponent } from "../../../utils/3d/engineeringMeshValidator.js";
import { threeToFesDimensions } from "../../../../shared/canonicalCoordinateContract.js";

interface EngineeringTabProps {
  editor: Engineering3DEditor;
  assemblyDoc?: any;
}

export const EngineeringTab: React.FC<EngineeringTabProps> = ({ editor, assemblyDoc }) => {
  const [, setTick] = useState(0);

  const selected = editor.selected;

  useEffect(() => {
    const unsub1 = editor.signals.objectSelected.add(() => setTick((t) => t + 1));
    const unsub2 = editor.signals.objectChanged.add(() => setTick((t) => t + 1));
    const unsub3 = editor.signals.engineeringDataChanged.add(() => setTick((t) => t + 1));
    const unsub4 = editor.signals.explodeChanged.add(() => setTick((t) => t + 1));
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [editor]);

  if (!selected) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-500 text-xs px-4">
        <FileCode2 className="w-8 h-8 mb-2 opacity-30" />
        <span>未选择对象</span>
        <span className="text-[11px] text-neutral-600 mt-1">
          请选择一个 3D 模型实例进行工程参数绑定与校验
        </span>
      </div>
    );
  }

  // 3D Geometry Dimensions
  selected.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(selected);
  const size = new THREE.Vector3();
  box.getSize(size);

  const boundCompId = selected.userData?.canonicalComponentId || "";
  const boundComponent = assemblyDoc?.components?.find((c: any) => c.id === boundCompId);
  const validation = boundComponent ? validateObjectAgainstComponent(selected, boundComponent) : null;

  // Canonical dimensions according to G4-6D Contract:
  // Three.js X = Width, Y = Height (Up), Z = Depth.
  // FES X = Width, Y = Depth, Z = Height.
  const isAlreadyFesUp = selected.userData?.canonicalCoordinates?.targetUp === "FES" ||
    selected.userData?.targetUp === "FES" ||
    selected.name?.includes("CoordinateAdapter_");

  const fesDimensions = isAlreadyFesUp
    ? { x: size.x, y: size.y, z: size.z }
    : threeToFesDimensions({ x: size.x, y: size.y, z: size.z });

  const handleAutoBind = () => {
    const match = findBestExactComponentMatch(selected, assemblyDoc?.components || []);
    if (!match) return;
    handleBindComponent(match.id);
  };

  const handleBatchAutoBind = () => {
    const components = assemblyDoc?.components || [];
    if (components.length === 0) {
      alert("当前装配体文档中无可用构件。");
      return;
    }
    let matchedCount = 0;
    editor.instancesGroup.children.forEach((inst) => {
      const match = findBestExactComponentMatch(inst, components);
      if (match && inst.userData?.canonicalComponentId !== match.id) {
        const prev = inst.userData?.canonicalComponentId || null;
        editor.execute(new AssignEngineeringComponentCommand(editor, inst, match.id, prev));
        matchedCount++;
      }
    });
    alert(`全场景构件匹配完成：成功匹配并关联 ${matchedCount} 个对象。`);
  };

  const handleBindComponent = (newCompId: string) => {
    const prev = selected.userData?.canonicalComponentId || null;
    const target = newCompId === "" ? null : newCompId;
    const cmd = new AssignEngineeringComponentCommand(editor, selected, target, prev);
    editor.execute(cmd);
  };

  const handleApplyCoordinateAdapter = (sourceUp: "Y_UP" | "Z_UP") => {
    CoordinateSystemAdapter.applyAdapter(selected, {
      sourceUp,
      alignGround: true,
      centerOrigin: true,
      scaleFactor: 1.0,
    });
    selected.updateMatrixWorld(true);
    editor.signals.objectChanged.dispatch(selected);
    editor.focus(selected);
  };

  const handleSplitMaterials = () => {
    const result = ModelSplitService.splitByMaterials(selected);
    if (result.createdObjects.length > 0) {
      editor.removeObject(selected);
      for (const obj of result.createdObjects) {
        editor.addObject(obj);
      }
      editor.signals.sceneGraphChanged.dispatch();
    }
  };

  const handleSplitConnected = () => {
    const result = ModelSplitService.splitConnectedComponents(selected, 0.5);
    if (result.createdObjects.length > 0) {
      editor.removeObject(selected);
      for (const obj of result.createdObjects) {
        editor.addObject(obj);
      }
      editor.signals.sceneGraphChanged.dispatch();
    }
  };

  return (
    <div className="flex flex-col space-y-4 p-3 text-xs text-neutral-300">
      {/* 1. FES Component Binding */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center space-x-1">
          <FileCode2 className="w-3.5 h-3.5 text-blue-400" />
          <span>FES 构件拓扑绑定</span>
        </label>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-neutral-500">关联标准构件:</span>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={handleAutoBind}
                disabled={!assemblyDoc?.components?.length}
                className="text-[10px] px-1.5 py-0.5 rounded border border-[#373b42] bg-[#25282e] hover:bg-[#2e3238] disabled:opacity-40"
                title="按 canonicalComponentId / partId / 对象名称进行匹配"
              >
                单件匹配
              </button>
              <button
                type="button"
                onClick={handleBatchAutoBind}
                disabled={!assemblyDoc?.components?.length}
                className="text-[10px] px-1.5 py-0.5 rounded border border-blue-800/60 bg-blue-950/40 text-blue-300 hover:bg-blue-900/50 disabled:opacity-40"
                title="一键遍历全场景模型并自动关联对应 FES 构件"
              >
                全场景匹配
              </button>
            </div>
          </div>
          <select
            value={boundCompId}
            onChange={(e) => handleBindComponent(e.target.value)}
            className="w-full bg-[#18191c] border border-[#33373e] rounded px-2 py-1.5 text-neutral-200 text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="">-- 未绑定工程构件 --</option>
            {assemblyDoc?.components?.map((comp: any, compIdx: number) => (
              <option key={`${comp.id || "comp"}_${compIdx}`} value={comp.id}>
                {comp.name || comp.id} ({comp.material || "通用"})
              </option>
            ))}
          </select>
        </div>

        {boundComponent ? (
          <div className="bg-[#18191c] border border-blue-900/40 rounded p-2 text-[11px] space-y-1">
            <div className="flex items-center justify-between text-blue-300">
              <span className="font-semibold">构件: {boundComponent.name || boundComponent.id}</span>
              <span className="bg-blue-950/60 px-1.5 py-0.5 rounded text-[10px] text-blue-400 border border-blue-800/40">
                已绑定
              </span>
            </div>
            <div className="text-neutral-400">
              工程设计尺寸: {boundComponent.size?.x || 0} × {boundComponent.size?.y || 0} × {boundComponent.size?.z || 0} mm
            </div>
          </div>
        ) : (
          <div className="bg-[#18191c] border border-[#2e3238] rounded p-2 text-[11px] text-neutral-500">
            暂未关联 FES 标准工程构件。绑定后可在 BOM 与装配图中建立双向对应。
          </div>
        )}
      </div>

      <div className="h-[1px] bg-[#2e3238]" />

      {/* 2. Dimension Evaluation (3D Model vs Nominal) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center space-x-1">
            <Compass className="w-3.5 h-3.5 text-emerald-400" />
            <span>尺寸评估 (G4-6D 契约 mm)</span>
          </label>
          <span className="text-[9px] text-neutral-500 font-mono bg-[#18191c] px-1 rounded border border-[#2e3238]">
            X宽 · Y深 · Z高
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <div className="bg-[#18191c] border border-[#2e3238] rounded p-1.5 text-center">
            <span className="text-[10px] text-neutral-500 uppercase block">宽 (X)</span>
            <span className="text-neutral-200 font-mono font-semibold">
              {fesDimensions.x.toFixed(1)}
            </span>
          </div>
          <div className="bg-[#18191c] border border-[#2e3238] rounded p-1.5 text-center">
            <span className="text-[10px] text-neutral-500 uppercase block">深 (Y)</span>
            <span className="text-neutral-200 font-mono font-semibold">
              {fesDimensions.y.toFixed(1)}
            </span>
          </div>
          <div className="bg-[#18191c] border border-[#2e3238] rounded p-1.5 text-center">
            <span className="text-[10px] text-neutral-500 uppercase block">高 (Z)</span>
            <span className="text-neutral-200 font-mono font-semibold text-emerald-400">
              {fesDimensions.z.toFixed(1)}
            </span>
          </div>
        </div>

        {validation && (
          <div className="bg-[#18191c] border border-[#2e3238] rounded p-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-neutral-400">G4-6 工程匹配</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                validation.status === "PASS"
                  ? "text-emerald-400 border-emerald-800 bg-emerald-950/30"
                  : validation.status === "WARNING"
                  ? "text-amber-400 border-amber-800 bg-amber-950/30"
                  : "text-red-400 border-red-800 bg-red-950/30"
              }`}>
                {validation.status} · {validation.score}/100
              </span>
            </div>
            <div className="grid grid-cols-[54px_1fr_1fr_1fr_54px] gap-1 text-[10px] font-mono">
              <span className="text-neutral-600">Axis</span>
              <span className="text-neutral-600">FES</span>
              <span className="text-neutral-600">Mesh</span>
              <span className="text-neutral-600">Δmm</span>
              <span className="text-neutral-600">Error</span>
              {(["x", "y", "z"] as const).map((axis) => {
                const r = validation.dimensions[axis];
                const label = axis === "x" ? "X(宽)" : axis === "y" ? "Y(深)" : "Z(高)";
                return (
                  <React.Fragment key={axis}>
                    <span className="text-neutral-400">{label}</span>
                    <span>{r.target.toFixed(1)}</span>
                    <span>{r.actual.toFixed(1)}</span>
                    <span className={r.status === "FAIL" ? "text-red-400" : r.status === "WARNING" ? "text-amber-400" : "text-emerald-400"}>
                      {r.delta >= 0 ? "+" : ""}{r.delta.toFixed(1)}
                    </span>
                    <span>{r.errorPercent.toFixed(1)}%</span>
                  </React.Fragment>
                );
              })}
            </div>
            <div className="text-[10px] text-neutral-500 leading-relaxed">
              G4-6D 物理契约：坐标轴对齐后，尺寸与几何残差遵循毫米 (mm) 确定性法则。
            </div>
          </div>
        )}
      </div>

      <div className="h-[1px] bg-[#2e3238]" />

      {/* 3. Coordinate System Adapter */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center space-x-1">
          <Compass className="w-3.5 h-3.5 text-amber-400" />
          <span>坐标系与对齐适配 (Coordinate Adapter)</span>
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => handleApplyCoordinateAdapter("Y_UP")}
            className="py-1.5 px-2 bg-[#25282e] hover:bg-[#2e3238] border border-[#373b42] rounded text-neutral-300 text-[11px] transition-colors"
          >
            Y-UP 转 Z-UP
          </button>
          <button
            onClick={() => handleApplyCoordinateAdapter("Z_UP")}
            className="py-1.5 px-2 bg-[#25282e] hover:bg-[#2e3238] border border-[#373b42] rounded text-neutral-300 text-[11px] transition-colors"
          >
            重置地面居中
          </button>
        </div>
      </div>

      <div className="h-[1px] bg-[#2e3238]" />

      {/* 4. Mesh Split Operations */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center space-x-1">
          <Scissors className="w-3.5 h-3.5 text-purple-400" />
          <span>网格拆分与提取 (Mesh Split)</span>
        </label>
        <div className="space-y-1.5">
          <button
            onClick={handleSplitMaterials}
            className="w-full py-1.5 px-2.5 bg-[#25282e] hover:bg-[#2e3238] border border-[#373b42] rounded text-left flex items-center justify-between text-neutral-200 text-xs transition-colors"
          >
            <span>按材质拆分网格 (Split Materials)</span>
            <ArrowRight className="w-3.5 h-3.5 text-neutral-500" />
          </button>
          <button
            onClick={handleSplitConnected}
            className="w-full py-1.5 px-2.5 bg-[#25282e] hover:bg-[#2e3238] border border-[#373b42] rounded text-left flex items-center justify-between text-neutral-200 text-xs transition-colors"
          >
            <span>按连通拓扑拆分 (Connected Mesh)</span>
            <ArrowRight className="w-3.5 h-3.5 text-neutral-500" />
          </button>
        </div>
      </div>

      <div className="h-[1px] bg-[#2e3238]" />

      {/* 5. Production Truth & Provenance Disclaimer */}
      <div className="bg-[#18191c] border border-amber-900/30 rounded p-2 text-[11px] space-y-1">
        <div className="flex items-center space-x-1.5 text-amber-400 font-medium">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>工程真值约束 (Truth Provenance)</span>
        </div>
        <p className="text-neutral-400 leading-relaxed text-[10px]">
          当前 3D 模型作为 <span className="text-neutral-200 font-mono">representation = reference_mesh</span>，
          <span className="text-amber-400 font-mono">productionTruth = false</span>。
          所有确切下料与尺寸必须以 FES 工程规范为准。
        </p>
      </div>
    </div>
  );
};
