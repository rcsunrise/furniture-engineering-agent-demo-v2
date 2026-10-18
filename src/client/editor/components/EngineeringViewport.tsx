import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Upload } from "lucide-react";
import type { Engineering3DEditor } from "../Engineering3DEditor.js";
import { TransformController } from "../../utils/3d/transformController.js";
import { ViewCube } from "../../components/3d/ViewCube.js";
import { DeveloperOverlay } from "../../components/3d/DeveloperOverlay.js";
import { ContextualToolbar } from "../../components/3d/ContextualToolbar.js";
import { ModelLoaderService } from "../../utils/3d/modelLoaderService.js";
import { CoordinateSystemAdapter } from "../../utils/3d/coordinateSystemAdapter.js";
import { ScenePersistenceService } from "../../utils/3d/scenePersistenceService.js";

interface EngineeringViewportProps {
  editor: Engineering3DEditor;
  showDeveloperOverlay?: boolean;
  onCloseDeveloperOverlay?: () => void;
}

export const EngineeringViewport: React.FC<EngineeringViewportProps> = ({
  editor,
  showDeveloperOverlay = false,
  onCloseDeveloperOverlay,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformControllerRef = useRef<TransformController | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  // Diagnostics and camera position states for DeveloperOverlay
  const [camPos, setCamPos] = useState({ x: 1200, y: 1200, z: 1200 });
  const [camTarget, setCamTarget] = useState({ x: 0, y: 0, z: 0 });
  const [totalTriangles, setTotalTriangles] = useState<number>(0);
  const [instanceCount, setInstanceCount] = useState<number>(0);
  const [isDragOverViewport, setIsDragOverViewport] = useState(false);

  // Local state triggered by editor signals to force re-renders where necessary
  const [, setSignalTick] = useState<number>(0);

  const handleViewportDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverViewport(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["glb", "gltf", "obj", "stl", "ply", "fbx", "zip"].includes(ext)) continue;

      try {
        const buffer = await file.arrayBuffer();
        const parsed = await ModelLoaderService.loadModel(buffer, file.name);
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
          geometrySource: "drag_and_drop",
          sourceFileName: file.name,
        };
        editor.addObject(wrapper);
        editor.select(wrapper);
        editor.focus(wrapper);

        // Upload to server asset storage in background for cross-session recovery
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
          .catch((e) => console.warn("Viewport background upload error:", e));

        ScenePersistenceService.saveActiveScene(editor);
      } catch (err: any) {
        console.error("Failed to load dropped 3D model:", file.name, err);
        alert(`加载拖拽模型失败: ${err?.message || "无法解析 3D 文件"}`);
      }
    }
  }, [editor]);

  // Subscribe to editor signals
  useEffect(() => {
    const unsub1 = editor.signals.sceneGraphChanged.add(() => {
      setSignalTick((t) => t + 1);
      // Recalculate stats
      let tris = 0;
      let insts = editor.instancesGroup.children.length;
      editor.instancesGroup.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          const geom = (c as THREE.Mesh).geometry;
          if (geom) {
            tris += geom.index ? geom.index.count / 3 : (geom.attributes.position?.count || 0) / 3;
          }
        }
      });
      setTotalTriangles(Math.round(tris));
      setInstanceCount(insts);
    });

    const unsub2 = editor.signals.objectSelected.add(() => {
      setSignalTick((t) => t + 1);
    });

    const unsub3 = editor.signals.explodeChanged.add(() => {
      setSignalTick((t) => t + 1);
    });

    const unsub4 = editor.signals.projectionModeChanged.add(() => {
      setSignalTick((t) => t + 1);
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [editor]);

  // Viewport 3D Canvas Mounting & Render Loop
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Create Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting setup in editor.scene
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    ambientLight.name = "editorAmbientLight";
    editor.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.name = "editorMainLight";
    dirLight.position.set(2000, 3000, 2000);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 100;
    dirLight.shadow.camera.far = 10000;
    const d = 1500;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    editor.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xb0c4de, 0.8);
    fillLight.position.set(-2000, 1000, -2000);
    editor.scene.add(fillLight);

    // OrbitControls for Camera
    const controls = new OrbitControls(editor.camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxDistance = 20000;
    controls.minDistance = 20;
    controlsRef.current = controls;

    // TransformControls via TransformController
    const transformController = new TransformController(
      editor.camera,
      renderer.domElement,
      editor.sceneHelpers,
      controls
    );
    transformControllerRef.current = transformController;

    // Bind controls into editor core
    editor.bindControls(controls, transformController);

    // Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = Math.floor(entry.contentRect.width);
        const newHeight = Math.floor(entry.contentRect.height);
        if (newWidth <= 0 || newHeight <= 0) continue;

        renderer.setSize(newWidth, newHeight);

        if ((editor.camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
          const persp = editor.camera as THREE.PerspectiveCamera;
          persp.aspect = newWidth / newHeight;
          persp.updateProjectionMatrix();
        } else {
          const ortho = editor.camera as THREE.OrthographicCamera;
          const aspect = newWidth / newHeight;
          const halfSize = 1000;
          ortho.left = -halfSize * aspect;
          ortho.right = halfSize * aspect;
          ortho.top = halfSize;
          ortho.bottom = -halfSize;
          ortho.updateProjectionMatrix();
        }
      }
    });
    resizeObserver.observe(container);

    // Raycasting for Selection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let mouseDownPos = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      mouseDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      // If dragged, do not treat as selection click
      const dist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
      if (dist > 4) return;

      // Only left click
      if (e.button !== 0) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, editor.camera);
      const intersects = raycaster.intersectObjects(editor.instancesGroup.children, true);

      if (intersects.length > 0) {
        // Find top level instance object or mesh
        let hitObj: THREE.Object3D = intersects[0].object;
        let curr: THREE.Object3D | null = hitObj;
        let instanceParent: THREE.Object3D = hitObj;

        while (curr && curr !== editor.instancesGroup && curr !== editor.scene) {
          if (curr.parent === editor.instancesGroup) {
            instanceParent = curr;
            break;
          }
          curr = curr.parent;
        }

        editor.select(instanceParent);
      } else {
        editor.deselect();
      }
    };

    const onDoubleClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (editor.selected) {
        editor.focus(editor.selected);
      } else {
        editor.focus();
      }
    };

    const domElement = renderer.domElement;
    domElement.addEventListener("pointerdown", onPointerDown);
    domElement.addEventListener("pointerup", onPointerUp);
    domElement.addEventListener("dblclick", onDoubleClick);

    // Render Animation Loop
    let lastCameraPosUpdate = 0;
    const animate = (time: number) => {
      animationFrameIdRef.current = requestAnimationFrame(animate);

      if (!renderer || !controls) return;
      // When viewport is hidden (tab switched), skip rendering to save GPU/CPU
      if (container.clientWidth === 0 || container.clientHeight === 0) return;

      controls.update();

      renderer.clear();
      renderer.render(editor.scene, editor.camera);
      renderer.render(editor.sceneHelpers, editor.camera);

      // Throttle camera state update for dev overlay
      if (time - lastCameraPosUpdate > 300) {
        lastCameraPosUpdate = time;
        setCamPos({
          x: Math.round(editor.camera.position.x),
          y: Math.round(editor.camera.position.y),
          z: Math.round(editor.camera.position.z),
        });
        setCamTarget({
          x: Math.round(controls.target.x),
          y: Math.round(controls.target.y),
          z: Math.round(controls.target.z),
        });
      }
    };

    animationFrameIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      resizeObserver.disconnect();
      domElement.removeEventListener("pointerdown", onPointerDown);
      domElement.removeEventListener("pointerup", onPointerUp);
      domElement.removeEventListener("dblclick", onDoubleClick);

      controls.dispose();
      transformController.dispose();
      editor.scene.remove(ambientLight);
      editor.scene.remove(dirLight);
      editor.scene.remove(fillLight);

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [editor]);

  // Keyboard Shortcuts for DCC Operations
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      const key = e.key.toLowerCase();

      if (key === "w") {
        editor.setTransformMode("translate");
      } else if (key === "e") {
        editor.setTransformMode("rotate");
      } else if (key === "r") {
        editor.setTransformMode("scale");
      } else if (key === "f") {
        editor.focus(editor.selected || undefined);
      } else if (key === "escape") {
        editor.deselect();
      } else if (key === "delete" || key === "backspace") {
        editor.deleteSelected();
      } else if ((e.ctrlKey || e.metaKey) && key === "z") {
        if (e.shiftKey) {
          editor.redo();
        } else {
          editor.undo();
        }
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && key === "y") {
        editor.redo();
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && key === "d") {
        editor.duplicateSelected();
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOverViewport(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDragOverViewport(false);
        }
      }}
      onDrop={handleViewportDrop}
      className="flex-1 relative h-full min-w-0 overflow-hidden select-none bg-[#18191c]"
    >
      {/* 3D Canvas Mount Point */}
      <div ref={mountRef} className="w-full h-full absolute inset-0 cursor-default" />

      {/* Drag & Drop Visual Feedback Overlay */}
      {isDragOverViewport && (
        <div className="absolute inset-0 z-50 pointer-events-none bg-blue-950/40 border-2 border-dashed border-blue-500 flex flex-col items-center justify-center text-blue-200 backdrop-blur-xs">
          <Upload className="w-12 h-12 mb-2 animate-bounce text-blue-400" />
          <p className="text-sm font-semibold tracking-wide">释放以将 3D 模型置入场景</p>
          <p className="text-xs text-blue-300/80 mt-1">支持 .glb, .gltf, .obj, .stl 格式</p>
        </div>
      )}

      {/* Top-Right ViewCube Overlay */}
      <div className="absolute top-3 right-3 z-30 pointer-events-auto">
        <ViewCube
          camera={editor.camera}
          controls={controlsRef.current}
          onSelectPreset={(preset) => editor.setCameraPreset(preset)}
          projectionMode={editor.projectionMode}
          onToggleProjection={() =>
            editor.setProjectionMode(
              editor.projectionMode === "perspective" ? "orthographic" : "perspective"
            )
          }
        />
      </div>

      {/* Floating Contextual Toolbar (Appears during Explode, Mesh Split, or Rotate) */}
      <ContextualToolbar
        interactionMode={editor.transformMode as any}
        isExplodeActive={editor.explodeProgress > 0}
        explodeProgress={editor.explodeProgress}
        onExplodeChange={(val) => editor.setExplode(val)}
        selectedFaceCount={0}
        hasSelectedInstance={Boolean(editor.selected)}
        onRotate={(axis, deg) => editor.rotateSelected(axis, deg)}
        onResetRotation={() => editor.resetRotationSelected()}
      />

      {/* Developer Overlay (Floating at bottom-right, hidden by default) */}
      <DeveloperOverlay
        isOpen={showDeveloperOverlay}
        onClose={onCloseDeveloperOverlay || (() => {})}
        camPos={camPos}
        camTarget={camTarget}
        diagnostics={{
          componentCount: instanceCount,
          renderedMeshCount: instanceCount,
          fallbackCount: 0,
          failedComponentCount: 0,
        }}
        totalTriangles={totalTriangles}
        instanceCount={instanceCount}
      />
    </div>
  );
};
