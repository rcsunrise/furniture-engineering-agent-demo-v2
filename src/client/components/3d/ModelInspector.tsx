import React, { useState } from "react";
import {
  Sliders,
  Box,
  Layers,
  Sparkles,
  Link,
  RotateCcw,
  Move,
  Maximize2,
  Scissors,
  Tag,
  Palette,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import type { SceneModelInstance, Imported3DAsset } from "../../../shared/imported3dAsset.js";
import type { AssemblyDocument } from "../../../shared/assembly.js";
import {
  TriangleConnectivityAnalyzer,
  type ConnectivityAnalysisResult,
  type ConnectedComponentInfo,
} from "../../utils/3d/triangleConnectivity.js";
import * as THREE from "three";

export type InspectorTab = "object" | "geometry" | "material" | "split" | "engineering";

interface ModelInspectorProps {
  instance: SceneModelInstance | null;
  asset: Imported3DAsset | null;
  threeObject: THREE.Object3D | null;
  assemblyDoc: AssemblyDocument | null;
  onUpdateTransform: (
    instanceId: string,
    transform: {
      position: [number, number, number];
      rotation: [number, number, number];
      scale: [number, number, number];
    }
  ) => void;
  onUpdateCoordinateAdapter: (
    instanceId: string,
    adapter: SceneModelInstance["coordinateAdapter"]
  ) => void;
  onUpdateBinding: (
    instanceId: string,
    binding?: { canonicalComponentId?: string; bindingMethod?: string }
  ) => void;
  onResetTransform: (instanceId: string) => void;
  onToggleVisibility: (instanceId: string) => void;
  onToggleLock: (instanceId: string) => void;
  // Split Handlers
  onSplitSceneNodes: (instanceId: string) => void;
  onSplitMaterials: (instanceId: string) => void;
  onSplitConnectedComponents: (instanceId: string, minThreshold: number) => void;
  onExtractFaces: (instanceId: string) => void;
  selectedFaceCount: number;
  onDeleteSmallComponents: (instanceId: string, components: ConnectedComponentInfo[]) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const ModelInspector: React.FC<ModelInspectorProps> = ({
  instance,
  asset,
  threeObject,
  assemblyDoc,
  onUpdateTransform,
  onUpdateCoordinateAdapter,
  onUpdateBinding,
  onResetTransform,
  onToggleVisibility,
  onToggleLock,
  onSplitSceneNodes,
  onSplitMaterials,
  onSplitConnectedComponents,
  onExtractFaces,
  selectedFaceCount,
  onDeleteSmallComponents,
  isCollapsed,
  onToggleCollapse,
}) => {
  const [activeTab, setActiveTab] = useState<InspectorTab>("object");
  const [connectivityResult, setConnectivityResult] = useState<ConnectivityAnalysisResult | null>(null);
  const [smallThreshold, setSmallThreshold] = useState<number>(0.5);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  if (isCollapsed) {
    return (
      <div className="w-11 bg-neutral-950/95 border-l border-neutral-800 flex flex-col items-center py-3 select-none z-20 shrink-0">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition"
          title="展开属性检查器 (Inspector)"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="mt-4 [writing-mode:vertical-rl] text-[11px] font-medium tracking-wider text-neutral-500 uppercase flex items-center gap-2 cursor-pointer" onClick={onToggleCollapse}>
          <Sliders className="w-3.5 h-3.5 rotate-90 text-indigo-400" />
          <span>检查器</span>
        </div>
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="w-80 bg-neutral-900/95 border-l border-neutral-800 flex flex-col text-neutral-400 text-xs select-none backdrop-blur-md z-20 shrink-0">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-neutral-800 bg-neutral-950/60">
          <span className="font-semibold text-white">属性检查器</span>
          <button onClick={onToggleCollapse} className="p-1 hover:bg-neutral-800 text-neutral-400 rounded">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="p-8 text-center text-neutral-500 space-y-2 my-auto">
          <Sliders className="w-8 h-8 mx-auto text-neutral-700" />
          <p className="font-medium text-neutral-300">未选中任何对象</p>
          <p className="text-[11px] text-neutral-600">在 3D 视口或左侧场景树中点击模型进行检查与拆分</p>
        </div>
      </div>
    );
  }

  const { position, rotation, scale } = instance.transform;

  const handlePositionChange = (axisIndex: 0 | 1 | 2, val: number) => {
    const nextPos: [number, number, number] = [...position];
    nextPos[axisIndex] = val;
    onUpdateTransform(instance.instanceId, { position: nextPos, rotation, scale });
  };

  const handleRotationChange = (axisIndex: 0 | 1 | 2, deg: number) => {
    const nextRot: [number, number, number] = [...rotation];
    nextRot[axisIndex] = deg;
    onUpdateTransform(instance.instanceId, { position, rotation: nextRot, scale });
  };

  const handleScaleChange = (axisIndex: 0 | 1 | 2, s: number) => {
    const nextScale: [number, number, number] = [...scale];
    nextScale[axisIndex] = Math.max(0.001, s);
    onUpdateTransform(instance.instanceId, { position, rotation, scale: nextScale });
  };

  // Run or refresh connected component analysis
  const runConnectivityAnalysis = () => {
    if (!threeObject) return;
    let mainGeom: THREE.BufferGeometry | null = null;
    threeObject.traverse((child) => {
      if (!mainGeom && (child as THREE.Mesh).isMesh) {
        mainGeom = (child as THREE.Mesh).geometry;
      }
    });

    if (mainGeom) {
      const res = TriangleConnectivityAnalyzer.analyze(mainGeom, smallThreshold, true);
      setConnectivityResult(res);
    }
  };

  const fesComponents = assemblyDoc?.components || [];

  return (
    <div className="w-80 bg-neutral-900/95 border-l border-neutral-800 flex flex-col text-neutral-200 text-xs select-none backdrop-blur-md z-20 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 bg-neutral-950/60">
        <div className="flex items-center gap-2 min-w-0">
          <Sliders className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="font-semibold text-white truncate max-w-[170px]" title={instance.name}>
            {instance.name}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onResetTransform(instance.instanceId)}
            className="p-1 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded"
            title="重置变换 (Reset Transform)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-1 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded"
            title="折叠检查器"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs Header (Section H: Object, Geometry, Material, Split, Engineering) */}
      <div className="flex border-b border-neutral-800 bg-neutral-950/30">
        {(
          [
            { id: "object", label: "对象", icon: Box },
            { id: "geometry", label: "几何", icon: Layers },
            { id: "material", label: "材质", icon: Palette },
            { id: "split", label: "拆分", icon: Scissors },
            { id: "engineering", label: "工程", icon: Tag },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 flex items-center justify-center gap-1 font-medium transition border-b-2 text-[11px] ${
                isActive
                  ? "border-indigo-500 text-indigo-400 bg-neutral-900"
                  : "border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      <div className="flex-1 p-3 space-y-3.5 overflow-y-auto min-h-0">
        {/* ===================== 1. OBJECT TAB ===================== */}
        {activeTab === "object" && (
          <div className="space-y-3.5">
            {/* Visibility & Lock Quick Toggles */}
            <div className="flex items-center justify-between bg-neutral-950 p-2 rounded-lg border border-neutral-800">
              <span className="text-neutral-400 text-[11px] font-medium">对象状态:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onToggleVisibility(instance.instanceId)}
                  className={`px-2 py-1 rounded text-[10px] flex items-center gap-1 border ${
                    instance.visible
                      ? "bg-neutral-800 border-neutral-700 text-neutral-300"
                      : "bg-red-950/40 border-red-800 text-red-400"
                  }`}
                >
                  {instance.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  <span>{instance.visible ? "显示" : "隐藏"}</span>
                </button>
                <button
                  onClick={() => onToggleLock(instance.instanceId)}
                  className={`px-2 py-1 rounded text-[10px] flex items-center gap-1 border ${
                    instance.locked
                      ? "bg-amber-950/40 border-amber-800 text-amber-400"
                      : "bg-neutral-800 border-neutral-700 text-neutral-300"
                  }`}
                >
                  {instance.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  <span>{instance.locked ? "已锁定" : "未锁定"}</span>
                </button>
              </div>
            </div>

            {/* Position */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-neutral-400">
                <span className="flex items-center gap-1 font-medium text-[11px]">
                  <Move className="w-3 h-3 text-neutral-500" />
                  位移 Position (mm)
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(["X", "Y", "Z"] as const).map((axis, i) => (
                  <div key={axis} className="flex items-center bg-neutral-950 rounded border border-neutral-800 px-2 py-1">
                    <span className="text-[10px] text-neutral-500 font-mono mr-1">{axis}:</span>
                    <input
                      type="number"
                      disabled={instance.locked}
                      step="5"
                      value={Math.round(position[i])}
                      onChange={(e) => handlePositionChange(i as 0 | 1 | 2, parseFloat(e.target.value) || 0)}
                      className="w-full bg-transparent text-white font-mono text-xs focus:outline-none disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Rotation */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-neutral-400">
                <span className="flex items-center gap-1 font-medium text-[11px]">
                  <RotateCcw className="w-3 h-3 text-neutral-500" />
                  旋转 Rotation (°)
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(["X", "Y", "Z"] as const).map((axis, i) => (
                  <div key={axis} className="flex items-center bg-neutral-950 rounded border border-neutral-800 px-2 py-1">
                    <span className="text-[10px] text-neutral-500 font-mono mr-1">{axis}:</span>
                    <input
                      type="number"
                      disabled={instance.locked}
                      step="15"
                      value={Math.round(rotation[i])}
                      onChange={(e) => handleRotationChange(i as 0 | 1 | 2, parseFloat(e.target.value) || 0)}
                      className="w-full bg-transparent text-white font-mono text-xs focus:outline-none disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Scale */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-neutral-400">
                <span className="flex items-center gap-1 font-medium text-[11px]">
                  <Maximize2 className="w-3 h-3 text-neutral-500" />
                  缩放 Scale
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(["X", "Y", "Z"] as const).map((axis, i) => (
                  <div key={axis} className="flex items-center bg-neutral-950 rounded border border-neutral-800 px-2 py-1">
                    <span className="text-[10px] text-neutral-500 font-mono mr-1">{axis}:</span>
                    <input
                      type="number"
                      disabled={instance.locked}
                      step="0.05"
                      value={parseFloat(scale[i].toFixed(2))}
                      onChange={(e) => handleScaleChange(i as 0 | 1 | 2, parseFloat(e.target.value) || 1)}
                      className="w-full bg-transparent text-white font-mono text-xs focus:outline-none disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===================== 2. GEOMETRY TAB ===================== */}
        {activeTab === "geometry" && (
          <div className="space-y-3">
            {/* Dimensions & Bounding Box */}
            {asset?.stats?.dimensions && (
              <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-800">
                <div className="flex items-center justify-between mb-1.5 text-neutral-400 text-[11px] font-medium">
                  <span className="flex items-center gap-1">
                    <Box className="w-3.5 h-3.5 text-indigo-400" />
                    包围盒尺寸规格 (Bounding Box)
                  </span>
                  <span className="text-[10px] text-neutral-500 font-mono">mm</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
                  <div className="bg-neutral-900 py-1 px-1 rounded border border-neutral-800">
                    <div className="text-[9px] text-neutral-500">宽 (Width)</div>
                    <div className="text-white text-xs font-semibold">
                      {Math.round(asset.stats.dimensions.width)}
                    </div>
                  </div>
                  <div className="bg-neutral-900 py-1 px-1 rounded border border-neutral-800">
                    <div className="text-[9px] text-neutral-500">深 (Depth)</div>
                    <div className="text-white text-xs font-semibold">
                      {Math.round(asset.stats.dimensions.depth)}
                    </div>
                  </div>
                  <div className="bg-neutral-900 py-1 px-1 rounded border border-neutral-800">
                    <div className="text-[9px] text-neutral-500">高 (Height)</div>
                    <div className="text-white text-xs font-semibold">
                      {Math.round(asset.stats.dimensions.height)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Geometry Counts */}
            {asset?.stats && (
              <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 space-y-1.5">
                <div className="text-neutral-400 font-medium text-[11px]">拓扑网格统计</div>
                <div className="grid grid-cols-2 gap-2 text-neutral-400 font-mono text-[11px]">
                  <div className="flex justify-between bg-neutral-900 p-1.5 rounded border border-neutral-850">
                    <span>顶点数:</span>
                    <span className="text-white">{asset.stats.vertexCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between bg-neutral-900 p-1.5 rounded border border-neutral-850">
                    <span>三角面:</span>
                    <span className="text-white">{asset.stats.triangleCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between bg-neutral-900 p-1.5 rounded border border-neutral-850">
                    <span>子网格:</span>
                    <span className="text-white">{asset.stats.meshCount}</span>
                  </div>
                  <div className="flex justify-between bg-neutral-900 p-1.5 rounded border border-neutral-850">
                    <span>资产格式:</span>
                    <span className="text-indigo-300 uppercase">{asset.format}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== 3. MATERIAL TAB ===================== */}
        {activeTab === "material" && (
          <div className="space-y-3">
            <div className="text-neutral-400 text-[11px] font-medium">材质与纹理列表</div>
            {(!asset?.materials || asset.materials.length === 0) ? (
              <div className="text-center py-6 text-neutral-500">该模型使用默认标准材质</div>
            ) : (
              <div className="space-y-2">
                {asset.materials.map((mat, idx) => (
                  <div key={idx} className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white">{mat.name || `材质 #${idx + 1}`}</span>
                      <span className="text-[10px] text-neutral-500 font-mono">{mat.type}</span>
                    </div>
                    {mat.color && (
                      <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                        <span>底色:</span>
                        <div
                          className="w-4 h-4 rounded border border-neutral-700"
                          style={{ backgroundColor: mat.color }}
                        />
                        <span className="font-mono">{mat.color}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-neutral-500 font-mono mt-1">
                      <div>粗糙度: {(mat as any).roughness !== undefined ? (mat as any).roughness.toFixed(2) : "0.5"}</div>
                      <div>金属度: {(mat as any).metalness !== undefined ? (mat as any).metalness.toFixed(2) : "0.0"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================== 4. SPLIT TAB (Sections I, J, K, L, M, N) ===================== */}
        {activeTab === "split" && (
          <div className="space-y-3.5">
            {/* Split Actions */}
            <div className="space-y-2">
              <div className="text-neutral-400 font-medium text-[11px] flex items-center justify-between">
                <span>模型拆分模式 (Split Modes)</span>
                <span className="text-[9px] text-amber-400/90 font-mono bg-amber-950/40 px-1 py-0.5 rounded border border-amber-900/60">
                  源模型保持只读
                </span>
              </div>

              {/* Mode 1: Scene Node Split */}
              <button
                onClick={() => onSplitSceneNodes(instance.instanceId)}
                className="w-full py-2 px-2.5 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 rounded-lg text-left transition flex items-center justify-between"
              >
                <div>
                  <div className="font-medium text-neutral-200">1. 按场景节点拆分 (Scene Node)</div>
                  <div className="text-[10px] text-neutral-500">将 GLTF 层级节点解构成独立部件对象</div>
                </div>
                <Scissors className="w-3.5 h-3.5 text-indigo-400 shrink-0 ml-2" />
              </button>

              {/* Mode 2: Material Group Split */}
              <button
                onClick={() => onSplitMaterials(instance.instanceId)}
                className="w-full py-2 px-2.5 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 rounded-lg text-left transition flex items-center justify-between"
              >
                <div>
                  <div className="font-medium text-neutral-200">2. 按材质组拆分 (Material Split)</div>
                  <div className="text-[10px] text-neutral-500">按几何体材质分组 (Material Groups) 提取独立部件</div>
                </div>
                <Palette className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-2" />
              </button>

              {/* Mode 3: Connected Component Split */}
              <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-neutral-200">3. 连通分量拆分 (Topology DSU)</div>
                  <button
                    onClick={runConnectivityAnalysis}
                    className="text-[10px] px-1.5 py-0.5 bg-indigo-900/40 border border-indigo-700 text-indigo-300 rounded hover:bg-indigo-900"
                  >
                    分析连通体
                  </button>
                </div>
                <div className="text-[10px] text-neutral-500">
                  基于空间容差三角网格拓扑连通图分解孤立构件
                </div>

                {connectivityResult && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-neutral-400">
                      <span>检测到连通分量:</span>
                      <span className="font-mono text-white font-semibold">
                        {connectivityResult.components.length} 个
                      </span>
                    </div>

                    <div className="max-h-28 overflow-y-auto space-y-1 pr-1 font-mono text-[10px]">
                      {connectivityResult.components.slice(0, 10).map((c, cIdx) => (
                        <div
                          key={`${c.id || "comp"}_${cIdx}`}
                          className="flex items-center justify-between bg-neutral-900 p-1 rounded border border-neutral-850"
                        >
                          <span className={c.isSmall ? "text-amber-400" : "text-neutral-300"}>
                            {c.name}
                          </span>
                          <span className="text-neutral-500">
                            {c.percentage}% ({c.triangleCount} Δ)
                          </span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => onSplitConnectedComponents(instance.instanceId, 0.1)}
                      className="w-full py-1.5 mt-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium text-xs transition"
                    >
                      拆分为独立模型 (全部 {connectivityResult.components.length} 个分量)
                    </button>
                  </div>
                )}
              </div>

              {/* Mode 4: Manual Surface Extraction */}
              <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-neutral-200">4. 手动表面拾取 (Face Selection)</div>
                  <span className="text-[10px] font-mono text-amber-400">
                    已选 {selectedFaceCount} 面
                  </span>
                </div>
                <div className="text-[10px] text-neutral-500">
                  切换到底部工具栏【拆分】模式，点击或拖拽框选模型表面三角面
                </div>
                <button
                  disabled={selectedFaceCount === 0}
                  onClick={() => onExtractFaces(instance.instanceId)}
                  className={`w-full py-1.5 rounded font-medium text-xs transition ${
                    selectedFaceCount > 0
                      ? "bg-amber-600 hover:bg-amber-500 text-white"
                      : "bg-neutral-800 text-neutral-600 cursor-not-allowed"
                  }`}
                >
                  提取选中表面为独立零件 ({selectedFaceCount} 面)
                </button>
              </div>

              {/* Section M: Small Component Detection & Deletion with confirmation */}
              {connectivityResult && connectivityResult.smallComponentsCount > 0 && (
                <div className="bg-amber-950/20 border border-amber-900/50 p-2.5 rounded-lg space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-400 font-medium text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>检测到 {connectivityResult.smallComponentsCount} 个孤立悬空碎片</span>
                  </div>
                  <p className="text-[10px] text-neutral-400">
                    符合 Section M 规则：禁止自动删除。删除前须由工程师明确确认。
                  </p>

                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full py-1 bg-red-900/40 hover:bg-red-900/60 border border-red-800 text-red-300 rounded text-xs transition flex items-center justify-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>清除孤立碎片 (需二次确认)</span>
                    </button>
                  ) : (
                    <div className="space-y-1.5 bg-neutral-950 p-2 rounded border border-red-800">
                      <div className="text-red-400 text-[10px] font-medium">确认从当前模型中删除悬空碎片？</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const smalls = connectivityResult.components.filter((c) => c.isSmall);
                            onDeleteSmallComponents(instance.instanceId, smalls);
                            setShowDeleteConfirm(false);
                            setConnectivityResult(null);
                          }}
                          className="flex-1 py-1 bg-red-600 text-white rounded text-[11px] font-medium"
                        >
                          确认删除
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="flex-1 py-1 bg-neutral-800 text-neutral-300 rounded text-[11px]"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================== 5. ENGINEERING TAB ===================== */}
        {activeTab === "engineering" && (
          <div className="space-y-3">
            <div className="text-neutral-400 text-[11px] font-medium">工程模型对齐与装配绑定</div>
            {fesComponents.length === 0 ? (
              <div className="text-center py-6 text-neutral-500">
                当前工程中暂无 FES 构件数据
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-[11px] text-neutral-400">绑定至 Canonical FES 构件:</div>
                <select
                  value={(instance as any).binding?.canonicalComponentId || ""}
                  onChange={(e) =>
                    onUpdateBinding(instance.instanceId, {
                      canonicalComponentId: e.target.value || undefined,
                      bindingMethod: "MANUAL_INSPECTOR",
                    })
                  }
                  className="w-full bg-neutral-950 text-neutral-200 border border-neutral-800 rounded p-1.5 text-xs focus:outline-none"
                >
                  <option value="">未绑定 (独立 3D 资产)</option>
                  {fesComponents.map((comp, compIdx) => (
                    <option key={`${comp.id || "comp"}_${compIdx}`} value={comp.id}>
                      {comp.name} ({comp.id})
                    </option>
                  ))}
                </select>

                {(instance as any).binding?.canonicalComponentId && (
                  <div className="bg-neutral-950 p-2 rounded border border-neutral-800 space-y-1 text-[11px]">
                    <div className="flex justify-between text-neutral-400">
                      <span>绑定状态:</span>
                      <span className="text-emerald-400 font-medium">已绑定</span>
                    </div>
                    <div className="flex justify-between text-neutral-400">
                      <span>对齐方法:</span>
                      <span className="font-mono text-neutral-300">{(instance as any).binding.bindingMethod}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
