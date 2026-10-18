import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { Engineering3DEditor } from "./Engineering3DEditor.js";
import { EngineeringViewport } from "./components/EngineeringViewport.js";
import { EditorMenubar } from "./components/EditorMenubar.js";
import { EditorSidebar } from "./components/EditorSidebar.js";
import { EditorToolbar } from "./components/EditorToolbar.js";
import { EngineeringDataDrawer } from "../components/3d/EngineeringDataDrawer.js";
import { ModelImportDialog } from "../components/3d/ModelImportDialog.js";
import { SaveSceneDialog } from "../components/3d/SaveSceneDialog.js";
import { ScenesListModal } from "../components/3d/ScenesListModal.js";
import { AddObjectCommand, SplitMeshCommand } from "./commands/index.js";
import { ModelSplitService } from "../utils/3d/modelSplitService.js";
import { ThreeShapeFactory } from "../utils/threeShapeFactory.js";
import {
  fesToThreePosition,
  fesToThreeSize,
  fesToThreeRotation,
  getVisualizationMaterialColor,
} from "../utils/threeAdapter.js";
import type { AssemblyDocument } from "../../shared/assembly.js";
import type { Imported3DAsset, Engineering3DScene } from "../../shared/imported3dAsset.js";
import { ScenePersistenceService } from "../utils/3d/scenePersistenceService.js";
import { X, Keyboard, HelpCircle } from "lucide-react";

interface EngineeringEditorViewProps {
  assembly?: AssemblyDocument | null;
  selectedComponentId?: string | null;
  onSelectComponent?: (id: string | null) => void;
  aiReferenceMeshUrl?: string | null;
  aiReferenceArtifact?: any;
  engineeringData?: {
    fes?: any;
    upload?: (file: File) => void;
    loadSample?: () => void;
    validationReport?: any;
  };
}

