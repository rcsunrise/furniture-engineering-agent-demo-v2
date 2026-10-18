import { useState, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type {
  Imported3DAsset,
  SceneModelInstance,
  Engineering3DScene,
} from "../../shared/imported3dAsset.js";
import { ModelLoaderService } from "../utils/3d/modelLoaderService.js";
import { CoordinateSystemAdapter } from "../utils/3d/coordinateSystemAdapter.js";
import { disposeHierarchy } from "../utils/3d/modelDisposal.js";
import { HistoryManager, type Command } from "../../shared/historyTypes.js";
import {
  TransformController,
  type TransformMode,
  type TransformSpace,
  type SnapSettings,
} from "../utils/3d/transformController.js";
import {
  CameraController,
  type CameraPreset,
  type ProjectionMode,
} from "../utils/3d/cameraController.js";
import {
  ViewModeManager,
  type WorkspaceViewMode,
} from "../utils/3d/viewModeManager.js";
import { FaceSelector } from "../utils/3d/faceSelector.js";
import { ExplodeEngine } from "../utils/3d/explodeEngine.js";
import {
  ModelSplitService,
  type SplitResult,
} from "../utils/3d/modelSplitService.js";
import type { ConnectedComponentInfo } from "../utils/3d/triangleConnectivity.js";
import type { InteractionMode } from "../components/3d/ViewToolbar.js";

export function useAssetWorkspace(hasEngineeringComponents: boolean) {
  const [activeMode, setActiveMode] = useState<"asset_workspace" | "engineering_fes">(
    hasEngineeringComponents ? "engineering_fes" : "asset_workspace"
  );
  const [currentScene, setCurrentScene] = useState<Engineering3DScene | null>(null);
  const [instances, setInstances] = useState<SceneModelInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [cachedAssets, setCachedAssets] = useState<Map<string, Imported3DAsset>>(new Map());

  // Interaction & Transform Mode (Sections B, D, E)
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("select");
  const [transformSpace, setTransformSpace] = useState<TransformSpace>("world");
  const [snapSettings, setSnapSettings] = useState<SnapSettings>({
    positionSnap: null,
    rotationSnap: null,
    scaleSnap: null,
  });

  // View Modes & Camera (Sections F, Q)
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>("solid");
  const [projectionMode, setProjectionMode] = useState<ProjectionMode>("perspective");
  const [isIsolated, setIsIsolated] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(true);

  // Layout Panels Collapsed States (Section A & C: Space toggle)
  const [isSceneTreeCollapsed, setIsSceneTreeCollapsed] = useState<boolean>(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState<boolean>(false);

  // Explode & Split state (Sections P, N)
  const [explodeProgress, setExplodeProgress] = useState<number>(0); // 0 to 100
  const [selectedFaceCount, setSelectedFaceCount] = useState<number>(0);

  // Dialog visibilities
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [isSaveAsOpen, setIsSaveAsOpen] = useState(false);
  const [isScenesListOpen, setIsScenesListOpen] = useState(false);
  const [isExportingGLB, setIsExportingGLB] = useState(false);

  // Three.js & Engine references
  const importedAssetsGroupRef = useRef<THREE.Group>(new THREE.Group());
  const instanceObjectsMapRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const historyManagerRef = useRef<HistoryManager>(new HistoryManager(60));
  const viewModeManagerRef = useRef<ViewModeManager>(new ViewModeManager());
  const explodeEngineRef = useRef<ExplodeEngine>(new ExplodeEngine());
  const transformControllerRef = useRef<TransformController | null>(null);
  const faceSelectorRef = useRef<FaceSelector | null>(null);

  // Undo/Redo trigger state for UI re-render
  const [, setHistoryVersion] = useState<number>(0);

  useEffect(() => {
    importedAssetsGroupRef.current.name = "importedAssetsGroup";
    const unsubscribe = historyManagerRef.current.subscribe(() => {
      setHistoryVersion((v) => v + 1);
    });
    return () => {
      unsubscribe();
      viewModeManagerRef.current.dispose();
      explodeEngineRef.current.clear();
      faceSelectorRef.current?.dispose();
    };
  }, []);

  // Update active mode when FES data changes
  useEffect(() => {
    if (!hasEngineeringComponents && activeMode === "engineering_fes") {
      setActiveMode("asset_workspace");
    }
  }, [hasEngineeringComponents, activeMode]);

  // Sync TransformControls mode when interactionMode changes
  useEffect(() => {
    if (!transformControllerRef.current) return;
    if (interactionMode === "translate" || interactionMode === "rotate" || interactionMode === "scale") {
      transformControllerRef.current.setMode(interactionMode as TransformMode);
      transformControllerRef.current.setEnabled(true);
    } else {
      transformControllerRef.current.setEnabled(false);
    }
  }, [interactionMode]);

  // Sync TransformControls space
  useEffect(() => {
    if (transformControllerRef.current) {
      transformControllerRef.current.setSpace(transformSpace);
    }
  }, [transformSpace]);

  // Sync TransformControls snaps
  useEffect(() => {
    if (transformControllerRef.current) {
      transformControllerRef.current.setSnapSettings(snapSettings);
    }
  }, [snapSettings]);

  // Sync target object to TransformControls & FaceSelector
  useEffect(() => {
    const targetObj = selectedInstanceId
      ? instanceObjectsMapRef.current.get(selectedInstanceId) || null
      : null;

    if (transformControllerRef.current) {
      if (targetObj && !instances.find((i) => i.instanceId === selectedInstanceId)?.locked) {
        transformControllerRef.current.attach(targetObj);
      } else {
        transformControllerRef.current.detach();
      }
    }

    if (faceSelectorRef.current) {
      // Find main mesh inside targetObj for face selection in split mode
      let targetMesh: THREE.Mesh | null = null;
      if (targetObj && interactionMode === "split") {
        targetObj.traverse((child) => {
          if (!targetMesh && (child as THREE.Mesh).isMesh) {
            targetMesh = child as THREE.Mesh;
          }
        });
      }
      faceSelectorRef.current.setTargetMesh(targetMesh);
      setSelectedFaceCount(0);
    }
  }, [selectedInstanceId, instances, interactionMode]);

  // Keyboard Shortcuts (W, E, R, F, Space, Ctrl+Z, Ctrl+Y, Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === "input" || targetTag === "textarea" || targetTag === "select") {
        return;
      }

      // Space = Toggle Maximize Viewport (Section C)
      if (e.code === "Space") {
        e.preventDefault();
        setIsSceneTreeCollapsed((prev) => !prev);
        setIsInspectorCollapsed((prev) => !prev);
        return;
      }

      // Ctrl/Cmd + Z = Undo (Section S)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        historyManagerRef.current.undo();
        return;
      }

      // Ctrl/Cmd + Y or Ctrl+Shift+Z = Redo (Section S)
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        historyManagerRef.current.redo();
        return;
      }

      // Ctrl/Cmd + S = Save Scene
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setIsSaveOpen(true);
        return;
      }

      // W = Translate (Section D)
      if (e.key.toLowerCase() === "w") {
        setInteractionMode("translate");
        return;
      }

      // E = Rotate (Section D)
      if (e.key.toLowerCase() === "e") {
        setInteractionMode("rotate");
        return;
      }

      // R = Scale (Section D)
      if (e.key.toLowerCase() === "r") {
        setInteractionMode("scale");
        return;
      }

      // Q or Escape = Select Mode
      if (e.key.toLowerCase() === "q" || e.key === "Escape") {
        setInteractionMode("select");
        return;
      }

      // Delete = Remove selected instance
      if (e.key === "Delete") {
        if (selectedInstanceId) {
          handleRemoveInstance(selectedInstanceId);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fit All Camera Helper
  const handleFitAll = useCallback((camera: THREE.Camera | null, controls: any) => {
    if (!camera || !controls) return;
    const group = importedAssetsGroupRef.current;
    if (!group || group.children.length === 0) return;

    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;

    CameraController.fitCameraToBox(camera as any, controls, box, 1.5);
  }, []);

  // Fit Selection Camera Helper
  const handleFitSelection = useCallback(
    (camera: THREE.Camera | null, controls: any) => {
      if (!camera || !controls || !selectedInstanceId) return;
      const targetObj = instanceObjectsMapRef.current.get(selectedInstanceId);
      if (!targetObj) return;

      CameraController.fitCameraToObject(camera as any, controls, targetObj, 1.6);
    },
    [selectedInstanceId]
  );

  // Model Import Handler
  const handleModelImported = useCallback(
    (asset: Imported3DAsset, wrapperObject: THREE.Object3D, camera?: THREE.Camera | null, controls?: any) => {
      const instanceId = `inst-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      wrapperObject.userData.instanceId = instanceId;
      wrapperObject.userData.assetId = asset.id;

      importedAssetsGroupRef.current.add(wrapperObject);
      instanceObjectsMapRef.current.set(instanceId, wrapperObject);
      setCachedAssets((prev) => new Map(prev).set(asset.id, asset));

      const newInstance: SceneModelInstance = {
        instanceId,
        assetId: asset.id,
        name: asset.name,
        transform: {
          position: [wrapperObject.position.x, wrapperObject.position.y, wrapperObject.position.z],
          rotation: [
            Math.round(THREE.MathUtils.radToDeg(wrapperObject.rotation.x)),
            Math.round(THREE.MathUtils.radToDeg(wrapperObject.rotation.y)),
            Math.round(THREE.MathUtils.radToDeg(wrapperObject.rotation.z)),
          ],
          scale: [wrapperObject.scale.x, wrapperObject.scale.y, wrapperObject.scale.z],
        },
        visible: true,
        locked: false,
        coordinateAdapter: {
          sourceUp: asset.coordinateSystem.detectedUp,
          alignGround: true,
          centerOrigin: true,
          scaleFactor: 1.0,
        },
      };

      setInstances((prev) => [...prev, newInstance]);
      setSelectedInstanceId(instanceId);
      setActiveMode("asset_workspace");

      if (camera && controls) {
        setTimeout(() => handleFitAll(camera, controls), 60);
      }
    },
    [handleFitAll]
  );

  // Load from Asset Library
  const handleSelectAssetFromLibrary = useCallback(
    async (asset: Imported3DAsset, camera?: THREE.Camera | null, controls?: any) => {
      try {
        const res = await fetch(asset.downloadUrl);
        if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
        const buffer = await res.arrayBuffer();

        const parsed = await ModelLoaderService.loadModel(buffer, asset.fileName);
        const { wrapper } = CoordinateSystemAdapter.wrapAndAlign(parsed.rootObject, {
          sourceUp: asset.coordinateSystem.detectedUp,
          targetUp: "FES",
          alignGround: true,
          centerOrigin: true,
        });

        handleModelImported(asset, wrapper, camera, controls);
      } catch (err: any) {
        alert(`加载资产失败: ${err.message}`);
      }
    },
    [handleModelImported]
  );

  // Update Transform with Undo/Redo History Command
  const handleUpdateTransform = useCallback(
    (
      instanceId: string,
      transform: {
        position: [number, number, number];
        rotation: [number, number, number];
        scale: [number, number, number];
      },
      recordHistory: boolean = false
    ) => {
      const obj = instanceObjectsMapRef.current.get(instanceId);
      const prevInst = instances.find((i) => i.instanceId === instanceId);
      const oldTransform = prevInst ? { ...prevInst.transform } : null;

      const apply = (t: typeof transform) => {
        if (obj) {
          obj.position.set(t.position[0], t.position[1], t.position[2]);
          obj.rotation.set(
            THREE.MathUtils.degToRad(t.rotation[0]),
            THREE.MathUtils.degToRad(t.rotation[1]),
            THREE.MathUtils.degToRad(t.rotation[2])
          );
          obj.scale.set(t.scale[0], t.scale[1], t.scale[2]);
        }
        setInstances((prev) =>
          prev.map((inst) => (inst.instanceId === instanceId ? { ...inst, transform: t } : inst))
        );
      };

      if (recordHistory && oldTransform) {
        const command: Command = {
          id: `cmd-transform-${Date.now()}`,
          name: `变换 ${prevInst?.name || "模型"}`,
          timestamp: Date.now(),
          execute: () => apply(transform),
          undo: () => apply(oldTransform),
          redo: () => apply(transform),
        };
        historyManagerRef.current.execute(command);
      } else {
        apply(transform);
      }
    },
    [instances]
  );

  // Update Coordinate Adapter
  const handleUpdateCoordinateAdapter = useCallback(
    (instanceId: string, adapter: SceneModelInstance["coordinateAdapter"]) => {
      const obj = instanceObjectsMapRef.current.get(instanceId);
      if (obj && obj.children.length > 0) {
        const innerModel = obj.children[0];
        CoordinateSystemAdapter.applyTransform(innerModel, adapter);
      }
      setInstances((prev) =>
        prev.map((inst) =>
          inst.instanceId === instanceId ? { ...inst, coordinateAdapter: adapter } : inst
        )
      );
    },
    []
  );

  // Update FES Component Binding
  const handleUpdateBinding = useCallback(
    (instanceId: string, binding?: { canonicalComponentId?: string; bindingMethod?: string }) => {
      setInstances((prev) =>
        prev.map((inst) =>
          inst.instanceId === instanceId ? { ...inst, binding } : inst
        )
      );
    },
    []
  );

  // Reset Transform
  const handleResetTransform = useCallback(
    (instanceId: string) => {
      handleUpdateTransform(
        instanceId,
        {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        true
      );
    },
    [handleUpdateTransform]
  );

  // Toggle Visibility with History
  const handleToggleVisibility = useCallback((instanceId: string) => {
    const obj = instanceObjectsMapRef.current.get(instanceId);
    let nextVis = true;

    setInstances((prev) =>
      prev.map((inst) => {
        if (inst.instanceId === instanceId) {
          nextVis = !inst.visible;
          if (obj) obj.visible = nextVis;
          return { ...inst, visible: nextVis };
        }
        return inst;
      })
    );

    const command: Command = {
      id: `cmd-vis-${Date.now()}`,
      name: `切换显隐: ${instanceId}`,
      timestamp: Date.now(),
      execute: () => {
        if (obj) obj.visible = nextVis;
        setInstances((prev) =>
          prev.map((i) => (i.instanceId === instanceId ? { ...i, visible: nextVis } : i))
        );
      },
      undo: () => {
        if (obj) obj.visible = !nextVis;
        setInstances((prev) =>
          prev.map((i) => (i.instanceId === instanceId ? { ...i, visible: !nextVis } : i))
        );
      },
      redo: () => {
        if (obj) obj.visible = nextVis;
        setInstances((prev) =>
          prev.map((i) => (i.instanceId === instanceId ? { ...i, visible: nextVis } : i))
        );
      },
    };
    historyManagerRef.current.execute(command);
  }, []);

  // Toggle Lock
  const handleToggleLock = useCallback((instanceId: string) => {
    setInstances((prev) =>
      prev.map((inst) =>
        inst.instanceId === instanceId ? { ...inst, locked: !inst.locked } : inst
      )
    );
  }, []);

  // Rename Instance (Section G)
  const handleRenameInstance = useCallback((instanceId: string, newName: string) => {
    let oldName = "";
    setInstances((prev) =>
      prev.map((inst) => {
        if (inst.instanceId === instanceId) {
          oldName = inst.name;
          return { ...inst, name: newName };
        }
        return inst;
      })
    );

    const command: Command = {
      id: `cmd-rename-${Date.now()}`,
      name: `重命名为 "${newName}"`,
      timestamp: Date.now(),
      execute: () => {
        setInstances((prev) =>
          prev.map((i) => (i.instanceId === instanceId ? { ...i, name: newName } : i))
        );
      },
      undo: () => {
        setInstances((prev) =>
          prev.map((i) => (i.instanceId === instanceId ? { ...i, name: oldName } : i))
        );
      },
      redo: () => {
        setInstances((prev) =>
          prev.map((i) => (i.instanceId === instanceId ? { ...i, name: newName } : i))
        );
      },
    };
    historyManagerRef.current.execute(command);
  }, []);

  // Remove Instance with History
  const handleRemoveInstance = useCallback(
    (instanceId: string) => {
      const obj = instanceObjectsMapRef.current.get(instanceId);
      const instData = instances.find((i) => i.instanceId === instanceId);
      if (!obj || !instData) return;

      importedAssetsGroupRef.current.remove(obj);
      instanceObjectsMapRef.current.delete(instanceId);
      setInstances((prev) => prev.filter((i) => i.instanceId !== instanceId));
      if (selectedInstanceId === instanceId) {
        setSelectedInstanceId(null);
      }

      const command: Command = {
        id: `cmd-del-${Date.now()}`,
        name: `删除 ${instData.name}`,
        timestamp: Date.now(),
        execute: () => {
          importedAssetsGroupRef.current.remove(obj);
          instanceObjectsMapRef.current.delete(instanceId);
          setInstances((prev) => prev.filter((i) => i.instanceId !== instanceId));
        },
        undo: () => {
          importedAssetsGroupRef.current.add(obj);
          instanceObjectsMapRef.current.set(instanceId, obj);
          setInstances((prev) => [...prev, instData]);
        },
        redo: () => {
          importedAssetsGroupRef.current.remove(obj);
          instanceObjectsMapRef.current.delete(instanceId);
          setInstances((prev) => prev.filter((i) => i.instanceId !== instanceId));
        },
      };
      historyManagerRef.current.execute(command);
    },
    [instances, selectedInstanceId]
  );

  // Clear Scene
  const handleClearScene = useCallback(() => {
    if (instances.length === 0) return;
    if (!confirm("确定要清空场景中的所有 3D 模型吗？（原资产库中的模型不会被删除）")) return;

    for (const [, obj] of instanceObjectsMapRef.current.entries()) {
      importedAssetsGroupRef.current.remove(obj);
      disposeHierarchy(obj);
    }
    instanceObjectsMapRef.current.clear();
    setInstances([]);
    setSelectedInstanceId(null);
    setCurrentScene(null);
    historyManagerRef.current.clear();
  }, [instances.length]);

  // Split Engine Integration: helper to register split results into scene & server
  const applySplitResult = useCallback(
    async (result: SplitResult) => {
      // 1. Remove original target from scene
      if (result.removedInstanceId) {
        const oldObj = instanceObjectsMapRef.current.get(result.removedInstanceId);
        if (oldObj) {
          importedAssetsGroupRef.current.remove(oldObj);
          instanceObjectsMapRef.current.delete(result.removedInstanceId);
        }
        setInstances((prev) => prev.filter((i) => i.instanceId !== result.removedInstanceId));
      }

      // 2. Add new three objects & instances
      result.threeObjects.forEach((obj, idx) => {
        const inst = result.newInstances[idx];
        importedAssetsGroupRef.current.add(obj);
        instanceObjectsMapRef.current.set(inst.instanceId, obj);
      });

      // 3. Register in explode engine
      result.threeObjects.forEach((obj, idx) => {
        const expData = result.explodeComponents[idx];
        if (expData) {
          explodeEngineRef.current.register(obj, expData);
        }
      });

      // 4. Update cached assets and instances
      setCachedAssets((prev) => {
        const next = new Map(prev);
        result.derivedAssets.forEach((asset) => next.set(asset.id, asset));
        return next;
      });

      setInstances((prev) => [...prev, ...result.newInstances]);
      if (result.newInstances.length > 0) {
        setSelectedInstanceId(result.newInstances[0].instanceId);
      }

      // 5. Asynchronously persist derived assets to server (Section O: Source Immutability)
      for (const derivedAsset of result.derivedAssets) {
        try {
          await fetch("/api/assets/derived", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(derivedAsset),
          });
        } catch (e) {
          console.warn("Could not persist derived asset to DB:", e);
        }
      }
    },
    []
  );

  // Split Mode 1: Scene Node Split (Section J)
  const handleSplitSceneNodes = useCallback(
    (instanceId: string) => {
      const obj = instanceObjectsMapRef.current.get(instanceId);
      const inst = instances.find((i) => i.instanceId === instanceId);
      if (!obj || !inst) return;
      const asset = cachedAssets.get(inst.assetId);
      if (!asset) return;

      const splitRes = ModelSplitService.splitBySceneNodes(obj, inst, asset);
      if (!splitRes) {
        alert("该模型没有多层级子节点可拆分");
        return;
      }
      applySplitResult(splitRes);
    },
    [instances, cachedAssets, applySplitResult]
  );

  // Split Mode 2: Material Group Split (Section K)
  const handleSplitMaterials = useCallback(
    (instanceId: string) => {
      const obj = instanceObjectsMapRef.current.get(instanceId);
      const inst = instances.find((i) => i.instanceId === instanceId);
      if (!obj || !inst) return;
      const asset = cachedAssets.get(inst.assetId);
      if (!asset) return;

      let targetMesh: THREE.Mesh | null = null;
      obj.traverse((child) => {
        if (!targetMesh && (child as THREE.Mesh).isMesh) {
          targetMesh = child as THREE.Mesh;
        }
      });

      if (!targetMesh) return;
      const splitRes = ModelSplitService.splitByMaterialGroups(targetMesh, inst, asset);
      if (!splitRes) {
        alert("该模型不是多材质组 (Multi-material group) 几何体");
        return;
      }
      applySplitResult(splitRes);
    },
    [instances, cachedAssets, applySplitResult]
  );

  // Split Mode 3: Connected Component Split (Section L)
  const handleSplitConnectedComponents = useCallback(
    (instanceId: string, minThreshold: number = 0.1) => {
      const obj = instanceObjectsMapRef.current.get(instanceId);
      const inst = instances.find((i) => i.instanceId === instanceId);
      if (!obj || !inst) return;
      const asset = cachedAssets.get(inst.assetId);
      if (!asset) return;

      let targetMesh: THREE.Mesh | null = null;
      obj.traverse((child) => {
        if (!targetMesh && (child as THREE.Mesh).isMesh) {
          targetMesh = child as THREE.Mesh;
        }
      });

      if (!targetMesh) return;
      const splitRes = ModelSplitService.splitByConnectedComponents(
        targetMesh,
        inst,
        asset,
        minThreshold
      );
      if (!splitRes) {
        alert("拓扑分析显示该模型为单一连续拓扑几何体，无需拆分");
        return;
      }
      applySplitResult(splitRes);
    },
    [instances, cachedAssets, applySplitResult]
  );

  // Split Mode 4: Manual Surface Extraction (Section N)
  const handleExtractFaces = useCallback(
    (instanceId: string) => {
      const obj = instanceObjectsMapRef.current.get(instanceId);
      const inst = instances.find((i) => i.instanceId === instanceId);
      if (!obj || !inst || !faceSelectorRef.current) return;
      const asset = cachedAssets.get(inst.assetId);
      if (!asset) return;

      const selectedFaces = faceSelectorRef.current.getSelectedFaceIndices();
      if (selectedFaces.length === 0) {
        alert("请先在 3D 视口中拾取选定表面三角面");
        return;
      }

      let targetMesh: any = null;
      obj.traverse((child) => {
        if (!targetMesh && (child as THREE.Mesh).isMesh) {
          targetMesh = child;
        }
      });

      if (!targetMesh) return;
      const res = ModelSplitService.extractSelectedFaces(targetMesh, inst, asset, selectedFaces);
      if (!res) {
        alert("无法提取选定面");
        return;
      }

      // Update remaining mesh geometry
      targetMesh.geometry.dispose();
      targetMesh.geometry = res.remainingGeometry;
      faceSelectorRef.current.clearSelection();
      setSelectedFaceCount(0);

      // Add newly extracted derived mesh to scene
      applySplitResult(res.extractedResult);
    },
    [instances, cachedAssets, applySplitResult]
  );

  // Small Component Deletion with Confirmation (Section M)
  const handleDeleteSmallComponents = useCallback(
    (instanceId: string, componentsToDelete: ConnectedComponentInfo[]) => {
      const obj = instanceObjectsMapRef.current.get(instanceId);
      if (!obj) return;

      let targetMesh: any = null;
      obj.traverse((child) => {
        if (!targetMesh && (child as THREE.Mesh).isMesh) {
          targetMesh = child;
        }
      });

      if (!targetMesh || !targetMesh.geometry) return;
      const cleanedGeom = ModelSplitService.removeComponents(targetMesh.geometry, componentsToDelete);
      targetMesh.geometry.dispose();
      targetMesh.geometry = cleanedGeom;
    },
    []
  );

  // View Mode Switcher (Section Q: Solid, Wireframe, Ghost, X-Ray)
  const handleSelectViewMode = useCallback((mode: WorkspaceViewMode) => {
    setViewMode(mode);
    viewModeManagerRef.current.setViewMode(mode, importedAssetsGroupRef.current);
  }, []);

  // Isolation (Section Q)
  const handleToggleIsolation = useCallback(() => {
    if (!selectedInstanceId) return;
    const targetObj = instanceObjectsMapRef.current.get(selectedInstanceId);
    if (!targetObj) return;

    if (isIsolated) {
      viewModeManagerRef.current.exitIsolation();
      setIsIsolated(false);
    } else {
      viewModeManagerRef.current.isolateObject(targetObj, importedAssetsGroupRef.current);
      setIsIsolated(true);
    }
  }, [selectedInstanceId, isIsolated]);

  // Explode Slider Change (Section P)
  const handleExplodeChange = useCallback((val: number) => {
    setExplodeProgress(val);
    explodeEngineRef.current.setProgress(val / 100);
  }, []);

  // Save Scene
  const handleSaveScene = useCallback(
    async (
      name: string,
      description: string,
      isSaveAs: boolean,
      camera: THREE.Camera | null,
      controls: any,
      cameraViewPreset = "ISO"
    ) => {
      const cameraData =
        camera && controls
          ? {
              position: [camera.position.x, camera.position.y, camera.position.z] as [number, number, number],
              target: [controls.target.x, controls.target.y, controls.target.z] as [number, number, number],
              fov: (camera as any).fov || 45,
            }
          : {
              position: [0, 500, 1500] as [number, number, number],
              target: [0, 200, 0] as [number, number, number],
              fov: 45,
            };

      const scenePayload = {
        id: isSaveAs || !currentScene ? undefined : currentScene.id,
        name,
        description,
        instances,
        camera: cameraData,
        viewMode: cameraViewPreset,
        explodeProgress,
        environment: {
          background: "#121216",
          grid: showGrid,
          shadows: true,
        },
      };

      const res = await fetch("/api/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scenePayload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "保存场景失败");
      }

      const result = await res.json();
      setCurrentScene(result.scene);
    },
    [currentScene, instances, explodeProgress, showGrid]
  );

  // Load Scene
  const handleLoadScene = useCallback(
    async (sceneToLoad: Engineering3DScene, camera: THREE.Camera | null, controls: any) => {
      for (const [, obj] of instanceObjectsMapRef.current.entries()) {
        importedAssetsGroupRef.current.remove(obj);
        disposeHierarchy(obj);
      }
      instanceObjectsMapRef.current.clear();
      explodeEngineRef.current.clear();
      setInstances([]);
      setSelectedInstanceId(null);

      if (camera && controls && sceneToLoad.camera) {
        camera.position.set(
          sceneToLoad.camera.position[0],
          sceneToLoad.camera.position[1],
          sceneToLoad.camera.position[2]
        );
        controls.target.set(
          sceneToLoad.camera.target[0],
          sceneToLoad.camera.target[1],
          sceneToLoad.camera.target[2]
        );
        controls.update();
      }

      const loadedInstances: SceneModelInstance[] = [];
      for (const inst of sceneToLoad.instances) {
        try {
          let asset = cachedAssets.get(inst.assetId);
          if (!asset) {
            const aRes = await fetch(`/api/assets`);
            const aData = await aRes.json();
            asset = aData.assets?.find((a: any) => a.id === inst.assetId);
            if (asset) {
              setCachedAssets((prev) => new Map(prev).set(asset!.id, asset!));
            }
          }

          if (asset) {
            const binRes = await fetch(asset.downloadUrl);
            const buffer = await binRes.arrayBuffer();
            const parsed = await ModelLoaderService.loadModel(buffer, asset.fileName);
            const { wrapper } = CoordinateSystemAdapter.wrapAndAlign(parsed.rootObject, {
              sourceUp: inst.coordinateAdapter?.sourceUp || asset.coordinateSystem.detectedUp,
              targetUp: "FES",
              alignGround: inst.coordinateAdapter?.alignGround ?? true,
              centerOrigin: inst.coordinateAdapter?.centerOrigin ?? true,
            });

            wrapper.position.set(...inst.transform.position);
            wrapper.rotation.set(
              THREE.MathUtils.degToRad(inst.transform.rotation[0]),
              THREE.MathUtils.degToRad(inst.transform.rotation[1]),
              THREE.MathUtils.degToRad(inst.transform.rotation[2])
            );
            wrapper.scale.set(...inst.transform.scale);
            wrapper.visible = inst.visible;
            wrapper.userData.instanceId = inst.instanceId;
            wrapper.userData.assetId = inst.assetId;

            importedAssetsGroupRef.current.add(wrapper);
            instanceObjectsMapRef.current.set(inst.instanceId, wrapper);
            loadedInstances.push(inst);
          }
        } catch (err) {
          console.warn("Failed to reload instance:", inst.instanceId, err);
        }
      }

      setInstances(loadedInstances);
      setCurrentScene(sceneToLoad);
      setActiveMode("asset_workspace");
    },
    [cachedAssets]
  );

  // Export GLB
  const handleExportGLB = useCallback(() => {
    setIsExportingGLB(true);
    try {
      const exporter = new GLTFExporter();
      const exportTarget =
        importedAssetsGroupRef.current.children.length > 0
          ? importedAssetsGroupRef.current
          : null;

      if (!exportTarget || exportTarget.children.length === 0) {
        alert("当前场景没有可导出的 3D 模型");
        setIsExportingGLB(false);
        return;
      }

      exporter.parse(
        exportTarget,
        (gltf) => {
          setIsExportingGLB(false);
          const blob = new Blob([gltf as ArrayBuffer], { type: "model/gltf-binary" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${currentScene?.name || "engineering_3d_scene"}.glb`;
          a.click();
          URL.revokeObjectURL(url);
        },
        (error) => {
          setIsExportingGLB(false);
          console.error("GLTFExporter error:", error);
          alert(`导出 GLB 失败: ${error}`);
        },
        { binary: true }
      );
    } catch (err: any) {
      setIsExportingGLB(false);
      alert(`导出异常: ${err.message}`);
    }
  }, [currentScene?.name]);

  // Pick Instance from 3D Canvas
  const handlePickInstance = useCallback((clickedObject: THREE.Object3D | null) => {
    if (!clickedObject) {
      setSelectedInstanceId(null);
      return;
    }
    let curr: THREE.Object3D | null = clickedObject;
    while (curr && curr.parent && curr !== importedAssetsGroupRef.current) {
      if (curr.userData?.instanceId) {
        setSelectedInstanceId(curr.userData.instanceId);
        return;
      }
      curr = curr.parent;
    }
    setSelectedInstanceId(null);
  }, []);

  return {
    activeMode,
    setActiveMode,
    currentScene,
    instances,
    selectedInstanceId,
    setSelectedInstanceId,
    cachedAssets,
    importedAssetsGroupRef,
    instanceObjectsMapRef,
    // Interaction & Controls
    interactionMode,
    setInteractionMode,
    transformSpace,
    setTransformSpace,
    snapSettings,
    setSnapSettings,
    viewMode,
    handleSelectViewMode,
    projectionMode,
    setProjectionMode,
    isIsolated,
    handleToggleIsolation,
    showGrid,
    setShowGrid,
    // Explode
    explodeProgress,
    handleExplodeChange,
    // Panels Collapsed
    isSceneTreeCollapsed,
    setIsSceneTreeCollapsed,
    isInspectorCollapsed,
    setIsInspectorCollapsed,
    // Face selection
    selectedFaceCount,
    setSelectedFaceCount,
    // Refs
    historyManagerRef,
    transformControllerRef,
    viewModeManagerRef,
    faceSelectorRef,
    explodeEngineRef,
    // Dialogs
    isImportOpen,
    setIsImportOpen,
    isLibraryOpen,
    setIsLibraryOpen,
    isSaveOpen,
    setIsSaveOpen,
    isSaveAsOpen,
    setIsSaveAsOpen,
    isScenesListOpen,
    setIsScenesListOpen,
    isExportingGLB,
    // Operations
    handleModelImported,
    handleSelectAssetFromLibrary,
    handleUpdateTransform,
    handleUpdateCoordinateAdapter,
    handleUpdateBinding,
    handleResetTransform,
    handleToggleVisibility,
    handleToggleLock,
    handleRenameInstance,
    handleRemoveInstance,
    handleClearScene,
    handleSaveScene,
    handleLoadScene,
    handleExportGLB,
    handleFitAll,
    handleFitSelection,
    handlePickInstance,
    // Split operations
    handleSplitSceneNodes,
    handleSplitMaterials,
    handleSplitConnectedComponents,
    handleExtractFaces,
    handleDeleteSmallComponents,
  };
}
