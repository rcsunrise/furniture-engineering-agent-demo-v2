import React, { useState, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import {
  FolderOpen,
  Save,
  Download,
  Trash2,
  Undo2,
  Redo2,
  Copy,
  Focus,
  Eye,
  Layers,
  HelpCircle,
  ChevronRight,
  Box,
  FileCode2,
  Scissors,
  Share2,
  Maximize2,
  Compass,
  Check,
  PlusCircle,
  Circle,
  Square,
  Sun,
  Lightbulb,
  Crosshair,
  RotateCcw,
  RotateCw,
  Upload,
} from "lucide-react";
import type { Engineering3DEditor } from "../Engineering3DEditor.js";
import type { CameraPreset } from "../../utils/3d/cameraController.js";
import type { WorkspaceViewMode } from "../../utils/3d/viewModeManager.js";
import { ModelLoaderService } from "../../utils/3d/modelLoaderService.js";
import { CoordinateSystemAdapter } from "../../utils/3d/coordinateSystemAdapter.js";
import { ScenePersistenceService } from "../../utils/3d/scenePersistenceService.js";

interface EditorMenubarProps {
  editor: Engineering3DEditor;
  onOpenImport: () => void;
  onOpenSave: () => void;
  onOpenSaveAs: () => void;
  onOpenScenesList: () => void;
  onExportGLB: () => void;
  onToggleEngineeringDrawer: () => void;
  isEngineeringDrawerOpen?: boolean;
  hasEngineeringData?: boolean;
  engineeringSku?: string;
  showDeveloperOverlay?: boolean;
  onToggleDeveloperOverlay?: () => void;
  onOpenShortcutsHelp?: () => void;
  onSplitMaterials?: () => void;
  onSplitConnected?: () => void;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const EditorMenubar: React.FC<EditorMenubarProps> = ({
  editor,
  onOpenImport,
  onOpenSave,
  onOpenSaveAs,
  onOpenScenesList,
  onExportGLB,
  onToggleEngineeringDrawer,
  isEngineeringDrawerOpen = false,
  hasEngineeringData = false,
  engineeringSku = "",
  showDeveloperOverlay = false,
  onToggleDeveloperOverlay,
  onOpenShortcutsHelp,
  onSplitMaterials,
  onSplitConnected,
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const menubarRef = useRef<HTMLDivElement>(null);
  const directFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleDirectFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await ModelLoaderService.loadModel(buffer, file.name);
      const ext = file.name.split(".").pop()?.toLowerCase();
      const sourceUp = ext === "stl" || ext === "ply" ? "Z_UP" : "Y_UP";

      // Auto-detect unit scale: if max dimension is < 25 and format is GLTF/GLB/ZIP,
      // it is authored in meters (Khronos spec); scale by 1000x to match millimeter engineering workspace.
      const rawBox = new THREE.Box3().setFromObject(parsed.rootObject);
      const rawSize = new THREE.Vector3();
      rawBox.getSize(rawSize);
      const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z);
      const scaleFactor = (maxDim > 0 && maxDim < 25 && (ext === "glb" || ext === "gltf" || ext === "zip")) ? 1000.0 : 1.0;

      const { wrapper } = CoordinateSystemAdapter.wrapAndAlign(parsed.rootObject, {
        sourceUp,
        targetUp: "Y_UP",
        alignGround: true,
        centerOrigin: true,
        scaleFactor,
      });
      wrapper.name = file.name.replace(/\.[^/.]+$/, "");
      wrapper.userData = {
        ...wrapper.userData,
        geometrySource: "direct_import",
        sourceFileName: file.name,
      };
      editor.addObject(wrapper);
      editor.select(wrapper);
      editor.focus(wrapper);

      // Upload to server asset storage in background for cross-session durability
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name.replace(/\.[^/.]+$/, ""));
      formData.append("detectedUp", sourceUp);
      formData.append("stats", JSON.stringify(parsed.stats));
      formData.append("materials", JSON.stringify(parsed.materials));
      fetch("/api/assets/upload", { method: "POST", body: formData })
        .then((res) => res.json())
        .then((resData) => {
          if (resData.success && resData.asset) {
            wrapper.userData.assetId = resData.asset.id;
            wrapper.userData.downloadUrl = resData.asset.downloadUrl;
            ScenePersistenceService.saveActiveScene(editor);
          }
        })
        .catch((e) => console.warn("Menubar background upload error:", e));

      ScenePersistenceService.saveActiveScene(editor);
    } catch (err: any) {
      console.error("Direct model import failed:", err);
      alert(`导入模型失败: ${err?.message || "无法解析 3D 文件"}`);
    } finally {
      e.target.value = "";
    }
  };

  // Subscribe to editor signals for updates
  useEffect(() => {
    const unsub1 = editor.signals.historyChanged.add(() => setTick((t) => t + 1));
    const unsub2 = editor.signals.sceneGraphChanged.add(() => setTick((t) => t + 1));
    const unsub3 = editor.signals.objectSelected.add(() => setTick((t) => t + 1));
    const unsub4 = editor.signals.viewModeChanged.add(() => setTick((t) => t + 1));
    const unsub5 = editor.signals.projectionModeChanged.add(() => setTick((t) => t + 1));
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
    };
  }, [editor]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menubarRef.current && !menubarRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
        setActiveSubmenu(null);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMenuEnter = (menuKey: string) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setActiveMenu(menuKey);
    setActiveSubmenu(null);
  };

  const handleMenuLeave = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setActiveMenu(null);
      setActiveSubmenu(null);
    }, 200);
  };

  const handleSubmenuEnter = (submenuKey: string) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setActiveSubmenu(submenuKey);
  };

  const closeMenu = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setActiveMenu(null);
    setActiveSubmenu(null);
  }, []);

  const handleExport = async (format: "glb" | "obj" | "stl" | "json") => {
    closeMenu();
    try {
      const baseName = editor.currentSceneName.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, "_") || "model";
      if (format === "glb") {
        onExportGLB();
      } else if (format === "obj") {
        const blob = await editor.exportOBJ();
        downloadBlob(blob, `${baseName}.obj`);
      } else if (format === "stl") {
        const blob = await editor.exportSTL();
        downloadBlob(blob, `${baseName}.stl`);
      } else if (format === "json") {
        const blob = await editor.exportJSON();
        downloadBlob(blob, `${baseName}_scene.json`);
      }
    } catch (err) {
      console.error(`Export failed for ${format}:`, err);
    }
  };

  const canUndo = editor.history.canUndo();
  const canRedo = editor.history.canRedo();
  const hasSelection = Boolean(editor.selected);

  return (
    <div
      ref={menubarRef}
      onMouseLeave={handleMenuLeave}
      className="h-[32px] min-h-[32px] bg-[#1e2025] border-b border-[#2c3038] flex items-center justify-between px-2 text-xs select-none text-neutral-300 z-50 relative"
      style={{
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }}
    >
      {/* Hidden file input permanently mounted so it is never unmounted during menu close */}
      <input
        ref={directFileInputRef}
        type="file"
        accept=".glb,.gltf,.obj,.stl,.ply,.fbx,.zip"
        className="hidden"
        style={{ display: "none" }}
        onChange={handleDirectFileSelect}
      />

      {/* Left Menu Items (Three.js Editor Style) */}
      <div className="flex items-center space-x-0.5">
        {/* Logo / Brand */}
        <div className="font-semibold text-neutral-100 flex items-center space-x-1.5 mr-2 px-1">
          <Box className="w-3.5 h-3.5 text-blue-400" />
          <span className="tracking-tight text-[11px] font-bold text-neutral-200">
            FES 3D 工程编辑器
          </span>
        </div>

        {/* 1. 文件 (File) */}
        <div
          className="relative"
          onMouseEnter={() => handleMenuEnter("file")}
        >
          <button
            onClick={() => setActiveMenu(activeMenu === "file" ? null : "file")}
            className={`px-2.5 py-1 rounded transition-colors text-xs font-normal ${
              activeMenu === "file"
                ? "bg-[#2e323b] text-white shadow-inner"
                : "text-neutral-300 hover:bg-[#2a2d34] hover:text-white"
            }`}
          >
            文件
          </button>
          {activeMenu === "file" && (
            <div
              className="absolute left-0 top-full mt-0.5 w-52 bg-[#22252b] border border-[#373c46] rounded-md shadow-2xl py-1 z-50 text-neutral-200 backdrop-blur-sm"
              onMouseEnter={() => {
                if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
              }}
            >
              <button
                onClick={() => {
                  closeMenu();
                  if (confirm("确定要新建场景吗？当前未保存的修改将被清空。")) {
                    editor.clear();
                    ScenePersistenceService.clearActiveScene();
                  }
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs transition-colors"
              >
                <span>新建场景</span>
              </button>
              <button
                onClick={() => {
                  closeMenu();
                  onOpenScenesList();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs transition-colors"
              >
                <span className="flex items-center space-x-2">
                  <Layers className="w-3.5 h-3.5" />
                  <span>打开场景...</span>
                </span>
              </button>
              <div className="h-[1px] bg-[#333842] my-1 mx-1" />
              <button
                onClick={() => {
                  closeMenu();
                  onOpenSave();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs transition-colors"
              >
                <span className="flex items-center space-x-2">
                  <Save className="w-3.5 h-3.5" />
                  <span>保存场景</span>
                </span>
                <span className="text-[10px] text-neutral-400">Ctrl+S</span>
              </button>
              <button
                onClick={() => {
                  closeMenu();
                  onOpenSaveAs();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs transition-colors"
              >
                <span className="flex items-center space-x-2">
                  <Save className="w-3.5 h-3.5 opacity-70" />
                  <span>场景另存为...</span>
                </span>
              </button>
              <div className="h-[1px] bg-[#333842] my-1 mx-1" />
              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  setTimeout(() => {
                    directFileInputRef.current?.click();
                  }, 50);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs transition-colors cursor-pointer"
              >
                <span className="flex items-center space-x-2">
                  <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                  <span>打开/导入 3D 文件...</span>
                </span>
                <span className="text-[10px] text-neutral-400">快速置入</span>
              </button>

              <button
                onClick={() => {
                  closeMenu();
                  onOpenImport();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs transition-colors"
              >
                <span className="flex items-center space-x-2">
                  <Upload className="w-3.5 h-3.5 text-neutral-400" />
                  <span>导入设置与资产库...</span>
                </span>
                <span className="text-[10px] text-neutral-400">坐标/缩放</span>
              </button>

              {/* 导出子菜单 */}
              <div
                className="relative"
                onMouseEnter={() => handleSubmenuEnter("export")}
                onMouseLeave={() => setActiveSubmenu(null)}
              >
                <div
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                    activeSubmenu === "export" ? "bg-[#3b82f6] text-white" : "hover:bg-[#3b82f6] hover:text-white"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>导出</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
                {activeSubmenu === "export" && (
                  <div className="absolute left-full top-0 ml-0.5 w-44 bg-[#22252b] border border-[#373c46] rounded-md shadow-2xl py-1 z-50 text-neutral-200">
                    <button
                      onClick={() => handleExport("glb")}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
                    >
                      <span>导出 GLB (.glb)</span>
                    </button>
                    <button
                      onClick={() => handleExport("obj")}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
                    >
                      <span>导出 OBJ (.obj)</span>
                    </button>
                    <button
                      onClick={() => handleExport("stl")}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
                    >
                      <span>导出 STL (.stl)</span>
                    </button>
                    <button
                      onClick={() => handleExport("json")}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
                    >
                      <span>导出场景 JSON (.json)</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="h-[1px] bg-[#333842] my-1 mx-1" />
              <button
                onClick={() => {
                  closeMenu();
                  if (confirm("确定要清空场景中所有模型吗？未保存的内容将丢失。")) {
                    editor.clear();
                    ScenePersistenceService.clearActiveScene();
                  }
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-red-600 hover:text-white flex items-center space-x-2 text-red-400 text-xs transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空场景</span>
              </button>
            </div>
          )}
        </div>

        {/* 2. 编辑 (Edit) */}
        <div
          className="relative"
          onMouseEnter={() => handleMenuEnter("edit")}
        >
          <button
            onClick={() => setActiveMenu(activeMenu === "edit" ? null : "edit")}
            className={`px-2.5 py-1 rounded transition-colors text-xs font-normal ${
              activeMenu === "edit"
                ? "bg-[#2e323b] text-white shadow-inner"
                : "text-neutral-300 hover:bg-[#2a2d34] hover:text-white"
            }`}
          >
            编辑
          </button>
          {activeMenu === "edit" && (
            <div
              className="absolute left-0 top-full mt-0.5 w-52 bg-[#22252b] border border-[#373c46] rounded-md shadow-2xl py-1 z-50 text-neutral-200"
              onMouseEnter={() => {
                if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
              }}
            >
              <button
                disabled={!canUndo}
                onClick={() => {
                  closeMenu();
                  editor.undo();
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs ${
                  canUndo ? "hover:bg-[#3b82f6] hover:text-white" : "opacity-40 cursor-not-allowed"
                }`}
              >
                <span className="flex items-center space-x-2">
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>撤销</span>
                </span>
                <span className="text-[10px] text-neutral-400">Ctrl+Z</span>
              </button>
              <button
                disabled={!canRedo}
                onClick={() => {
                  closeMenu();
                  editor.redo();
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs ${
                  canRedo ? "hover:bg-[#3b82f6] hover:text-white" : "opacity-40 cursor-not-allowed"
                }`}
              >
                <span className="flex items-center space-x-2">
                  <Redo2 className="w-3.5 h-3.5" />
                  <span>重做</span>
                </span>
                <span className="text-[10px] text-neutral-400">Ctrl+Y</span>
              </button>
              <div className="h-[1px] bg-[#333842] my-1 mx-1" />
              <button
                disabled={!hasSelection}
                onClick={() => {
                  closeMenu();
                  editor.duplicateSelected();
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs ${
                  hasSelection ? "hover:bg-[#3b82f6] hover:text-white" : "opacity-40 cursor-not-allowed"
                }`}
              >
                <span className="flex items-center space-x-2">
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制</span>
                </span>
                <span className="text-[10px] text-neutral-400">Ctrl+D</span>
              </button>
              <button
                disabled={!hasSelection}
                onClick={() => {
                  closeMenu();
                  editor.deleteSelected();
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs ${
                  hasSelection ? "hover:bg-red-600 hover:text-white text-red-400" : "opacity-40 cursor-not-allowed"
                }`}
              >
                <span className="flex items-center space-x-2">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>删除</span>
                </span>
                <span className="text-[10px] text-neutral-400">Del</span>
              </button>
              <div className="h-[1px] bg-[#333842] my-1 mx-1" />
              <button
                disabled={!hasSelection}
                onClick={() => {
                  closeMenu();
                  editor.centerSelected();
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs ${
                  hasSelection ? "hover:bg-[#3b82f6] hover:text-white" : "opacity-40 cursor-not-allowed"
                }`}
              >
                <span className="flex items-center space-x-2">
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>居中到原点</span>
                </span>
              </button>
              <button
                disabled={!hasSelection}
                onClick={() => {
                  closeMenu();
                  editor.resetSelectedTransform();
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs ${
                  hasSelection ? "hover:bg-[#3b82f6] hover:text-white" : "opacity-40 cursor-not-allowed"
                }`}
              >
                <span className="flex items-center space-x-2">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>重置变换</span>
                </span>
              </button>

              {/* 旋转快速参数子菜单 */}
              <div
                className="relative"
                onMouseEnter={() => handleSubmenuEnter("rotate_obj")}
                onMouseLeave={() => setActiveSubmenu(null)}
              >
                <div
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                    !hasSelection
                      ? "opacity-40 cursor-not-allowed"
                      : activeSubmenu === "rotate_obj"
                      ? "bg-[#3b82f6] text-white"
                      : "hover:bg-[#3b82f6] hover:text-white"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
                    <span>旋转对象 (90° 参数)</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
                {activeSubmenu === "rotate_obj" && hasSelection && (
                  <div className="absolute left-full top-0 ml-0.5 w-48 bg-[#22252b] border border-[#373c46] rounded-md shadow-2xl py-1 z-50 text-neutral-200">
                    <button
                      onClick={() => {
                        closeMenu();
                        editor.rotateSelected("y", 90);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
                    >
                      <span>水平顺转 Y +90°</span>
                      <span className="text-[10px] text-neutral-400">+90°</span>
                    </button>
                    <button
                      onClick={() => {
                        closeMenu();
                        editor.rotateSelected("y", -90);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
                    >
                      <span>水平逆转 Y -90°</span>
                      <span className="text-[10px] text-neutral-400">-90°</span>
                    </button>
                    <button
                      onClick={() => {
                        closeMenu();
                        editor.rotateSelected("y", 180);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
                    >
                      <span>水平掉头 180°</span>
                      <span className="text-[10px] text-neutral-400">180°</span>
                    </button>
                    <div className="h-[1px] bg-[#333842] my-1 mx-1" />
                    <button
                      onClick={() => {
                        closeMenu();
                        editor.rotateSelected("x", 90);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
                    >
                      <span>立起 X +90°</span>
                      <span className="text-[10px] text-neutral-400">Pitch</span>
                    </button>
                    <button
                      onClick={() => {
                        closeMenu();
                        editor.rotateSelected("x", -90);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
                    >
                      <span>平放 X -90°</span>
                    </button>
                    <button
                      onClick={() => {
                        closeMenu();
                        editor.rotateSelected("z", 90);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
                    >
                      <span>侧旋 Z +90°</span>
                    </button>
                    <div className="h-[1px] bg-[#333842] my-1 mx-1" />
                    <button
                      onClick={() => {
                        closeMenu();
                        editor.resetRotationSelected();
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs text-neutral-400 hover:text-white"
                    >
                      <span>重置旋转归零 (0°)</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="h-[1px] bg-[#333842] my-1 mx-1" />
              <button
                onClick={() => {
                  closeMenu();
                  editor.focus();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
              >
                <span className="flex items-center space-x-2">
                  <Focus className="w-3.5 h-3.5" />
                  <span>聚焦</span>
                </span>
                <span className="text-[10px] text-neutral-400">F</span>
              </button>
              <button
                disabled={!hasSelection}
                onClick={() => {
                  closeMenu();
                  editor.deselect();
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs ${
                  hasSelection ? "hover:bg-[#3b82f6] hover:text-white" : "opacity-40 cursor-not-allowed"
                }`}
              >
                <span>取消选择</span>
                <span className="text-[10px] text-neutral-400">Esc</span>
              </button>
            </div>
          )}
        </div>

        {/* 3. 添加 (Add) - Three.js Editor Style */}
        <div
          className="relative"
          onMouseEnter={() => handleMenuEnter("add")}
        >
          <button
            onClick={() => setActiveMenu(activeMenu === "add" ? null : "add")}
            className={`px-2.5 py-1 rounded transition-colors text-xs font-normal ${
              activeMenu === "add"
                ? "bg-[#2e323b] text-white shadow-inner"
                : "text-neutral-300 hover:bg-[#2a2d34] hover:text-white"
            }`}
          >
            添加
          </button>
          {activeMenu === "add" && (
            <div
              className="absolute left-0 top-full mt-0.5 w-48 bg-[#22252b] border border-[#373c46] rounded-md shadow-2xl py-1 z-50 text-neutral-200"
              onMouseEnter={() => {
                if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
              }}
            >
              {/* 几何体子菜单 */}
              <div
                className="relative"
                onMouseEnter={() => handleSubmenuEnter("geometry")}
                onMouseLeave={() => setActiveSubmenu(null)}
              >
                <div
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                    activeSubmenu === "geometry" ? "bg-[#3b82f6] text-white" : "hover:bg-[#3b82f6] hover:text-white"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <Box className="w-3.5 h-3.5 text-blue-400" />
                    <span>几何体</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
                {activeSubmenu === "geometry" && (
                  <div className="absolute left-full top-0 ml-0.5 w-44 bg-[#22252b] border border-[#373c46] rounded-md shadow-2xl py-1 z-50 text-neutral-200">
                    <button
                      onClick={() => {
                        closeMenu();
                        editor.addPrimitive("box");
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center space-x-2 text-xs"
                    >
                      <Square className="w-3.5 h-3.5 text-amber-400" />
                      <span>立方体 (Box)</span>
                    </button>
                    <button
                      onClick={() => {
                        closeMenu();
                        editor.addPrimitive("cylinder");
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center space-x-2 text-xs"
                    >
                      <Circle className="w-3.5 h-3.5 text-emerald-400" />
                      <span>圆柱体 (Cylinder)</span>
                    </button>
                    <button
                      onClick={() => {
                        closeMenu();
                        editor.addPrimitive("sphere");
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center space-x-2 text-xs"
                    >
                      <Circle className="w-3.5 h-3.5 text-purple-400" />
                      <span>球体 (Sphere)</span>
                    </button>
                    <button
                      onClick={() => {
                        closeMenu();
                        editor.addPrimitive("plane");
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center space-x-2 text-xs"
                    >
                      <Square className="w-3.5 h-3.5 text-cyan-400" />
                      <span>平面 (Plane)</span>
                    </button>
                    <button
                      onClick={() => {
                        closeMenu();
                        editor.addPrimitive("torus");
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center space-x-2 text-xs"
                    >
                      <Circle className="w-3.5 h-3.5 text-pink-400" />
                      <span>圆环 (Torus)</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 光源子菜单 */}
              <div
                className="relative"
                onMouseEnter={() => handleSubmenuEnter("light")}
                onMouseLeave={() => setActiveSubmenu(null)}
              >
                <div
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                    activeSubmenu === "light" ? "bg-[#3b82f6] text-white" : "hover:bg-[#3b82f6] hover:text-white"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <Sun className="w-3.5 h-3.5 text-yellow-400" />
                    <span>光源</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
                {activeSubmenu === "light" && (
                  <div className="absolute left-full top-0 ml-0.5 w-44 bg-[#22252b] border border-[#373c46] rounded-md shadow-2xl py-1 z-50 text-neutral-200">
                    <button
                      onClick={() => {
                        closeMenu();
                        editor.addLight("directional");
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center space-x-2 text-xs"
                    >
                      <Sun className="w-3.5 h-3.5 text-yellow-400" />
                      <span>平行光 (Directional)</span>
                    </button>
                    <button
                      onClick={() => {
                        closeMenu();
                        editor.addLight("point");
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center space-x-2 text-xs"
                    >
                      <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                      <span>点光源 (Point)</span>
                    </button>
                    <button
                      onClick={() => {
                        closeMenu();
                        editor.addLight("spot");
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center space-x-2 text-xs"
                    >
                      <Sun className="w-3.5 h-3.5 text-orange-400" />
                      <span>聚光灯 (Spot)</span>
                    </button>
                    <button
                      onClick={() => {
                        closeMenu();
                        editor.addLight("ambient");
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center space-x-2 text-xs"
                    >
                      <Sun className="w-3.5 h-3.5 text-neutral-400" />
                      <span>环境光 (Ambient)</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="h-[1px] bg-[#333842] my-1 mx-1" />
              <button
                onClick={() => {
                  closeMenu();
                  editor.addGroup();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center space-x-2 text-xs"
              >
                <PlusCircle className="w-3.5 h-3.5 text-neutral-400" />
                <span>空组 (Group)</span>
              </button>
            </div>
          )}
        </div>

        {/* 4. 工程 (Engineering) */}
        <div
          className="relative"
          onMouseEnter={() => handleMenuEnter("engineering")}
        >
          <button
            onClick={() => setActiveMenu(activeMenu === "engineering" ? null : "engineering")}
            className={`px-2.5 py-1 rounded transition-colors text-xs font-normal ${
              activeMenu === "engineering"
                ? "bg-[#2e323b] text-white shadow-inner"
                : "text-neutral-300 hover:bg-[#2a2d34] hover:text-white"
            }`}
          >
            工程
          </button>
          {activeMenu === "engineering" && (
            <div
              className="absolute left-0 top-full mt-0.5 w-52 bg-[#22252b] border border-[#373c46] rounded-md shadow-2xl py-1 z-50 text-neutral-200"
              onMouseEnter={() => {
                if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
              }}
            >
              <button
                onClick={() => {
                  closeMenu();
                  editor.signals.sidebarTabChanged.dispatch("engineering");
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center space-x-2 text-xs"
              >
                <FileCode2 className="w-3.5 h-3.5 text-blue-400" />
                <span>FES 构件绑定与校验</span>
              </button>
              <button
                onClick={() => {
                  closeMenu();
                  editor.setExplode(editor.explodeProgress > 0 ? 0 : 50);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center space-x-2 text-xs"
              >
                <Share2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>{editor.explodeProgress > 0 ? "还原装配结构" : "装配体爆炸分析"}</span>
              </button>
              <button
                onClick={() => {
                  closeMenu();
                  editor.signals.sidebarTabChanged.dispatch("engineering");
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center space-x-2 text-xs"
              >
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                <span>坐标系与对齐适配</span>
              </button>
              <div className="h-[1px] bg-[#333842] my-1 mx-1" />
              <button
                disabled={!hasSelection}
                onClick={() => {
                  closeMenu();
                  onSplitMaterials?.();
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 text-xs ${
                  hasSelection ? "hover:bg-[#3b82f6] hover:text-white" : "opacity-40 cursor-not-allowed"
                }`}
              >
                <Scissors className="w-3.5 h-3.5 text-emerald-400" />
                <span>按材质拆分网格</span>
              </button>
              <button
                disabled={!hasSelection}
                onClick={() => {
                  closeMenu();
                  onSplitConnected?.();
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center space-x-2 text-xs ${
                  hasSelection ? "hover:bg-[#3b82f6] hover:text-white" : "opacity-40 cursor-not-allowed"
                }`}
              >
                <Scissors className="w-3.5 h-3.5 text-purple-400" />
                <span>按连通拓扑拆分</span>
              </button>
              <div className="h-[1px] bg-[#333842] my-1 mx-1" />
              <button
                onClick={() => {
                  closeMenu();
                  onToggleEngineeringDrawer();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
              >
                <span className="flex items-center space-x-2">
                  <FileCode2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>工程数据抽屉</span>
                </span>
                <span className="text-[10px] text-neutral-400">
                  {hasEngineeringData ? "已连接" : "未连接"}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* 5. 视图 (View) */}
        <div
          className="relative"
          onMouseEnter={() => handleMenuEnter("view")}
        >
          <button
            onClick={() => setActiveMenu(activeMenu === "view" ? null : "view")}
            className={`px-2.5 py-1 rounded transition-colors text-xs font-normal ${
              activeMenu === "view"
                ? "bg-[#2e323b] text-white shadow-inner"
                : "text-neutral-300 hover:bg-[#2a2d34] hover:text-white"
            }`}
          >
            视图
          </button>
          {activeMenu === "view" && (
            <div
              className="absolute left-0 top-full mt-0.5 w-48 bg-[#22252b] border border-[#373c46] rounded-md shadow-2xl py-1 z-50 text-neutral-200"
              onMouseEnter={() => {
                if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
              }}
            >
              <button
                onClick={() => {
                  closeMenu();
                  editor.setProjectionMode("perspective");
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
              >
                <span>透视投影</span>
                {editor.projectionMode === "perspective" && <Check className="w-3.5 h-3.5 text-blue-400" />}
              </button>
              <button
                onClick={() => {
                  closeMenu();
                  editor.setProjectionMode("orthographic");
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
              >
                <span>正交投影</span>
                {editor.projectionMode === "orthographic" && <Check className="w-3.5 h-3.5 text-blue-400" />}
              </button>
              <div className="h-[1px] bg-[#333842] my-1 mx-1" />

              {/* 预设视角子菜单 */}
              <div
                className="relative"
                onMouseEnter={() => handleSubmenuEnter("cameraPresets")}
                onMouseLeave={() => setActiveSubmenu(null)}
              >
                <div
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                    activeSubmenu === "cameraPresets" ? "bg-[#3b82f6] text-white" : "hover:bg-[#3b82f6] hover:text-white"
                  }`}
                >
                  <span>预设视角</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
                {activeSubmenu === "cameraPresets" && (
                  <div className="absolute left-full top-0 ml-0.5 w-44 bg-[#22252b] border border-[#373c46] rounded-md shadow-2xl py-1 z-50 text-neutral-200">
                    {(["FRONT", "BACK", "TOP", "BOTTOM", "LEFT", "RIGHT", "ISO"] as CameraPreset[]).map(
                      (preset) => (
                        <button
                          key={preset}
                          onClick={() => {
                            closeMenu();
                            editor.setCameraPreset(preset);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
                        >
                          <span>
                            {preset === "FRONT"
                              ? "正视图 (Front)"
                              : preset === "BACK"
                              ? "后视图 (Back)"
                              : preset === "TOP"
                              ? "顶视图 (Top)"
                              : preset === "BOTTOM"
                              ? "底视图 (Bottom)"
                              : preset === "LEFT"
                              ? "左视图 (Left)"
                              : preset === "RIGHT"
                              ? "右视图 (Right)"
                              : "等轴测 (Isometric)"}
                          </span>
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>

              <div className="h-[1px] bg-[#333842] my-1 mx-1" />
              <button
                onClick={() => {
                  closeMenu();
                  editor.focus();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
              >
                <span>聚焦全部</span>
                <span className="text-[10px] text-neutral-400">F</span>
              </button>
            </div>
          )}
        </div>

        {/* 6. 显示 (Display / Render) */}
        <div
          className="relative"
          onMouseEnter={() => handleMenuEnter("display")}
        >
          <button
            onClick={() => setActiveMenu(activeMenu === "display" ? null : "display")}
            className={`px-2.5 py-1 rounded transition-colors text-xs font-normal ${
              activeMenu === "display"
                ? "bg-[#2e323b] text-white shadow-inner"
                : "text-neutral-300 hover:bg-[#2a2d34] hover:text-white"
            }`}
          >
            显示
          </button>
          {activeMenu === "display" && (
            <div
              className="absolute left-0 top-full mt-0.5 w-48 bg-[#22252b] border border-[#373c46] rounded-md shadow-2xl py-1 z-50 text-neutral-200"
              onMouseEnter={() => {
                if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
              }}
            >
              {(
                [
                  { id: "solid", label: "实体 (Solid)" },
                  { id: "wireframe", label: "线框 (Wireframe)" },
                  { id: "ghost", label: "灰模 (Ghost)" },
                  { id: "xray", label: "X光 (X-Ray)" },
                ] as { id: WorkspaceViewMode; label: string }[]
              ).map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => {
                    closeMenu();
                    editor.setViewMode(mode.id);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
                >
                  <span>{mode.label}</span>
                  {editor.viewMode === mode.id && <Check className="w-3.5 h-3.5 text-blue-400" />}
                </button>
              ))}
              <div className="h-[1px] bg-[#333842] my-1 mx-1" />
              <button
                onClick={() => {
                  closeMenu();
                  editor.gridHelper.visible = !editor.gridHelper.visible;
                  editor.signals.sceneGraphChanged.dispatch();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
              >
                <span>地面网格</span>
                {editor.gridHelper.visible && <Check className="w-3.5 h-3.5 text-blue-400" />}
              </button>
              <button
                onClick={() => {
                  closeMenu();
                  editor.axesHelper.visible = !editor.axesHelper.visible;
                  editor.signals.sceneGraphChanged.dispatch();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
              >
                <span>坐标轴辅助</span>
                {editor.axesHelper.visible && <Check className="w-3.5 h-3.5 text-blue-400" />}
              </button>
              <div className="h-[1px] bg-[#333842] my-1 mx-1" />
              <button
                onClick={() => {
                  closeMenu();
                  onToggleDeveloperOverlay?.();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
              >
                <span>开发者性能监控</span>
                {showDeveloperOverlay && <Check className="w-3.5 h-3.5 text-blue-400" />}
              </button>
            </div>
          )}
        </div>

        {/* 7. 帮助 (Help) */}
        <div
          className="relative"
          onMouseEnter={() => handleMenuEnter("help")}
        >
          <button
            onClick={() => setActiveMenu(activeMenu === "help" ? null : "help")}
            className={`px-2.5 py-1 rounded transition-colors text-xs font-normal ${
              activeMenu === "help"
                ? "bg-[#2e323b] text-white shadow-inner"
                : "text-neutral-300 hover:bg-[#2a2d34] hover:text-white"
            }`}
          >
            帮助
          </button>
          {activeMenu === "help" && (
            <div
              className="absolute left-0 top-full mt-0.5 w-52 bg-[#22252b] border border-[#373c46] rounded-md shadow-2xl py-1 z-50 text-neutral-200"
              onMouseEnter={() => {
                if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
              }}
            >
              <button
                onClick={() => {
                  closeMenu();
                  onOpenShortcutsHelp?.();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#3b82f6] hover:text-white flex items-center justify-between text-xs"
              >
                <span className="flex items-center space-x-2">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>快捷键指南</span>
                </span>
                <span className="text-[10px] text-neutral-400">?</span>
              </button>
              <div className="h-[1px] bg-[#333842] my-1 mx-1" />
              <div className="px-3 py-2 text-[11px] text-neutral-400 leading-relaxed">
                <div className="font-semibold text-neutral-200">FES 3D Engineering Platform</div>
                <div className="text-neutral-500 text-[10px] mt-0.5">
                  Three.js DCC Standard Architecture
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Scene Title & FES Data Connector */}
      <div className="flex items-center space-x-2">
        <button
          onClick={onToggleEngineeringDrawer}
          className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded text-[11px] font-medium border transition-colors ${
            hasEngineeringData
              ? "bg-blue-950/40 text-blue-300 border-blue-800/60 hover:bg-blue-900/50"
              : "bg-neutral-800/60 text-neutral-400 border-neutral-700/50 hover:bg-neutral-800"
          }`}
          title="点击展开/折叠工程数据抽屉"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              hasEngineeringData ? "bg-emerald-400" : "bg-neutral-500"
            }`}
          />
          <span>{hasEngineeringData ? `FES: ${engineeringSku || "已连接"}` : "无 FES 数据"}</span>
        </button>

        <span className="text-neutral-400 text-[11px] truncate max-w-[160px]">
          {editor.currentSceneName}
        </span>
      </div>
    </div>
  );
};