export const EngineeringEditorView: React.FC<EngineeringEditorViewProps> = ({
  assembly,
  selectedComponentId,
  onSelectComponent,
  aiReferenceMeshUrl,
  aiReferenceArtifact,
  engineeringData,
}) => {
  // 1. Single Editor Core instance
  const editor = useMemo(() => new Engineering3DEditor(), []);

  // 2. Dialog & Drawer states
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [isSaveAsOpen, setIsSaveAsOpen] = useState(false);
  const [isScenesListOpen, setIsScenesListOpen] = useState(false);
  const [isEngineeringDrawerOpen, setIsEngineeringDrawerOpen] = useState(false);
  const [showDeveloperOverlay, setShowDeveloperOverlay] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [currentSceneMetadata, setCurrentSceneMetadata] = useState<Engineering3DScene | null>(null);

  // Sync external engineering data to editor
  useEffect(() => {
    editor.setEngineeringDocument(assembly || null);
  }, [editor, assembly]);

  // Sync selected component between React & Editor core
  useEffect(() => {
    const unsub = editor.signals.objectSelected.add((obj) => {
      const compId = obj?.userData?.canonicalComponentId || null;
      if (onSelectComponent) {
        onSelectComponent(compId);
      }
    });
    return () => unsub();
  }, [editor, onSelectComponent]);

  // Auto-restore cached scene if present, otherwise populate procedural components from assembly
  useEffect(() => {
    let isCancelled = false;

    async function initWorkspace() {
      if (ScenePersistenceService.hasCachedScene()) {
        try {
          const restored = await ScenePersistenceService.restoreActiveScene(editor);
          if (restored) return;
        } catch (e) {
          console.warn("[EngineeringEditorView] Cache restore failed, falling back to assembly:", e);
        }
      }

      if (isCancelled) return;
      if (!assembly || !assembly.components || assembly.components.length === 0) return;
      if (editor.instancesGroup.children.length > 0) return;

      const group = new THREE.Group();
      group.name = `Assembly_${(assembly as any).sku || (assembly as any).productSku || "FES"}`;

      for (const comp of assembly.components) {
        try {
          const pos = fesToThreePosition(comp.position);
          const rot = fesToThreeRotation(comp.rotation);
          const threeSize = fesToThreeSize(comp.size);
          const geom = ThreeShapeFactory.createGeometryForComponent({
            id: comp.id,
            type: comp.type,
            geometryMode: comp.geometryMode,
            loftGroup: comp.loftGroup,
            softGroup: comp.softGroup,
            size: threeSize,
            position: pos,
            shape: comp.shape,
            loftSections: assembly.loftSections,
            softSurfaceParams: assembly.softSurfaceParams,
          });
          const color = getVisualizationMaterialColor(comp.type);
          const mat = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.45,
            metalness: 0.1,
          });
          const mesh = new THREE.Mesh(geom, mat);
          mesh.position.set(pos.x, pos.y, pos.z);
          mesh.rotation.set(rot.x, rot.y, rot.z);
          mesh.name = comp.name || comp.id;
          mesh.userData = {
            canonicalComponentId: comp.id,
            partId: (comp as any).partId || comp.id,
            material: comp.material,
            productionTruth: comp.productionTruth ?? true,
          };
          group.add(mesh);
        } catch (e) {
          console.warn(`Failed to create shape for component ${comp.id}:`, e);
        }
      }

      if (group.children.length > 0) {
        editor.addObject(group);
        editor.focus(group);
        ScenePersistenceService.saveActiveScene(editor);
      }
    }

    initWorkspace();

    return () => {
      isCancelled = true;
    };
  }, [editor, assembly]);

  // Auto-persist scene changes to local cache
  useEffect(() => {
    const unsub1 = editor.signals.sceneGraphChanged.add(() => {
      ScenePersistenceService.saveActiveScene(editor);
    });
    const unsub2 = editor.signals.historyChanged.add(() => {
      ScenePersistenceService.saveActiveScene(editor);
    });
    const unsub3 = editor.signals.objectChanged.add(() => {
      ScenePersistenceService.saveActiveScene(editor);
    });
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [editor]);

  // If AI reference mesh URL is provided, load into editor
  const lastLoadedAiMeshRef = useRef<string | null>(null);
  useEffect(() => {
    if (!aiReferenceMeshUrl) return;
    if (lastLoadedAiMeshRef.current === aiReferenceMeshUrl) return;
    lastLoadedAiMeshRef.current = aiReferenceMeshUrl;

    editor
      .loadGLTF(aiReferenceMeshUrl)
      .then((object) => {
        object.userData = {
          ...object.userData,
          geometrySource: "ai_reference_mesh",
          productionTruth: false,
          downloadUrl: aiReferenceMeshUrl,
          assetId: aiReferenceArtifact?.id || "",
          canonicalComponentId: aiReferenceArtifact?.mappedComponentId || null,
        };
        editor.select(object);
        editor.focus(object);
        ScenePersistenceService.saveActiveScene(editor);
      })
      .catch((err) => {
        console.error("Failed to load AI reference GLTF:", err);
      });
  }, [editor, aiReferenceMeshUrl, aiReferenceArtifact]);

  // Model Import Handler
  const handleModelImported = useCallback(
    (asset: Imported3DAsset, object: THREE.Object3D) => {
      object.name = asset.name || object.name || "Imported_Mesh";
      object.userData = {
        ...object.userData,
        assetId: asset.id,
        downloadUrl: asset.downloadUrl,
        geometrySource: "imported_asset",
        productionTruth: false,
      };
      editor.addObject(object);
      editor.select(object);
      editor.focus(object);
      setIsImportOpen(false);
      ScenePersistenceService.saveActiveScene(editor);
    },
    [editor]
  );

  // Save Scene Handler
  const handleSaveScene = useCallback(
    async (name: string, description: string, isSaveAs: boolean) => {
      try {
        const sceneData: any = {
          name,
          description,
          cameraPreset: "PERSPECTIVE",
          explodeRatio: editor.explodeProgress / 100,
          instances: editor.instancesGroup.children.map((child, idx) => ({
            instanceId:
              child.userData?.instanceId ||
              child.uuid ||
              `inst_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: child.name || `Model_${idx}`,
            assetId: child.userData?.assetId || "",
            transform: {
              position: [child.position.x, child.position.y, child.position.z] as [number, number, number],
              rotation: [child.rotation.x, child.rotation.y, child.rotation.z] as [number, number, number],
              scale: [child.scale.x, child.scale.y, child.scale.z] as [number, number, number],
            },
            visible: child.visible,
            locked: Boolean(child.userData?.locked),
            coordinateAdapter: {
              sourceUp: "Y_UP" as const,
              alignGround: true,
              centerOrigin: true,
              scaleFactor: 1.0,
            },
            componentBinding: {
              canonicalComponentId: child.userData?.canonicalComponentId || undefined,
            },
          })),
        };

        const method = currentSceneMetadata && !isSaveAs ? "PUT" : "POST";
        const url =
          currentSceneMetadata && !isSaveAs
            ? `/api/scenes/${currentSceneMetadata.id}`
            : "/api/scenes";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sceneData),
        });

        const data = await res.json();
        if (data.success && data.scene) {
          setCurrentSceneMetadata(data.scene);
          editor.setSceneName(data.scene.name);
          setIsSaveOpen(false);
          setIsSaveAsOpen(false);
        } else {
          alert(`保存场景失败: ${data.error || "未知错误"}`);
        }
      } catch (err: any) {
        alert(`保存场景异常: ${err?.message || "网络错误"}`);
      }
    },
    [editor, currentSceneMetadata]
  );

  // Load Scene Handler
  const handleLoadScene = useCallback(
    async (scene: Engineering3DScene) => {
      try {
        editor.clear();
        setCurrentSceneMetadata(scene);
        editor.setSceneName(scene.name);

        const seenLoadedIds = new Set<string>();
        const instancesList = scene.instances || [];

        for (let idx = 0; idx < instancesList.length; idx++) {
          const inst = instancesList[idx];
          // Support both SceneModelInstance (canonical) and legacy instance objects
          const rawInst = inst as any;
          const pos = rawInst.transform?.position || (rawInst.position ? [rawInst.position.x || 0, rawInst.position.y || 0, rawInst.position.z || 0] : [0, 0, 0]);
          const rot = rawInst.transform?.rotation || (rawInst.rotation ? [rawInst.rotation.x || 0, rawInst.rotation.y || 0, rawInst.rotation.z || 0] : [0, 0, 0]);
          const scl = rawInst.transform?.scale || (rawInst.scale ? [rawInst.scale.x ?? 1, rawInst.scale.y ?? 1, rawInst.scale.z ?? 1] : [1, 1, 1]);
          let instId = rawInst.instanceId || rawInst.id || `inst_${idx}_${Math.random().toString(36).substring(2, 7)}`;
          if (seenLoadedIds.has(instId)) {
            instId = `${instId}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
          }
          seenLoadedIds.add(instId);

          const canonId = rawInst.componentBinding?.canonicalComponentId || rawInst.canonicalComponentId || null;

          const group = new THREE.Group();
          group.name = rawInst.name || "Model";
          group.position.set(pos[0], pos[1], pos[2]);
          group.rotation.set(rot[0], rot[1], rot[2]);
          group.scale.set(scl[0], scl[1], scl[2]);
          group.visible = rawInst.visible !== false;
          group.userData = {
            instanceId: instId,
            assetId: rawInst.assetId,
            locked: rawInst.locked,
            canonicalComponentId: canonId,
          };

          if (rawInst.assetId) {
            try {
              const res = await fetch(`/api/assets/${rawInst.assetId}`);
              const assetData = await res.json();
              if (assetData.success && assetData.asset?.downloadUrl) {
                const loaded = await editor.loadGLTF(assetData.asset.downloadUrl);
                loaded.position.copy(group.position);
                loaded.rotation.copy(group.rotation);
                loaded.scale.copy(group.scale);
                loaded.name = rawInst.name;
                loaded.userData = group.userData;
                continue;
              }
            } catch (e) {
              console.warn(`Could not load asset ${rawInst.assetId}:`, e);
            }
          }
          editor.addObject(group);
        }

        editor.focus();
        setIsScenesListOpen(false);
      } catch (err: any) {
        alert(`加载场景失败: ${err?.message}`);
      }
    },
    [editor]
  );

  // Export GLB Handler
  const handleExportGLB = useCallback(() => {
    const exporter = new GLTFExporter();
    exporter.parse(
      editor.instancesGroup,
      (gltf) => {
        const blob = new Blob([gltf as ArrayBuffer], { type: "model/gltf-binary" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${editor.currentSceneName || "furniture_assembly"}.glb`;
        a.click();
        URL.revokeObjectURL(url);
      },
      (error) => {
        console.error("GLTF export error:", error);
        alert("导出 GLB 失败");
      },
      { binary: true }
    );
  }, [editor]);

  // Mesh Split by Material Handler
  const handleSplitMaterials = useCallback(() => {
    if (!editor.selected) return;
    const selected = editor.selected;
    const result = ModelSplitService.splitByMaterials(selected);
    if (result.createdObjects.length > 0) {
      editor.execute(new SplitMeshCommand(editor, selected, result.createdObjects));
    }
  }, [editor]);

  // Mesh Split Connected Components Handler
  const handleSplitConnected = useCallback(() => {
    if (!editor.selected) return;
    const selected = editor.selected;
    const result = ModelSplitService.splitConnectedComponents(selected, 0.5);
    if (result.createdObjects.length > 0) {
      editor.execute(new SplitMeshCommand(editor, selected, result.createdObjects));
    }
  }, [editor]);

  return (
    <div className="flex flex-col h-full w-full bg-[#121316] text-neutral-200 overflow-hidden font-sans select-none relative">
      {/* 1. Top Menubar (34px) */}
      <EditorMenubar
        editor={editor}
        onOpenImport={() => setIsImportOpen(true)}
        onOpenSave={() => setIsSaveOpen(true)}
        onOpenSaveAs={() => setIsSaveAsOpen(true)}
        onOpenScenesList={() => setIsScenesListOpen(true)}
        onExportGLB={handleExportGLB}
        onToggleEngineeringDrawer={() => setIsEngineeringDrawerOpen((prev) => !prev)}
        isEngineeringDrawerOpen={isEngineeringDrawerOpen}
        hasEngineeringData={Boolean(assembly && assembly.components.length > 0)}
        engineeringSku={(assembly as any)?.sku || (assembly as any)?.productSku}
        showDeveloperOverlay={showDeveloperOverlay}
        onToggleDeveloperOverlay={() => setShowDeveloperOverlay((prev) => !prev)}
        onOpenShortcutsHelp={() => setShowShortcutsModal(true)}
        onSplitMaterials={handleSplitMaterials}
        onSplitConnected={handleSplitConnected}
      />

      {/* 2. Middle Body: Central Viewport + Right Sidebar */}
      <div className="flex-1 flex min-h-0 w-full overflow-hidden relative">
        {/* Central Dominant Viewport (>75% width) */}
        <EngineeringViewport
          editor={editor}
          showDeveloperOverlay={showDeveloperOverlay}
          onCloseDeveloperOverlay={() => setShowDeveloperOverlay(false)}
        />

        {/* Right Sidebar (280-340px) */}
        <EditorSidebar editor={editor} assemblyDoc={assembly} />
      </div>

      {/* 3. Bottom Toolbar (34px) */}
      <EditorToolbar editor={editor} />

      {/* Engineering Data Drawer (Fly-out drawer, default collapsed) */}
      <EngineeringDataDrawer
        isOpen={isEngineeringDrawerOpen}
        onClose={() => setIsEngineeringDrawerOpen(false)}
        assembly={assembly}
        onUploadFile={engineeringData?.upload}
        onLoadSample={engineeringData?.loadSample}
        validationReport={engineeringData?.validationReport}
      />

      {/* Model Import Dialog */}
      <ModelImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onModelImported={handleModelImported}
      />

      {/* Save Scene Dialog */}
      <SaveSceneDialog
        isOpen={isSaveOpen}
        onClose={() => setIsSaveOpen(false)}
        currentScene={currentSceneMetadata}
        isSaveAsMode={false}
        onSave={handleSaveScene}
      />

      {/* Save Scene As Dialog */}
      <SaveSceneDialog
        isOpen={isSaveAsOpen}
        onClose={() => setIsSaveAsOpen(false)}
        currentScene={currentSceneMetadata}
        isSaveAsMode={true}
        onSave={handleSaveScene}
      />

      {/* Scenes List Modal */}
      <ScenesListModal
        isOpen={isScenesListOpen}
        onClose={() => setIsScenesListOpen(false)}
        currentSceneId={currentSceneMetadata?.id}
        onLoadScene={handleLoadScene}
      />

      {/* Shortcuts Guide Modal */}
      {showShortcutsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-[#1e2025] border border-[#33373e] rounded-xl shadow-2xl w-[420px] max-w-[90vw] p-5 text-neutral-200">
            <div className="flex items-center justify-between border-b border-[#2e3238] pb-3 mb-4">
              <div className="flex items-center space-x-2">
                <Keyboard className="w-5 h-5 text-blue-400" />
                <h3 className="font-semibold text-sm text-white">快捷键指南 (Shortcuts)</h3>
              </div>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="p-1 text-neutral-400 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-[#2a2d33]">
                <span className="text-neutral-400">平移模式 (Translate)</span>
                <kbd className="px-2 py-0.5 bg-[#292c33] rounded font-mono text-neutral-200 border border-[#373a42]">W</kbd>
              </div>
              <div className="flex justify-between py-1 border-b border-[#2a2d33]">
                <span className="text-neutral-400">旋转模式 (Rotate)</span>
                <kbd className="px-2 py-0.5 bg-[#292c33] rounded font-mono text-neutral-200 border border-[#373a42]">E</kbd>
              </div>
              <div className="flex justify-between py-1 border-b border-[#2a2d33]">
                <span className="text-neutral-400">缩放模式 (Scale)</span>
                <kbd className="px-2 py-0.5 bg-[#292c33] rounded font-mono text-neutral-200 border border-[#373a42]">R</kbd>
              </div>
              <div className="flex justify-between py-1 border-b border-[#2a2d33]">
                <span className="text-neutral-400">聚焦选中对象 (Focus)</span>
                <kbd className="px-2 py-0.5 bg-[#292c33] rounded font-mono text-neutral-200 border border-[#373a42]">F</kbd>
              </div>
              <div className="flex justify-between py-1 border-b border-[#2a2d33]">
                <span className="text-neutral-400">撤销 / 重做 (Undo / Redo)</span>
                <div className="space-x-1">
                  <kbd className="px-1.5 py-0.5 bg-[#292c33] rounded font-mono text-neutral-200 border border-[#373a42]">Ctrl+Z</kbd>
                  <kbd className="px-1.5 py-0.5 bg-[#292c33] rounded font-mono text-neutral-200 border border-[#373a42]">Ctrl+Y</kbd>
                </div>
              </div>
              <div className="flex justify-between py-1 border-b border-[#2a2d33]">
                <span className="text-neutral-400">复制选中对象 (Duplicate)</span>
                <kbd className="px-2 py-0.5 bg-[#292c33] rounded font-mono text-neutral-200 border border-[#373a42]">Ctrl+D</kbd>
              </div>
              <div className="flex justify-between py-1 border-b border-[#2a2d33]">
                <span className="text-neutral-400">删除选中对象 (Delete)</span>
                <kbd className="px-2 py-0.5 bg-[#292c33] rounded font-mono text-neutral-200 border border-[#373a42]">Del / Backspace</kbd>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-neutral-400">取消选择 (Deselect)</span>
                <kbd className="px-2 py-0.5 bg-[#292c33] rounded font-mono text-neutral-200 border border-[#373a42]">Esc</kbd>
              </div>
            </div>

            <div className="mt-5 text-right">
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
