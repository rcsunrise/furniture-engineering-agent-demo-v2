import React, { useState, useEffect } from "react";
import * as THREE from "three";
import {
  Folder,
  Box,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Copy,
  ChevronRight,
  ChevronDown,
  Search,
} from "lucide-react";
import type { Engineering3DEditor } from "../../Engineering3DEditor.js";

interface SceneTabProps {
  editor: Engineering3DEditor;
}

export const SceneTab: React.FC<SceneTabProps> = ({ editor }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsub1 = editor.signals.sceneGraphChanged.add(() => setTick((t) => t + 1));
    const unsub2 = editor.signals.objectSelected.add(() => setTick((t) => t + 1));
    const unsub3 = editor.signals.objectAdded.add(() => setTick((t) => t + 1));
    const unsub4 = editor.signals.objectRemoved.add(() => setTick((t) => t + 1));
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [editor]);

  const toggleCollapse = (uuid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  };

  const renderNode = (
    obj: THREE.Object3D,
    depth: number = 0,
    index: number = 0,
    pathPrefix: string = "node"
  ): React.ReactNode => {
    const isSelected = editor.selected === obj;
    const hasChildren = obj.children.length > 0;
    const isCollapsed = collapsedNodes.has(obj.uuid);
    const isMesh = (obj as THREE.Mesh).isMesh;
    const name = obj.name || (isMesh ? "Mesh" : "Group");

    if (searchQuery && !name.toLowerCase().includes(searchQuery.toLowerCase())) {
      // If none of children match, hide
      let anyChildMatches = false;
      obj.traverse((c) => {
        if (c !== obj && c.name?.toLowerCase().includes(searchQuery.toLowerCase())) {
          anyChildMatches = true;
        }
      });
      if (!anyChildMatches) return null;
    }

    const nodeKey = `${pathPrefix}_${obj.uuid || "obj"}_${depth}_${index}`;

    return (
      <div key={nodeKey} className="text-xs select-none">
        <div
          onClick={(e) => {
            e.stopPropagation();
            editor.select(obj);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            editor.select(obj);
            editor.focus(obj);
          }}
          className={`flex items-center justify-between py-1 px-1.5 rounded cursor-pointer group transition-colors ${
            isSelected
              ? "bg-blue-600/30 text-blue-200 border border-blue-500/40"
              : "hover:bg-[#25282e] text-neutral-300"
          }`}
          style={{ paddingLeft: `${Math.max(4, depth * 14)}px` }}
        >
          <div className="flex items-center space-x-1.5 min-w-0 flex-1">
            {hasChildren ? (
              <button
                onClick={(e) => toggleCollapse(obj.uuid, e)}
                className="text-neutral-500 hover:text-neutral-300 p-0.5"
              >
                {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            ) : (
              <span className="w-4" />
            )}

            {isMesh ? (
              <Box className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? "text-blue-400" : "text-neutral-400"}`} />
            ) : (
              <Folder className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? "text-blue-400" : "text-amber-400/80"}`} />
            )}

            <span className="truncate font-medium text-[11px]">{name}</span>
          </div>

          {/* Quick Actions: Visibility, Lock, Delete */}
          <div className="flex items-center space-x-1 opacity-60 group-hover:opacity-100 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                obj.visible = !obj.visible;
                editor.signals.sceneGraphChanged.dispatch();
                editor.signals.objectChanged.dispatch(obj);
              }}
              className="p-1 hover:text-white rounded"
              title={obj.visible ? "隐藏对象" : "显示对象"}
            >
              {obj.visible ? (
                <Eye className="w-3 h-3 text-neutral-400" />
              ) : (
                <EyeOff className="w-3 h-3 text-neutral-600" />
              )}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                obj.userData.locked = !obj.userData.locked;
                setTick((t) => t + 1);
              }}
              className="p-1 hover:text-white rounded"
              title={obj.userData.locked ? "解锁对象" : "锁定对象"}
            >
              {obj.userData.locked ? (
                <Lock className="w-3 h-3 text-amber-400" />
              ) : (
                <Unlock className="w-3 h-3 text-neutral-600 hover:text-neutral-400" />
              )}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                editor.removeObject(obj);
              }}
              className="p-1 hover:text-red-400 rounded"
              title="删除对象"
            >
              <Trash2 className="w-3 h-3 text-neutral-600 hover:text-red-400" />
            </button>
          </div>
        </div>

        {/* Children */}
        {hasChildren && !isCollapsed && (
          <div className="flex flex-col">
            {obj.children.map((child, childIdx) =>
              renderNode(child, depth + 1, childIdx, `${pathPrefix}_${obj.uuid || "p"}`)
            )}
          </div>
        )}
      </div>
    );
  };

  const instances = editor.instancesGroup.children;

  return (
    <div className="flex flex-col h-full space-y-2 p-2">
      {/* Search Header */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-neutral-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索场景对象..."
          className="w-full bg-[#18191c] border border-[#33373e] rounded pl-8 pr-2 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between px-1 text-[11px] text-neutral-400 border-b border-[#2e3238] pb-1.5">
        <span>节点总数: {instances.length} 实例</span>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => editor.duplicateSelected()}
            disabled={!editor.selected}
            className="p-1 rounded hover:bg-[#2c3036] disabled:opacity-40 disabled:cursor-not-allowed"
            title="复制选中 (Ctrl+D)"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => editor.deleteSelected()}
            disabled={!editor.selected}
            className="p-1 rounded hover:bg-[#2c3036] text-red-400 disabled:opacity-40 disabled:cursor-not-allowed"
            title="删除选中 (Del)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tree View */}
      <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
        {instances.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-500 text-xs px-4">
            <Box className="w-8 h-8 mb-2 opacity-40 text-neutral-400" />
            <span>场景中暂无 3D 模型</span>
            <span className="text-[11px] text-neutral-600 mt-1">
              通过文件菜单导入 GLB / OBJ 模型
            </span>
          </div>
        ) : (
          instances.map((child, idx) => renderNode(child, 0, idx, `root_${idx}`))
        )}
      </div>
    </div>
  );
};
