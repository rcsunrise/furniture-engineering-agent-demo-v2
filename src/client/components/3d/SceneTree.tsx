import React, { useState } from "react";
import {
  Layers,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  ChevronRight,
  ChevronDown,
  Box,
  Focus,
  Scissors,
  Edit2,
  Check,
  X,
  ChevronLeft,
} from "lucide-react";
import type { SceneModelInstance } from "../../../shared/imported3dAsset.js";
import * as THREE from "three";

interface SceneTreeProps {
  instances: SceneModelInstance[];
  selectedInstanceId: string | null;
  onSelectInstance: (instanceId: string) => void;
  onToggleVisibility: (instanceId: string) => void;
  onToggleLock: (instanceId: string) => void;
  onRemoveInstance: (instanceId: string) => void;
  onRenameInstance: (instanceId: string, newName: string) => void;
  onFocusInstance: (instanceId: string) => void;
  onIsolateInstance: (instanceId: string) => void;
  instanceObjectsMap: Map<string, THREE.Object3D>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const SceneTree: React.FC<SceneTreeProps> = ({
  instances,
  selectedInstanceId,
  onSelectInstance,
  onToggleVisibility,
  onToggleLock,
  onRemoveInstance,
  onRenameInstance,
  onFocusInstance,
  onIsolateInstance,
  instanceObjectsMap,
  isCollapsed,
  onToggleCollapse,
}) => {
  const [expandedInstanceIds, setExpandedInstanceIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedInstanceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditName(currentName);
  };

  const commitRename = (id: string) => {
    if (editName.trim()) {
      onRenameInstance(id, editName.trim());
    }
    setEditingId(null);
  };

  // Helper to extract mesh nodes from an Object3D
  const getSubNodes = (obj: THREE.Object3D | undefined) => {
    if (!obj) return [];
    const nodes: Array<{ id: string; name: string; type: string; triangles?: number }> = [];
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && child !== obj) {
        const mesh = child as THREE.Mesh;
        const triCount = mesh.geometry?.index
          ? mesh.geometry.index.count / 3
          : (mesh.geometry?.attributes.position?.count || 0) / 3;

        nodes.push({
          id: child.uuid,
          name: child.name || "SubMesh",
          type: child.userData.splitType ? "Split Node" : "Mesh",
          triangles: Math.round(triCount),
        });
      }
    });
    return nodes.slice(0, 100);
  };

  if (isCollapsed) {
    return (
      <div className="w-11 bg-neutral-950/95 border-r border-neutral-800 flex flex-col items-center py-3 select-none z-20 shrink-0">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition"
          title="展开场景大纲 (Scene Tree)"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="mt-4 [writing-mode:vertical-rl] text-[11px] font-medium tracking-wider text-neutral-500 uppercase flex items-center gap-2 cursor-pointer" onClick={onToggleCollapse}>
          <Layers className="w-3.5 h-3.5 rotate-90 text-indigo-400" />
          <span>大纲 ({instances.length})</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-neutral-900/95 border-r border-neutral-800 flex flex-col text-neutral-200 text-xs select-none backdrop-blur-md z-20 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-neutral-800 bg-neutral-950/60">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-white tracking-wide">场景大纲 (Scene Tree)</span>
          <span className="text-[10px] font-mono bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">
            {instances.length}
          </span>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded transition"
          title="折叠场景大纲面板"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Tree Content */}
      <div className="flex-1 p-1 space-y-0.5 overflow-y-auto min-h-0">
        {instances.length === 0 ? (
          <div className="text-center py-12 text-neutral-500 text-xs">
            当前场景暂无 3D 模型
            <div className="mt-1 text-[11px] text-neutral-600">点击顶部导入 GLB 模型</div>
          </div>
        ) : (
          instances.map((instance, instIdx) => {
            const isSelected = selectedInstanceId === instance.instanceId;
            const isExpanded = expandedInstanceIds.has(instance.instanceId);
            const obj = instanceObjectsMap.get(instance.instanceId);
            const subNodes = isExpanded ? getSubNodes(obj) : [];
            const isEditing = editingId === instance.instanceId;

            return (
              <div key={`${instance.instanceId || "inst"}_${instIdx}`} className="flex flex-col">
                {/* Instance Row */}
                <div
                  onClick={() => onSelectInstance(instance.instanceId)}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer transition group ${
                    isSelected
                      ? "bg-indigo-600/30 border border-indigo-500/50 text-white font-medium"
                      : "hover:bg-neutral-800/60 text-neutral-300 border border-transparent"
                  }`}
                >
                  {/* Left: Expand toggle & Name */}
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <button
                      onClick={(e) => toggleExpand(instance.instanceId, e)}
                      className="p-0.5 text-neutral-500 hover:text-neutral-300 rounded"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <Box className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-indigo-400" : "text-neutral-500"}`} />

                    {isEditing ? (
                      <div
                        className="flex items-center gap-1 flex-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename(instance.instanceId);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                          className="w-full bg-neutral-950 text-white px-1.5 py-0.5 rounded border border-indigo-500 text-xs focus:outline-none"
                        />
                        <button
                          onClick={() => commitRename(instance.instanceId)}
                          className="p-0.5 text-emerald-400 hover:text-emerald-300"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-0.5 text-neutral-500 hover:text-neutral-300"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <span className="truncate max-w-[120px] text-xs" title={instance.name}>
                        {instance.name}
                      </span>
                    )}
                  </div>

                  {/* Actions (Visible, Lock, Focus, Isolate, Rename, Delete) */}
                  <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100">
                    {/* Rename */}
                    <button
                      onClick={(e) => startRename(instance.instanceId, instance.name, e)}
                      className="p-1 text-neutral-500 hover:text-neutral-300 rounded"
                      title="重命名 (Rename)"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>

                    {/* Focus */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFocusInstance(instance.instanceId);
                      }}
                      className="p-1 text-neutral-500 hover:text-indigo-400 rounded"
                      title="聚焦选中模型 (Focus)"
                    >
                      <Focus className="w-3 h-3" />
                    </button>

                    {/* Visibility */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleVisibility(instance.instanceId);
                      }}
                      className="p-1 text-neutral-500 hover:text-neutral-300 rounded"
                      title={instance.visible ? "隐藏模型" : "显示模型"}
                    >
                      {instance.visible ? (
                        <Eye className="w-3 h-3" />
                      ) : (
                        <EyeOff className="w-3 h-3 text-red-400" />
                      )}
                    </button>

                    {/* Lock */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleLock(instance.instanceId);
                      }}
                      className="p-1 text-neutral-500 hover:text-neutral-300 rounded"
                      title={instance.locked ? "解锁模型变换" : "锁定模型变换"}
                    >
                      {instance.locked ? (
                        <Lock className="w-3 h-3 text-amber-400" />
                      ) : (
                        <Unlock className="w-3 h-3 text-neutral-600" />
                      )}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`确认从场景中删除 "${instance.name}" 吗？`)) {
                          onRemoveInstance(instance.instanceId);
                        }
                      }}
                      className="p-1 text-neutral-500 hover:text-red-400 rounded"
                      title="删除模型"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Sub-Meshes / Split Nodes */}
                {isExpanded && subNodes.length > 0 && (
                  <div className="pl-6 pr-1 py-1 space-y-0.5 border-l border-neutral-800 ml-4">
                    {subNodes.map((node, subIdx) => (
                      <div
                        key={`${node.id || "sub"}_${subIdx}`}
                        className="flex items-center justify-between py-1 px-1.5 rounded text-[11px] text-neutral-400 hover:bg-neutral-800/40"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {node.type === "Split Node" ? (
                            <Scissors className="w-3 h-3 text-amber-400 shrink-0" />
                          ) : (
                            <Box className="w-3 h-3 text-neutral-600 shrink-0" />
                          )}
                          <span className="truncate" title={node.name}>
                            {node.name}
                          </span>
                        </div>
                        {node.triangles !== undefined && (
                          <span className="text-[9px] font-mono text-neutral-600">
                            {node.triangles.toLocaleString()} Δ
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
