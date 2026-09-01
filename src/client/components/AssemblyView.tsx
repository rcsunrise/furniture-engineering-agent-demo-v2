import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AssemblyDocument } from "../../shared/assembly.js";
import {
  fesToThreePosition,
  fesToThreeSize,
  fesToThreeRotation,
  PRODUCT_FRONT_AXIS,
  getVisualizationMaterialColor,
  VISUALIZATION_MATERIAL_PALETTE,
  fitCameraToObject,
} from "../utils/threeAdapter.js";
import { ThreeShapeFactory } from "../utils/threeShapeFactory.js";
import { export3DModel, type Export3DFormat } from "../utils/threeExporter.js";
import { EngineeringPipelineDiagnosticsView } from "./EngineeringPipelineDiagnosticsView.js";
import { isProductionEligible } from "../../shared/engineeringSession.js";

import { evaluateComponentDiagnostics } from "../utils/geometryBuilders/geometryDiagnostics.js";

import {
  SignedAxis,
  OriginMode,
  MeshBounds,
  MeshNormalizationTransform,
  MeshAlignmentDiagnostic,
  NormalizationStatus,
  MeshScaleMode,
  MeshDimensionAlignment,
  MeshAnchorMode,
  MeshComponentPlacement,
  MeshEngineeringTransform,
} from "../../shared/meshAlignment.js";
import { inspectMesh } from "../utils/meshAlignment/meshInspector.js";
import {
  parseSignedAxis,
  computeNormalizationTransform,
} from "../utils/meshAlignment/axisNormalizer.js";
import {
  computeDimensionAlignment,
  DimensionAlignmentResult,
} from "../utils/meshAlignment/dimensionAligner.js";
import {
  computeComponentPlacement,
  resolveComponentAnchor,
  ComputeComponentPlacementResult,
} from "../utils/meshAlignment/componentPlacer.js";
import {
  evaluateGeometryResidual,
  EvaluateGeometryResult,
} from "../utils/geometryEvaluation/geometryEvaluator.js";
import {
  GeometryResidualReport,
  ProjectionResidual,
} from "../../shared/geometryEvaluation.js";

type ViewPreset = "FRONT" | "LEFT" | "RIGHT" | "TOP" | "ISO" | "PERSPECTIVE" | "RESET";
type DisplayMode =
  | "engineering"
  | "raw_ai"
  | "normalized_ai"
  | "dimension_aligned_ai"
  | "placed_ai"
  | "overlay"
  | "contour_overlay";



function vectorToSignedAxis(v: THREE.Vector3): SignedAxis {
  const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
  if (ax >= ay && ax >= az) {
    return v.x >= 0 ? "+X" : "-X";
  } else if (ay >= ax && ay >= az) {
    return v.y >= 0 ? "+Y" : "-Y";
  } else {
    return v.z >= 0 ? "+Z" : "-Z";
  }
}

function rotateAxisMapping90(
  up: SignedAxis,
  front: SignedAxis,
  rotationAxis: "X" | "Y" | "Z"
): { up: SignedAxis; front: SignedAxis } {
  const vUp = parseSignedAxis(up);
  const vFront = parseSignedAxis(front);
  const rotMat = new THREE.Matrix4();
  const rad = Math.PI / 2;
  if (rotationAxis === "X") rotMat.makeRotationX(rad);
  else if (rotationAxis === "Y") rotMat.makeRotationY(rad);
  else if (rotationAxis === "Z") rotMat.makeRotationZ(rad);

  vUp.applyMatrix4(rotMat);
  vFront.applyMatrix4(rotMat);

  return {
    up: vectorToSignedAxis(vUp),
    front: vectorToSignedAxis(vFront),
  };
}

export function AssemblyView({
  assembly,
  selectedComponentId,
  onSelectComponent,
  aiReferenceMeshUrl,
  aiReferenceArtifact,
}: {
  assembly: AssemblyDocument;
  selectedComponentId?: string | null;
  onSelectComponent?: (id: string | null) => void;
  aiReferenceMeshUrl?: string | null;
  aiReferenceArtifact?: any;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [explodeRatio, setExplodeRatio] = useState(0.0);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showAlignmentInspector, setShowAlignmentInspector] = useState(true);
  const [currentViewMode, setCurrentViewMode] = useState<string>("FRONT");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("engineering");
  const [aiMeshStatus, setAiMeshStatus] = useState<"none" | "loading" | "loaded" | "failed">("none");
  const [aiMeshError, setAiMeshError] = useState<string | null>(null);
  const [camTarget, setCamTarget] = useState({ x: 0, y: 0, z: 0 });
  const [camPos, setCamPos] = useState({ x: 0, y: 0, z: 0 });
  const [rendererDiagnostics, setRendererDiagnostics] = useState<{
    componentCount: number;
    renderedMeshCount: number;
    fallbackCount: number;
    failedComponentCount: number;
  }>({
    componentCount: 0,
    renderedMeshCount: 0,
    fallbackCount: 0,
    failedComponentCount: 0,
  });

  // Mesh Alignment State (G4-4A & G4-4B)
  const [meshUpAxis, setMeshUpAxis] = useState<SignedAxis>("+Z");
  const [meshFrontAxis, setMeshFrontAxis] = useState<SignedAxis>("+Y");
  const [originMode, setOriginMode] = useState<OriginMode>("bottom_center");
  const [rawMeshBounds, setRawMeshBounds] = useState<MeshBounds | null>(null);
  const [alignmentResult, setAlignmentResult] = useState<{
    status: NormalizationStatus;
    diagnostic: MeshAlignmentDiagnostic;
    matrix?: THREE.Matrix4;
  } | null>(null);

  // Dimension Alignment State (G4-4B)
  const [scaleMode, setScaleMode] = useState<MeshScaleMode>("uniform");
  const [dimensionResult, setDimensionResult] = useState<DimensionAlignmentResult | null>(null);

  // Component Placement State (G4-4C)
  const [anchorMode, setAnchorMode] = useState<MeshAnchorMode>("bottom_center");
  const [placementResult, setPlacementResult] = useState<ComputeComponentPlacementResult | null>(null);
  const [showComponentOrigin, setShowComponentOrigin] = useState<boolean>(true);
  const [showAiMeshOrigin, setShowAiMeshOrigin] = useState<boolean>(true);
  const [showLocalAxes, setShowLocalAxes] = useState<boolean>(false);

  // Geometry Evaluation State (G4-4D)
  const [evaluationResult, setEvaluationResult] = useState<EvaluateGeometryResult | null>(null);
  const [contourViewMode, setContourViewMode] = useState<"front" | "side" | "top">("front");



  const selectedComp = assembly.components.find((c) => c.id === selectedComponentId);
  const targetComponent =
    selectedComp ||
    assembly.components.find((c) => c.id === aiReferenceArtifact?.partId) ||
    (assembly.components.length > 0 ? assembly.components[0] : undefined);


  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const aiMeshGroupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneDimensionsRef = useRef<{ targetY: number; distance: number }>({ targetY: 200, distance: 1000 });

  // Initialize Three.js Scene
  useEffect(() => {
    if (!mountRef.current) return;
    mountRef.current.innerHTML = "";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121216);
    sceneRef.current = scene;

    // Compute overall product bounds safely
    let maxX = -Infinity, minX = Infinity;
    let maxY = -Infinity, minY = Infinity;
    let maxZ = -Infinity, minZ = Infinity;

    for (const c of assembly.components) {
      const px = Number.isFinite(c.position?.x) ? c.position.x : 0;
      const py = Number.isFinite(c.position?.y) ? c.position.y : 0;
      const pz = Number.isFinite(c.position?.z) ? c.position.z : 0;

      const sx = Math.max(1, Number.isFinite(c.size?.x) ? c.size.x : 100);
      const sy = Math.max(1, Number.isFinite(c.size?.y) ? c.size.y : 100);
      const sz = Math.max(1, Number.isFinite(c.size?.z) ? c.size.z : 100);

      minX = Math.min(minX, px - sx / 2);
      maxX = Math.max(maxX, px + sx / 2);
      minY = Math.min(minY, py - sy / 2);
      maxY = Math.max(maxY, py + sy / 2);
      minZ = Math.min(minZ, pz - sz / 2);
      maxZ = Math.max(maxZ, pz + sz / 2);
    }

    if (!Number.isFinite(minX) || minX === Infinity) {
      minX = -500; maxX = 500;
      minY = -500; maxY = 500;
      minZ = 0; maxZ = 1000;
    }

    const overallWidth = Math.max(100, maxX - minX);
    const overallDepth = Math.max(100, maxY - minY);
    const overallHeight = Math.max(100, maxZ - minZ);
    const maxDim = Math.max(overallWidth, overallDepth, overallHeight);

    const targetY = overallHeight * 0.45;
    const distance = maxDim * 1.6;
    sceneDimensionsRef.current = { targetY, distance };

    const centerThree = fesToThreePosition({
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2,
    });

    // Camera Setup (Default = FRONT view)
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 50000);
    camera.position.set(0, targetY, distance);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, targetY, 0);
    cameraRef.current = camera;

    // WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    mountRef.current.appendChild(renderer.domElement);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, targetY, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    const syncCamInfo = () => {
      setCamPos({
        x: Math.round(camera.position.x),
        y: Math.round(camera.position.y),
        z: Math.round(camera.position.z),
      });
      setCamTarget({
        x: Math.round(controls.target.x),
        y: Math.round(controls.target.y),
        z: Math.round(controls.target.z),
      });
    };
    syncCamInfo();
    controls.addEventListener("change", syncCamInfo);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight1.position.set(maxDim * 2, maxDim * 3, maxDim * 2);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight2.position.set(-maxDim * 2, -maxDim * 2, -maxDim * 2);
    scene.add(dirLight2);

    // Ground Grid Helper at Y = 0
    const gridHelper = new THREE.GridHelper(maxDim * 4, 40, 0x444455, 0x222230);
    gridHelper.position.set(centerThree.x, 0, centerThree.z);
    scene.add(gridHelper);

    // Component Meshes Group
    meshesRef.current.clear();
    const assemblyGroup = new THREE.Group();
    assemblyGroup.name = "assemblyGroup";
    scene.add(assemblyGroup);

    let renderedCount = 0;
    let fallbackCount = 0;
    let failedCount = 0;

    for (const c of assembly.components) {
      try {
        const sx = Math.max(1, Number.isFinite(c.size?.x) ? c.size.x : 10);
        const sy = Math.max(1, Number.isFinite(c.size?.y) ? c.size.y : 10);
        const sz = Math.max(1, Number.isFinite(c.size?.z) ? c.size.z : 10);

        const threeSize = fesToThreeSize({ x: sx, y: sy, z: sz });
        const geometry = ThreeShapeFactory.createGeometryForComponent({
          id: c.id,
          type: c.type,
          geometryMode: c.geometryMode,
          loftGroup: c.loftGroup,
          softGroup: c.softGroup,
          size: threeSize,
          position: c.position,
          shape: c.shape,
          loftSections: assembly.loftSections,
          softSurfaceParams: assembly.softSurfaceParams,
        });

        if (geometry.userData?.usedFallback) {
          fallbackCount++;
        }
        if (geometry.userData?.failed) {
          failedCount++;
        }

        const color = getVisualizationMaterialColor(c.type);
        const material = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.4,
          metalness: c.type === "hardware" ? 0.7 : 0.1,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = c.id;
        mesh.userData = { componentId: c.id, componentType: c.type, productionTruth: c.productionTruth };

        // Initial position
        const px = Number.isFinite(c.position?.x) ? c.position.x : 0;
        const py = Number.isFinite(c.position?.y) ? c.position.y : 0;
        const pz = Number.isFinite(c.position?.z) ? c.position.z : 0;
        const initThreePos = fesToThreePosition({ x: px, y: py, z: pz });
        mesh.position.set(initThreePos.x, initThreePos.y, initThreePos.z);

        // Initial rotation
        const threeRot = fesToThreeRotation(c.rotation);
        mesh.rotation.set(threeRot.x, threeRot.y, threeRot.z);

        // Edges for boundary definition
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.4, transparent: true })
        );
        mesh.add(edges);

        assemblyGroup.add(mesh);
        meshesRef.current.set(c.id, mesh);
        renderedCount++;
      } catch (err) {
        console.error(`Failed rendering mesh for ${c.id}:`, err);
        failedCount++;
      }
    }

    setRendererDiagnostics({
      componentCount: assembly.components.length,
      renderedMeshCount: renderedCount,
      fallbackCount,
      failedComponentCount: failedCount,
    });

    // Camera Auto-Fit
    if (assemblyGroup.children.length > 0) {
      const fit = fitCameraToObject(camera, controls, assemblyGroup);
      if (fit) {
        sceneDimensionsRef.current = { targetY: fit.center.y, distance: fit.cameraDistance };
      }
    }

    // Raycaster for clicking 3D objects directly
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleCanvasClick = (event: MouseEvent) => {
      if (!mountRef.current || !onSelectComponent) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(Array.from(meshesRef.current.values()));

      if (intersects.length > 0) {
        const clickedMesh = intersects[0].object as THREE.Mesh;
        const componentId = clickedMesh.userData?.componentId;
        if (componentId) {
          onSelectComponent(componentId === selectedComponentId ? null : componentId);
        }
      }
    };

    renderer.domElement.addEventListener("click", handleCanvasClick);

    // Handle Resize
    let resizeAnimationFrameId: number;
    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth || 800;
      const h = mountRef.current.clientHeight || 600;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };

    handleResize();
    const timer1 = setTimeout(handleResize, 50);
    const timer2 = setTimeout(handleResize, 200);

    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeAnimationFrameId);
      resizeAnimationFrameId = requestAnimationFrame(handleResize);
    });
    resizeObserver.observe(mountRef.current);

    // Animation Loop
    let animationFrameId = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      cancelAnimationFrame(resizeAnimationFrameId);
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      controls.removeEventListener("change", syncCamInfo);
      renderer.domElement.removeEventListener("click", handleCanvasClick);
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else if (obj.material) {
            obj.material.dispose();
          }
        }
      });
    };
  }, [assembly]);

  // Load AI Reference Mesh GLB if provided
  useEffect(() => {
    if (!sceneRef.current || !aiReferenceMeshUrl) {
      if (aiMeshGroupRef.current && sceneRef.current) {
        sceneRef.current.remove(aiMeshGroupRef.current);
        aiMeshGroupRef.current = null;
      }
      setAiMeshStatus("none");
      setAiMeshError(null);
      return;
    }

    // Defensive URL check (Section 6 requirement)
    const rawUrl = String(aiReferenceMeshUrl).trim();
    if (
      rawUrl.startsWith("C:\\") ||
      rawUrl.startsWith("c:\\") ||
      rawUrl.startsWith("D:\\") ||
      rawUrl.startsWith("d:\\") ||
      rawUrl.startsWith("file://") ||
      /^[a-zA-Z]:[\\/]/.test(rawUrl)
    ) {
      console.error("[Three.js] Rejected unsafe local filesystem path for AI Reference Mesh:", rawUrl);
      setAiMeshStatus("failed");
      setAiMeshError("Unsafe local filesystem path cannot be loaded by browser");
      return;
    }

    // Resolve valid relative Cloud URLs against window.location.origin
    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(rawUrl, window.location.origin).toString();
    } catch (e: any) {
      console.error("[Three.js] Failed to parse URL for AI Reference Mesh:", rawUrl, e);
      setAiMeshStatus("failed");
      setAiMeshError(`Invalid URL format: ${e.message}`);
      return;
    }

    setAiMeshStatus("loading");
    setAiMeshError(null);

    const loader = new GLTFLoader();
    loader.load(
      resolvedUrl,
      (gltf) => {
        if (aiMeshGroupRef.current && sceneRef.current) {
          sceneRef.current.remove(aiMeshGroupRef.current);
        }

        const group = gltf.scene;
        group.name = "AI_REFERENCE_MESH_GROUP";

        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.userData = {
              ...(child.userData || {}),
              productionTruth: false,
              kind: "ai_reference_mesh",
            };
          }
        });

        sceneRef.current?.add(group);
        aiMeshGroupRef.current = group;
        setAiMeshStatus("loaded");

        // Inspect raw GLB bounds for alignment (G4-4A)
        const bounds = inspectMesh(group);
        setRawMeshBounds(bounds);
      },
      undefined,
      (err) => {
        console.warn("Failed to load AI Reference Mesh GLB:", err);
        setAiMeshStatus("failed");
        setAiMeshError(`HTTP / Load Error loading GLB mesh from ${resolvedUrl}`);
      }
    );
  }, [aiReferenceMeshUrl]);

  // Compute Normalization Transform whenever alignment params or raw bounds change (G4-4A)
  useEffect(() => {
    if (!rawMeshBounds) return;

    const result = computeNormalizationTransform({
      artifactId: aiReferenceArtifact?.id || "art-glb-reference",
      partId: aiReferenceArtifact?.partId || selectedComponentId || undefined,
      rawBounds: rawMeshBounds,
      axisMapping: { meshUpAxis, meshFrontAxis },
      originMode,
    });

    setAlignmentResult(result);
  }, [rawMeshBounds, meshUpAxis, meshFrontAxis, originMode, aiReferenceArtifact, selectedComponentId]);

  // Compute Dimension Alignment whenever normalization or target component changes (G4-4B)
  useEffect(() => {
    if (!rawMeshBounds) return;

    const sourceBounds = alignmentResult?.diagnostic?.normalizedBounds || rawMeshBounds;
    const targetSize = targetComponent
      ? {
          x: (targetComponent.size as any).x ?? (targetComponent.size as any).width ?? 0,
          y: (targetComponent.size as any).y ?? (targetComponent.size as any).depth ?? 0,
          z: (targetComponent.size as any).z ?? (targetComponent.size as any).height ?? 0,
        }
      : undefined;

    const dimRes = computeDimensionAlignment({
      artifactId: aiReferenceArtifact?.id || "art-glb-reference",
      partId: aiReferenceArtifact?.partId || targetComponent?.id || undefined,
      componentId: targetComponent?.id || undefined,
      rawOrNormalizedBounds: sourceBounds,
      targetSize,
      scaleMode,
      normalizationMatrix: alignmentResult?.matrix,
    });

    setDimensionResult(dimRes);
  }, [
    rawMeshBounds,
    alignmentResult,
    targetComponent,
    scaleMode,
    aiReferenceArtifact,
  ]);

  // Compute Component Placement whenever dimension alignment or target component changes (G4-4C)
  useEffect(() => {
    if (!targetComponent) {
      setPlacementResult(null);
      return;
    }

    const targetSize = {
      x: (targetComponent.size as any).x ?? (targetComponent.size as any).width ?? 0,
      y: (targetComponent.size as any).y ?? (targetComponent.size as any).depth ?? 0,
      z: (targetComponent.size as any).z ?? (targetComponent.size as any).height ?? 0,
    };

    const targetPos = {
      x: targetComponent.position.x ?? 0,
      y: targetComponent.position.y ?? 0,
      z: targetComponent.position.z ?? 0,
    };

    const targetRot = targetComponent.rotation
      ? {
          x: targetComponent.rotation.x ?? 0,
          y: targetComponent.rotation.y ?? 0,
          z: targetComponent.rotation.z ?? 0,
        }
      : { x: 0, y: 0, z: 0 };

    const placementRes = computeComponentPlacement({
      artifactId: aiReferenceArtifact?.id || "art-glb-reference",
      partId: aiReferenceArtifact?.partId || targetComponent.id,
      component: {
        id: targetComponent.id,
        position: targetPos,
        rotation: targetRot,
        size: targetSize,
        anchorMode,
      },
      anchorMode,
      normalizationTransform: alignmentResult?.diagnostic?.transform,
      dimensionAlignment: dimensionResult?.alignment,
    });

    setPlacementResult(placementRes);
  }, [
    targetComponent,
    dimensionResult,
    alignmentResult,
    anchorMode,
    aiReferenceArtifact,
  ]);

  // Compute Geometry Residual Evaluation whenever placement result changes (G4-4D)
  useEffect(() => {
    if (!targetComponent || !placementResult?.matrix) {
      setEvaluationResult(null);
      return;
    }

    const targetSize = {
      x: (targetComponent.size as any).x ?? (targetComponent.size as any).width ?? 0,
      y: (targetComponent.size as any).y ?? (targetComponent.size as any).depth ?? 0,
      z: (targetComponent.size as any).z ?? (targetComponent.size as any).height ?? 0,
    };

    const evalRes = evaluateGeometryResidual({
      artifactId: aiReferenceArtifact?.id || "art-glb-reference",
      component: {
        id: targetComponent.id,
        size: targetSize,
      },
      meshOptions: {
        bounds: alignmentResult?.diagnostic?.normalizedBounds || rawMeshBounds || undefined,
        engineeringMatrix: placementResult.matrix,
      },
    });

    setEvaluationResult(evalRes);
  }, [
    targetComponent,
    placementResult,
    alignmentResult,
    rawMeshBounds,
    aiReferenceArtifact,
  ]);


  // Diagnostic Axis Helpers Effect (G4-4C)
  const axisHelpersGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    if (!sceneRef.current) return;

    if (!axisHelpersGroupRef.current) {
      const grp = new THREE.Group();
      grp.name = "g44c_axis_helpers";
      sceneRef.current.add(grp);
      axisHelpersGroupRef.current = grp;
    }

    const grp = axisHelpersGroupRef.current;
    while (grp.children.length > 0) {
      grp.remove(grp.children[0]);
    }

    const fesToThreeMat = new THREE.Matrix4().set(
      1,  0,  0, 0,
      0,  0,  1, 0,
      0, -1,  0, 0,
      0,  0,  0, 1
    );

    // 1. World Axis
    if (showLocalAxes) {
      const worldAxes = new THREE.AxesHelper(150);
      grp.add(worldAxes);
    }

    // 2. FES Component Local Axis & Origin
    if ((showComponentOrigin || showLocalAxes) && targetComponent) {
      const targetPos = {
        x: targetComponent.position.x ?? 0,
        y: targetComponent.position.y ?? 0,
        z: targetComponent.position.z ?? 0,
      };
      const targetRot = targetComponent.rotation
        ? {
            x: targetComponent.rotation.x ?? 0,
            y: targetComponent.rotation.y ?? 0,
            z: targetComponent.rotation.z ?? 0,
          }
        : { x: 0, y: 0, z: 0 };

      const compGroup = new THREE.Group();
      const threePos = new THREE.Vector3(targetPos.x, targetPos.z, -targetPos.y);
      compGroup.position.copy(threePos);

      const rotRad = new THREE.Euler(
        (targetRot.x * Math.PI) / 180,
        (targetRot.y * Math.PI) / 180,
        (targetRot.z * Math.PI) / 180,
        "XYZ"
      );
      const rotMat = new THREE.Matrix4().makeRotationFromEuler(rotRad);
      const threeRotMat = fesToThreeMat.clone().multiply(rotMat);
      compGroup.rotation.setFromRotationMatrix(threeRotMat);

      if (showComponentOrigin) {
        const sphereGeom = new THREE.SphereGeometry(12, 16, 16);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0xff1744, wireframe: true });
        compGroup.add(new THREE.Mesh(sphereGeom, sphereMat));
      }

      if (showLocalAxes) {
        const axes = new THREE.AxesHelper(100);
        compGroup.add(axes);
      }

      grp.add(compGroup);
    }

    // 3. AI Mesh Applied Origin & Local Axis
    if ((showAiMeshOrigin || showLocalAxes) && placementResult?.placement) {
      const aiGroup = new THREE.Group();
      const appliedP = placementResult.placement.appliedPosition;
      const threeAppliedPos = new THREE.Vector3(appliedP.x, appliedP.z, -appliedP.y);
      aiGroup.position.copy(threeAppliedPos);

      const appliedR = placementResult.placement.appliedRotation;
      const rotRad = new THREE.Euler(
        (appliedR.x * Math.PI) / 180,
        (appliedR.y * Math.PI) / 180,
        (appliedR.z * Math.PI) / 180,
        "XYZ"
      );
      const rotMat = new THREE.Matrix4().makeRotationFromEuler(rotRad);
      const threeRotMat = fesToThreeMat.clone().multiply(rotMat);
      aiGroup.rotation.setFromRotationMatrix(threeRotMat);

      if (showAiMeshOrigin) {
        const sphereGeom = new THREE.SphereGeometry(10, 16, 16);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0x00e676, wireframe: true });
        aiGroup.add(new THREE.Mesh(sphereGeom, sphereMat));
      }

      if (showLocalAxes) {
        const axes = new THREE.AxesHelper(80);
        aiGroup.add(axes);
      }

      grp.add(aiGroup);
    }
  }, [
    showLocalAxes,
    showComponentOrigin,
    showAiMeshOrigin,
    targetComponent,
    placementResult,
  ]);

  // Update Geometry Visibility & Matrix Chains (Engineering CAD / Raw AI / Normalized AI / Dimension Aligned AI / Placed AI / Overlay)
  useEffect(() => {
    // 1. Update CAD Component Meshes Visibility
    for (const mesh of meshesRef.current.values()) {
      mesh.visible = displayMode === "engineering" || displayMode === "overlay" || displayMode === "contour_overlay";
    }

    // 2. Update AI Reference Mesh Visibility & Transform Matrix
    if (aiMeshGroupRef.current) {
      const isAiVisible =
        displayMode === "raw_ai" ||
        displayMode === "normalized_ai" ||
        displayMode === "dimension_aligned_ai" ||
        displayMode === "placed_ai" ||
        displayMode === "overlay" ||
        displayMode === "contour_overlay";
      aiMeshGroupRef.current.visible = isAiVisible;

      if (isAiVisible) {
        const fesToThreeMat = new THREE.Matrix4().set(
          1,  0,  0, 0,
          0,  0,  1, 0,
          0, -1,  0, 0,
          0,  0,  0, 1
        );

        let chosenMatrix: THREE.Matrix4 | undefined;
        if (displayMode === "raw_ai") {
          chosenMatrix = fesToThreeMat;
        } else if (displayMode === "normalized_ai") {
          chosenMatrix = alignmentResult?.matrix
            ? new THREE.Matrix4().multiplyMatrices(fesToThreeMat, alignmentResult.matrix)
            : fesToThreeMat;
        } else if (displayMode === "dimension_aligned_ai") {
          chosenMatrix = dimensionResult?.matrix
            ? new THREE.Matrix4().multiplyMatrices(fesToThreeMat, dimensionResult.matrix)
            : alignmentResult?.matrix
            ? new THREE.Matrix4().multiplyMatrices(fesToThreeMat, alignmentResult.matrix)
            : fesToThreeMat;
        } else {
          // placed_ai or overlay
          chosenMatrix = placementResult?.matrix
            ? new THREE.Matrix4().multiplyMatrices(fesToThreeMat, placementResult.matrix)
            : dimensionResult?.matrix
            ? new THREE.Matrix4().multiplyMatrices(fesToThreeMat, dimensionResult.matrix)
            : fesToThreeMat;
        }

        aiMeshGroupRef.current.matrixAutoUpdate = false;
        aiMeshGroupRef.current.matrix.copy(chosenMatrix);
        aiMeshGroupRef.current.matrixWorldNeedsUpdate = true;


        aiMeshGroupRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (displayMode === "overlay") {
              child.material = new THREE.MeshStandardMaterial({
                color: 0x00e5ff,
                transparent: true,
                opacity: 0.55,
                roughness: 0.3,
                metalness: 0.1,
              });
            } else {
              child.material = new THREE.MeshStandardMaterial({
                color: 0x90caf9,
                roughness: 0.4,
                metalness: 0.2,
              });
            }
          }
        });
      }
    }
  }, [displayMode, assembly, alignmentResult, dimensionResult, placementResult]);



  // Update Positions & Highlights according to Explode Slider & Selection
  useEffect(() => {
    for (const c of assembly.components) {
      const mesh = meshesRef.current.get(c.id);
      if (!mesh) continue;

      const evX = Number.isFinite(c.explodeVector?.x) ? c.explodeVector.x : 0;
      const evY = Number.isFinite(c.explodeVector?.y) ? c.explodeVector.y : 0;
      const evZ = Number.isFinite(c.explodeVector?.z) ? c.explodeVector.z : 0;

      const px = Number.isFinite(c.position?.x) ? c.position.x : 0;
      const py = Number.isFinite(c.position?.y) ? c.position.y : 0;
      const pz = Number.isFinite(c.position?.z) ? c.position.z : 0;

      const renderPos = {
        x: px + evX * explodeRatio,
        y: py + evY * explodeRatio,
        z: pz + evZ * explodeRatio,
      };

      const threePos = fesToThreePosition(renderPos);
      mesh.position.set(threePos.x, threePos.y, threePos.z);

      const threeRot = fesToThreeRotation(c.rotation);
      mesh.rotation.set(threeRot.x, threeRot.y, threeRot.z);

      // Highlight selected component
      const isSelected = selectedComponentId === c.id;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat) {
        if (isSelected) {
          mat.emissive.setHex(0x665500);
        } else {
          mat.emissive.setHex(0x000000);
        }
      }
    }
  }, [assembly, explodeRatio, selectedComponentId]);

  // Camera View Preset Switcher
  const handlePresetView = (preset: ViewPreset) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const { targetY, distance } = sceneDimensionsRef.current;

    camera.up.set(0, 1, 0);

    if (preset === "FRONT" || preset === "RESET") {
      camera.position.set(0, targetY, distance);
      controls.target.set(0, targetY, 0);
    } else if (preset === "LEFT") {
      camera.position.set(-distance, targetY, 0);
      controls.target.set(0, targetY, 0);
    } else if (preset === "RIGHT") {
      camera.position.set(distance, targetY, 0);
      controls.target.set(0, targetY, 0);
    } else if (preset === "TOP") {
      camera.position.set(0, distance, 0.001);
      controls.target.set(0, 0, 0);
    } else if (preset === "ISO" || preset === "PERSPECTIVE") {
      camera.position.set(distance * 0.8, targetY + distance * 0.3, distance * 0.8);
      controls.target.set(0, targetY, 0);
    }

    camera.updateProjectionMatrix();
    controls.update();
    setCurrentViewMode(preset === "RESET" ? "FRONT" : preset);

    setCamPos({
      x: Math.round(camera.position.x),
      y: Math.round(camera.position.y),
      z: Math.round(camera.position.z),
    });
    setCamTarget({
      x: Math.round(controls.target.x),
      y: Math.round(controls.target.y),
      z: Math.round(controls.target.z),
    });
  };

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#121216",
        color: "#f0f0f0",
        overflow: "hidden",
      }}
    >
      {/* Top Control Bar */}
      <div
        style={{
          padding: "8px 16px",
          background: "#1a1a20",
          borderBottom: "1px solid #2a2a35",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          zIndex: 10,
        }}
      >
        {/* View Presets */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontWeight: "bold", fontSize: 13, color: "#4fc3f7", marginRight: 4 }}>
            3D 视角预设:
          </span>
          {(["FRONT", "LEFT", "RIGHT", "TOP", "ISO"] as ViewPreset[]).map((v) => {
            const isActive = currentViewMode === v;
            return (
              <button
                key={v}
                onClick={() => handlePresetView(v)}
                style={{
                  padding: "4px 10px",
                  background: isActive ? "#0288d1" : "#2a2a35",
                  color: isActive ? "#fff" : "#ccc",
                  fontWeight: isActive ? "bold" : "normal",
                  border: `1px solid ${isActive ? "#29b6f6" : "#3d3d4e"}`,
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12,
                  transition: "all 0.15s ease",
                }}
              >
                {v}
              </button>
            );
          })}

          <button
            onClick={() => handlePresetView("RESET")}
            style={{
              padding: "4px 10px",
              background: "#332a00",
              color: "#ffe082",
              border: "1px solid #ffb300",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
              marginLeft: 6,
            }}
            title="Reset camera position and target"
          >
            视角重置 (Reset)
          </button>

          {/* Geometry Representation Mode Switcher */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8, borderLeft: "1px solid #3d3d4e", paddingLeft: 8 }}>
            <span style={{ fontSize: 12, color: "#80cbc4", fontWeight: "bold" }}>
              几何模式:
            </span>
            {[
              { mode: "engineering", label: "CAD 真值" },
              { mode: "raw_ai", label: "RAW AI" },
              { mode: "normalized_ai", label: "NORMALIZED AI" },
              { mode: "dimension_aligned_ai", label: "DIMENSION ALIGNED AI" },
              { mode: "placed_ai", label: "PLACED AI" },
              { mode: "overlay", label: "PLACEMENT OVERLAY" },
              { mode: "contour_overlay", label: "CONTOUR OVERLAY" },
            ].map(({ mode, label }) => {
              const isActive = displayMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setDisplayMode(mode as DisplayMode)}
                  style={{
                    padding: "4px 8px",
                    background: isActive ? "#00838f" : "#2a2a35",
                    color: isActive ? "#ffffff" : "#cccccc",
                    fontWeight: isActive ? "bold" : "normal",
                    border: `1px solid ${isActive ? "#4fc3f7" : "#3d3d4e"}`,
                    borderRadius: 4,
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  {label}
                </button>
              );
            })}

            <button
              onClick={() => setShowAlignmentInspector(!showAlignmentInspector)}
              style={{
                padding: "4px 8px",
                background: showAlignmentInspector ? "#4a148c" : "#2a2a35",
                color: showAlignmentInspector ? "#ea80fc" : "#ccc",
                fontWeight: showAlignmentInspector ? "bold" : "normal",
                border: `1px solid ${showAlignmentInspector ? "#ce93d8" : "#3d3d4e"}`,
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
                marginLeft: 4,
              }}
              title="Toggle AI Reference Mesh Alignment Inspector"
            >
              Align Inspector
            </button>
          </div>
        </div>

        {/* Explode Control Slider & Legend Toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: "bold", fontSize: 13, color: "#81c784" }}>
              爆炸拉杆:
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={explodeRatio}
              onChange={(e) => setExplodeRatio(parseFloat(e.target.value))}
              style={{ width: 140, cursor: "pointer" }}
            />
            <span style={{ fontWeight: "bold", fontSize: 12, color: "#ffe082", minWidth: 36 }}>
              {Math.round(explodeRatio * 100)}%
            </span>
          </div>

          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => setExplodeRatio(0.0)}
              style={{
                padding: "3px 8px",
                background: explodeRatio === 0 ? "#81c784" : "#2a2a35",
                color: explodeRatio === 0 ? "#000" : "#ccc",
                border: "1px solid #3d3d4e",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              0%
            </button>
            <button
              onClick={() => setExplodeRatio(1.0)}
              style={{
                padding: "3px 8px",
                background: explodeRatio === 1.0 ? "#81c784" : "#2a2a35",
                color: explodeRatio === 1.0 ? "#000" : "#ccc",
                border: "1px solid #3d3d4e",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              100%
            </button>
          </div>

          <button
            onClick={() => setShowOverlay(!showOverlay)}
            style={{
              padding: "4px 10px",
              background: "#22222a",
              color: "#aaa",
              border: "1px solid #3d3d4e",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
              marginLeft: 4,
            }}
          >
            {showOverlay ? "隐藏图例" : "显示图例"}
          </button>

          {/* 3D Model Export / Download Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8, borderLeft: "1px solid #3d3d4e", paddingLeft: 8 }}>
            <span style={{ fontSize: 12, color: "#81c784", fontWeight: 600 }}>3D 模型下载:</span>
            {(["OBJ", "STL", "GLTF", "GLB", "PLY"] as Export3DFormat[]).map((fmt) => (
              <button
                key={fmt}
                onClick={async () => {
                  if (sceneRef.current) {
                    await export3DModel(sceneRef.current, `${assembly.productSku || "FurnitureAssembly"}`, fmt);
                  }
                }}
                style={{
                  padding: "4px 8px",
                  background: fmt === "GLB" || fmt === "OBJ" ? "#388e3c" : "#2a2a35",
                  color: fmt === "GLB" || fmt === "OBJ" ? "#ffffff" : "#cccccc",
                  border: "1px solid #3d3d4e",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                }}
                title={`导出 ${fmt} 格式 3D 模型数据`}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main 3D Viewport Container */}
      <div style={{ flex: 1, position: "relative", width: "100%", minHeight: 0, overflow: "hidden" }}>
        {/* Three.js Canvas Mount */}
        <div ref={mountRef} style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }} />

        {/* Bottom-Left 3D View Diagnostics Overlay */}
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            padding: "8px 12px",
            background: "rgba(18, 18, 22, 0.88)",
            backdropFilter: "blur(6px)",
            border: "1px solid #2d2d3a",
            borderRadius: 6,
            fontSize: 11,
            color: "#ccc",
            fontFamily: "monospace",
            zIndex: 5,
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ color: "#4fc3f7", fontWeight: "bold", marginBottom: 4 }}>Renderer Diagnostics</div>
          <div>Components: <span style={{ color: "#ffffff", fontWeight: "bold" }}>{rendererDiagnostics.componentCount}</span></div>
          <div>Rendered: <span style={{ color: "#81c784", fontWeight: "bold" }}>{rendererDiagnostics.renderedMeshCount}</span></div>
          <div>Fallback: <span style={{ color: "#ffb74d", fontWeight: "bold" }}>{rendererDiagnostics.fallbackCount}</span></div>
          <div>Failed: <span style={{ color: rendererDiagnostics.failedComponentCount > 0 ? "#ff8a80" : "#a5d6a7", fontWeight: "bold" }}>{rendererDiagnostics.failedComponentCount}</span></div>
          <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px dashed #3d3d4e" }}>
            <div>View: <span style={{ color: "#ffe082", fontWeight: "bold" }}>{currentViewMode}</span></div>
            <div>Front Axis: <span style={{ color: "#a5d6a7", fontWeight: "bold" }}>{PRODUCT_FRONT_AXIS}</span></div>
            <div>Cam Pos: [{camPos.x}, {camPos.y}, {camPos.z}]</div>
            <div>Target: [{camTarget.x}, {camTarget.y}, {camTarget.z}]</div>
          </div>
          <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px dashed #3d3d4e" }}>
            <div>
              AI Mesh:{" "}
              <span
                style={{
                  fontWeight: "bold",
                  color:
                    aiMeshStatus === "loaded"
                      ? "#81c784"
                      : aiMeshStatus === "failed"
                      ? "#ff8a80"
                      : aiMeshStatus === "loading"
                      ? "#ffd54f"
                      : "#888",
                }}
              >
                {aiMeshStatus.toUpperCase()}
              </span>
            </div>
            {aiMeshError && (
              <div style={{ color: "#ff8a80", fontSize: 10, marginTop: 2, maxWidth: 220, wordBreak: "break-all" }}>
                Error: {aiMeshError}
              </div>
            )}
          </div>
          {selectedComp ? (() => {
            const diag = evaluateComponentDiagnostics(selectedComp as any, assembly as any);
            return (
              <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px dashed #3d3d4e", color: "#e0e0e0" }}>
                <div>Selected: <span style={{ color: "#81c784" }}>{selectedComp.name} ({selectedComp.id})</span></div>
                <div>geometry_mode: <span style={{ color: "#ffb74d" }}>{diag.geometryMode}</span></div>
                <div>front_profile: <span style={{ color: diag.frontProfile ? "#a5d6a7" : "#ff8a80" }}>{diag.frontProfile ? `FOUND (${diag.frontProfile})` : "MISSING"}</span></div>
                <div>side_profile: <span style={{ color: diag.sideProfile ? "#a5d6a7" : "#ff8a80" }}>{diag.sideProfile ? `FOUND (${diag.sideProfile})` : "MISSING"}</span></div>
                <div>top_profile: <span style={{ color: diag.topProfile ? "#a5d6a7" : "#ff8a80" }}>{diag.topProfile ? `FOUND (${diag.topProfile})` : "MISSING"}</span></div>
                <div>loft_group: <span style={{ color: diag.loftGroup ? "#a5d6a7" : "#888" }}>{diag.loftGroup ? `FOUND (${diag.loftGroup})` : "MISSING"}</span></div>
                <div>soft_group: <span style={{ color: diag.softGroup ? "#a5d6a7" : "#888" }}>{diag.softGroup ? `FOUND (${diag.softGroup})` : "MISSING"}</span></div>
                <div>geometry_source: <span style={{ color: diag.fallback ? "#ff8a80" : "#81c784" }}>{diag.geometrySource}</span></div>
                <div>fallback: <span style={{ color: diag.fallback ? "#ff8a80" : "#a5d6a7" }}>{diag.fallback ? "true" : "false"}</span></div>
              </div>
            );
          })() : (
            <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px dashed #3d3d4e", color: "#888" }}>
              <div>Loft Sections: {(assembly.loftSections || []).length}</div>
              <div>Soft Groups: {(assembly.softSurfaceParams || []).length}</div>
            </div>
          )}
        </div>

        {/* Top-Left Floating AI Reference Mesh Alignment Inspector Panel (G4-4A) */}
        {showAlignmentInspector && (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              width: 290,
              maxHeight: "calc(100% - 140px)",
              background: "rgba(20, 20, 26, 0.92)",
              backdropFilter: "blur(8px)",
              border: "1px solid #3d3d52",
              borderRadius: 8,
              padding: 12,
              overflowY: "auto",
              color: "#e0e0e0",
              fontSize: 11,
              fontFamily: "monospace",
              zIndex: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, borderBottom: "1px solid #3d3d52", paddingBottom: 6 }}>
              <span style={{ fontWeight: "bold", color: "#ce93d8", fontSize: 12 }}>
                Alignment Inspector
              </span>
              <span style={{ fontSize: 9, padding: "2px 6px", background: "#332a00", color: "#ffe082", border: "1px solid #ffb300", borderRadius: 3 }}>
                productionTruth=false
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
              <div>Artifact ID: <span style={{ color: "#80cbc4" }}>{aiReferenceArtifact?.id || "art-glb-reference"}</span></div>
              <div>Part ID: <span style={{ color: "#80cbc4" }}>{aiReferenceArtifact?.partId || selectedComponentId || "assembly_reference"}</span></div>
              <div>
                Status:{" "}
                <span
                  style={{
                    fontWeight: "bold",
                    color:
                      alignmentResult?.status === "NORMALIZED"
                        ? "#81c784"
                        : alignmentResult?.status === "INVALID_AXIS_MAPPING"
                        ? "#ff8a80"
                        : "#888",
                  }}
                >
                  {alignmentResult?.status || "NOT_NORMALIZED"}
                </span>
              </div>
              {alignmentResult?.status === "INVALID_AXIS_MAPPING" && (
                <div style={{ color: "#ff8a80", fontSize: 10, marginTop: 2 }}>
                  {alignmentResult.diagnostic.errorMessage}
                </div>
              )}
            </div>

            {rawMeshBounds ? (
              <div style={{ background: "#16161e", padding: 8, borderRadius: 6, marginBottom: 8, border: "1px solid #2a2a38" }}>
                <div style={{ color: "#ffe082", fontWeight: "bold", marginBottom: 4 }}>Raw GLB Mesh Bounds</div>
                <div>Min: [{rawMeshBounds.min.x.toFixed(1)}, {rawMeshBounds.min.y.toFixed(1)}, {rawMeshBounds.min.z.toFixed(1)}]</div>
                <div>Max: [{rawMeshBounds.max.x.toFixed(1)}, {rawMeshBounds.max.y.toFixed(1)}, {rawMeshBounds.max.z.toFixed(1)}]</div>
                <div>Center: [{rawMeshBounds.center.x.toFixed(1)}, {rawMeshBounds.center.y.toFixed(1)}, {rawMeshBounds.center.z.toFixed(1)}]</div>
                <div>Size: [{rawMeshBounds.size.x.toFixed(1)}, {rawMeshBounds.size.y.toFixed(1)}, {rawMeshBounds.size.z.toFixed(1)}]</div>
                <div style={{ color: "#888", fontSize: 10, marginTop: 2 }}>
                  Stats: {rawMeshBounds.meshCount} mesh / {rawMeshBounds.vertexCount} verts / {rawMeshBounds.triangleCount} tris
                </div>
              </div>
            ) : (
              <div style={{ color: "#888", fontStyle: "italic", marginBottom: 8 }}>
                {aiMeshStatus === "loading" ? "Inspecting GLB mesh..." : "No AI Reference Mesh loaded."}
              </div>
            )}

            {/* Axis & Origin Controls */}
            <div style={{ borderTop: "1px dashed #3d3d52", paddingTop: 8, marginBottom: 8 }}>
              <div style={{ fontWeight: "bold", color: "#80cbc4", marginBottom: 6 }}>Axis & Origin Controls</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                <div>
                  <label style={{ display: "block", color: "#aaa", fontSize: 10, marginBottom: 2 }}>Mesh Up Axis</label>
                  <select
                    value={meshUpAxis}
                    onChange={(e) => setMeshUpAxis(e.target.value as SignedAxis)}
                    style={{ width: "100%", background: "#2a2a38", color: "#fff", border: "1px solid #4a4a60", borderRadius: 4, padding: "2px 4px", fontSize: 11 }}
                  >
                    {(["+X", "-X", "+Y", "-Y", "+Z", "-Z"] as SignedAxis[]).map((ax) => (
                      <option key={ax} value={ax}>{ax}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", color: "#aaa", fontSize: 10, marginBottom: 2 }}>Mesh Front Axis</label>
                  <select
                    value={meshFrontAxis}
                    onChange={(e) => setMeshFrontAxis(e.target.value as SignedAxis)}
                    style={{ width: "100%", background: "#2a2a38", color: "#fff", border: "1px solid #4a4a60", borderRadius: 4, padding: "2px 4px", fontSize: 11 }}
                  >
                    {(["+X", "-X", "+Y", "-Y", "+Z", "-Z"] as SignedAxis[]).map((ax) => (
                      <option key={ax} value={ax}>{ax}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 8 }}>
                <label style={{ display: "block", color: "#aaa", fontSize: 10, marginBottom: 2 }}>Origin Mode</label>
                <select
                  value={originMode}
                  onChange={(e) => setOriginMode(e.target.value as OriginMode)}
                  style={{ width: "100%", background: "#2a2a38", color: "#fff", border: "1px solid #4a4a60", borderRadius: 4, padding: "2px 4px", fontSize: 11 }}
                >
                  <option value="bottom_center">bottom_center ([0,0,0] at bottom)</option>
                  <option value="center">center ([0,0,0] at bounding center)</option>
                  <option value="raw">raw (original mesh origin)</option>
                </select>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                <button
                  onClick={() => {
                    if (aiMeshGroupRef.current) {
                      setRawMeshBounds(inspectMesh(aiMeshGroupRef.current));
                    }
                  }}
                  style={{ padding: "3px 6px", background: "#00695c", color: "#fff", border: "1px solid #26a69a", borderRadius: 4, cursor: "pointer", fontSize: 10 }}
                >
                  Auto Inspect
                </button>
                <button
                  onClick={() => setOriginMode("bottom_center")}
                  style={{ padding: "3px 6px", background: originMode === "bottom_center" ? "#283593" : "#2a2a38", color: "#fff", border: "1px solid #5c6bc0", borderRadius: 4, cursor: "pointer", fontSize: 10 }}
                >
                  Bottom Center
                </button>
                <button
                  onClick={() => {
                    const res = rotateAxisMapping90(meshUpAxis, meshFrontAxis, "X");
                    setMeshUpAxis(res.up);
                    setMeshFrontAxis(res.front);
                  }}
                  style={{ padding: "3px 6px", background: "#37474f", color: "#fff", border: "1px solid #78909c", borderRadius: 4, cursor: "pointer", fontSize: 10 }}
                >
                  Rotate X +90
                </button>
                <button
                  onClick={() => {
                    const res = rotateAxisMapping90(meshUpAxis, meshFrontAxis, "Y");
                    setMeshUpAxis(res.up);
                    setMeshFrontAxis(res.front);
                  }}
                  style={{ padding: "3px 6px", background: "#37474f", color: "#fff", border: "1px solid #78909c", borderRadius: 4, cursor: "pointer", fontSize: 10 }}
                >
                  Rotate Y +90
                </button>
                <button
                  onClick={() => {
                    const res = rotateAxisMapping90(meshUpAxis, meshFrontAxis, "Z");
                    setMeshUpAxis(res.up);
                    setMeshFrontAxis(res.front);
                  }}
                  style={{ padding: "3px 6px", background: "#37474f", color: "#fff", border: "1px solid #78909c", borderRadius: 4, cursor: "pointer", fontSize: 10 }}
                >
                  Rotate Z +90
                </button>
                <button
                  onClick={() => {
                    setMeshUpAxis("+Z");
                    setMeshFrontAxis("+Y");
                    setOriginMode("bottom_center");
                  }}
                  style={{ padding: "3px 6px", background: "#4e342e", color: "#ffab91", border: "1px solid #8d6e63", borderRadius: 4, cursor: "pointer", fontSize: 10 }}
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Transform Diagnostics */}
            {alignmentResult?.diagnostic?.transform && (
              <div style={{ borderTop: "1px dashed #3d3d52", paddingTop: 6, marginBottom: 8 }}>
                <div style={{ color: "#a5d6a7", fontWeight: "bold", marginBottom: 4 }}>Normalization Transform</div>
                <div>Translation: [{alignmentResult.diagnostic.transform.originTranslation.x.toFixed(1)}, {alignmentResult.diagnostic.transform.originTranslation.y.toFixed(1)}, {alignmentResult.diagnostic.transform.originTranslation.z.toFixed(1)}]</div>
                <div>Euler Rot: [{alignmentResult.diagnostic.transform.rotationEulerDeg.x}°, {alignmentResult.diagnostic.transform.rotationEulerDeg.y}°, {alignmentResult.diagnostic.transform.rotationEulerDeg.z}°]</div>
                {alignmentResult.diagnostic.normalizedBounds && (
                  <div>Norm Center: [{alignmentResult.diagnostic.normalizedBounds.center.x.toFixed(1)}, {alignmentResult.diagnostic.normalizedBounds.center.y.toFixed(1)}, {alignmentResult.diagnostic.normalizedBounds.center.z.toFixed(1)}]</div>
                )}
              </div>
            )}

            {/* G4-4B Dimension Alignment Diagnostics & Controls */}
            <div style={{ borderTop: "1px dashed #ce93d8", paddingTop: 8 }}>
              <div style={{ fontWeight: "bold", color: "#e1bee7", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Dimension Alignment</span>
                <span
                  style={{
                    fontSize: 9,
                    padding: "2px 5px",
                    borderRadius: 3,
                    fontWeight: "bold",
                    background:
                      dimensionResult?.alignment.status === "ALIGNED"
                        ? "#1b5e20"
                        : dimensionResult?.alignment.status === "DISTORTION_WARNING"
                        ? "#e65100"
                        : "#b71c1c",
                    color: "#fff",
                  }}
                >
                  {dimensionResult?.alignment.status || "NO_ALIGNMENT"}
                </span>
              </div>

              {dimensionResult?.alignment ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div>Target Comp: <span style={{ color: "#ffb74d" }}>{dimensionResult.alignment.componentId || "TARGET_NOT_FOUND"}</span></div>
                  <div>Norm AI Size: [{dimensionResult.alignment.sourceSize.x.toFixed(1)}, {dimensionResult.alignment.sourceSize.y.toFixed(1)}, {dimensionResult.alignment.sourceSize.z.toFixed(1)}] mm</div>
                  <div>FES Target Size: [{dimensionResult.alignment.targetSize.x.toFixed(1)}, {dimensionResult.alignment.targetSize.y.toFixed(1)}, {dimensionResult.alignment.targetSize.z.toFixed(1)}] mm</div>
                  <div>Candidate Scale: [{dimensionResult.alignment.candidateScale.x.toFixed(3)}, {dimensionResult.alignment.candidateScale.y.toFixed(3)}, {dimensionResult.alignment.candidateScale.z.toFixed(3)}]</div>
                  <div>Scale Mode: <span style={{ color: scaleMode === "uniform" ? "#81c784" : "#ffb74d", fontWeight: "bold" }}>{scaleMode}</span></div>
                  <div>Applied Scale: [{dimensionResult.alignment.appliedScale.x.toFixed(3)}, {dimensionResult.alignment.appliedScale.y.toFixed(3)}, {dimensionResult.alignment.appliedScale.z.toFixed(3)}]</div>
                  <div>Aligned Size: [{dimensionResult.alignment.alignedSize.x.toFixed(1)}, {dimensionResult.alignment.alignedSize.y.toFixed(1)}, {dimensionResult.alignment.alignedSize.z.toFixed(1)}] mm</div>
                  <div>Residual mm: [{dimensionResult.alignment.residualMm.x.toFixed(1)}, {dimensionResult.alignment.residualMm.y.toFixed(1)}, {dimensionResult.alignment.residualMm.z.toFixed(1)}] mm</div>
                  <div>Residual %: [{dimensionResult.alignment.residualPercent.x.toFixed(1)}%, {dimensionResult.alignment.residualPercent.y.toFixed(1)}%, {dimensionResult.alignment.residualPercent.z.toFixed(1)}%]</div>
                  <div>
                    Aspect Distortion: <span style={{ fontWeight: "bold", color: dimensionResult.alignment.distortionLevel === "HIGH" ? "#ff8a80" : dimensionResult.alignment.distortionLevel === "MEDIUM" ? "#ffe082" : "#a5d6a7" }}>
                      {dimensionResult.alignment.aspectDistortion.toFixed(2)} ({dimensionResult.alignment.distortionLevel})
                    </span>
                  </div>

                  {dimensionResult.alignment.distortionRisk && (
                    <div style={{ marginTop: 4, padding: "4px 6px", background: "#4a1414", border: "1px solid #ef5350", borderRadius: 4, color: "#ffcdd2", fontSize: 10 }}>
                      ⚠️ DISTORTION WARNING: Scale mode is preview-only or distortion level HIGH. productionTruth=false.
                    </div>
                  )}

                  {/* Dimension Alignment Buttons */}
                  <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                    <button
                      onClick={() => setScaleMode("uniform")}
                      style={{
                        padding: "3px 6px",
                        background: scaleMode === "uniform" ? "#2e7d32" : "#2a2a38",
                        color: "#fff",
                        border: `1px solid ${scaleMode === "uniform" ? "#81c784" : "#4a4a60"}`,
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: 10,
                      }}
                    >
                      Uniform
                    </button>
                    <button
                      onClick={() => setScaleMode("non_uniform_preview")}
                      style={{
                        padding: "3px 6px",
                        background: scaleMode === "non_uniform_preview" ? "#e65100" : "#2a2a38",
                        color: "#fff",
                        border: `1px solid ${scaleMode === "non_uniform_preview" ? "#ffb74d" : "#4a4a60"}`,
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: 10,
                      }}
                    >
                      Non-uniform Preview
                    </button>
                    <button
                      onClick={() => setScaleMode("uniform")}
                      style={{
                        padding: "3px 6px",
                        background: "#3e2723",
                        color: "#ffab91",
                        border: "1px solid #8d6e63",
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: 10,
                      }}
                    >
                      Reset Alignment
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ color: "#888", fontStyle: "italic" }}>
                  Select component or specify target size to align dimensions.
                </div>
              )}
            </div>

            {/* G4-4C Component Placement Section */}
            <div style={{ borderTop: "1px dashed #81d4fa", paddingTop: 8, marginTop: 8 }}>
              <div style={{ fontWeight: "bold", color: "#81d4fa", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>COMPONENT PLACEMENT</span>
                <span
                  style={{
                    fontSize: 9,
                    padding: "2px 5px",
                    borderRadius: 3,
                    fontWeight: "bold",
                    background:
                      placementResult?.status === "PLACED"
                        ? "#1b5e20"
                        : placementResult?.status === "PLACEMENT_WARNING"
                        ? "#e65100"
                        : "#b71c1c",
                    color: "#fff",
                  }}
                >
                  {placementResult?.status || "NOT_PLACED"}
                </span>
              </div>

              {placementResult?.placement ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div>Comp ID: <span style={{ color: "#ffb74d" }}>{placementResult.placement.componentId}</span></div>
                  <div>Anchor Mode: <span style={{ color: "#81c784", fontWeight: "bold" }}>{placementResult.placement.anchorMode}</span></div>
                  <div>FES Position: [{placementResult.placement.targetPosition.x.toFixed(1)}, {placementResult.placement.targetPosition.y.toFixed(1)}, {placementResult.placement.targetPosition.z.toFixed(1)}] mm</div>
                  <div>FES Rotation: [{placementResult.placement.targetRotation.x.toFixed(1)}°, {placementResult.placement.targetRotation.y.toFixed(1)}°, {placementResult.placement.targetRotation.z.toFixed(1)}°]</div>
                  <div>Applied Pos: [{placementResult.placement.appliedPosition.x.toFixed(1)}, {placementResult.placement.appliedPosition.y.toFixed(1)}, {placementResult.placement.appliedPosition.z.toFixed(1)}] mm</div>
                  <div>Applied Rot: [{placementResult.placement.appliedRotation.x.toFixed(1)}°, {placementResult.placement.appliedRotation.y.toFixed(1)}°, {placementResult.placement.appliedRotation.z.toFixed(1)}°]</div>
                  <div>Anchor Offset: [{placementResult.placement.anchorOffset.x.toFixed(1)}, {placementResult.placement.anchorOffset.y.toFixed(1)}, {placementResult.placement.anchorOffset.z.toFixed(1)}] mm</div>

                  <div style={{ fontSize: 9, color: "#80cbc4", marginTop: 2, fontFamily: "monospace" }}>
                    Matrix (4x4): [{placementResult.placement.engineeringMatrix.slice(0, 4).map(v => v.toFixed(1)).join(", ")}...]
                  </div>

                  {/* Anchor Mode Controls */}
                  <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                    {(["bottom_center", "center", "rear_bottom_center"] as MeshAnchorMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setAnchorMode(mode)}
                        style={{
                          padding: "3px 6px",
                          background: anchorMode === mode ? "#0277bd" : "#2a2a38",
                          color: "#fff",
                          border: `1px solid ${anchorMode === mode ? "#4fc3f7" : "#4a4a60"}`,
                          borderRadius: 4,
                          cursor: "pointer",
                          fontSize: 10,
                        }}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>

                  {/* Apply / Reset Placement Buttons */}
                  <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                    <button
                      onClick={() => {
                        setAnchorMode("bottom_center");
                        setDisplayMode("placed_ai");
                      }}
                      style={{
                        padding: "3px 6px",
                        background: "#2e7d32",
                        color: "#fff",
                        border: "1px solid #81c784",
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: 10,
                      }}
                    >
                      Apply FES Placement
                    </button>
                    <button
                      onClick={() => {
                        setAnchorMode("bottom_center");
                        setDisplayMode("dimension_aligned_ai");
                      }}
                      style={{
                        padding: "3px 6px",
                        background: "#3e2723",
                        color: "#ffab91",
                        border: "1px solid #8d6e63",
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: 10,
                      }}
                    >
                      Reset Placement
                    </button>
                  </div>

                  {/* Diagnostic Origin & Local Axes Toggles */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6, borderTop: "1px dotted #4a4a60", paddingTop: 4 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 10, color: "#ccc" }}>
                      <input
                        type="checkbox"
                        checked={showComponentOrigin}
                        onChange={(e) => setShowComponentOrigin(e.target.checked)}
                      />
                      Show Component Origin
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 10, color: "#ccc" }}>
                      <input
                        type="checkbox"
                        checked={showAiMeshOrigin}
                        onChange={(e) => setShowAiMeshOrigin(e.target.checked)}
                      />
                      Show AI Mesh Origin
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 10, color: "#ccc" }}>
                      <input
                        type="checkbox"
                        checked={showLocalAxes}
                        onChange={(e) => setShowLocalAxes(e.target.checked)}
                      />
                      Show Local Axes
                    </label>
                  </div>

                  {/* G4-4D GEOMETRY EVALUATION SECTION */}
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #3d3d4e" }}>
                    <div style={{ fontSize: 11, fontWeight: "bold", color: "#e040fb", marginBottom: 4 }}>
                      GEOMETRY EVALUATION (G4-4D)
                    </div>
                    {evaluationResult?.report ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "#aaa" }}>Quality Level:</span>
                          <span
                            style={{
                              padding: "1px 6px",
                              borderRadius: 3,
                              fontSize: 9,
                              fontWeight: "bold",
                              background:
                                evaluationResult.report.qualityLevel === "REFERENCE_HIGH"
                                  ? "#1b5e20"
                                  : evaluationResult.report.qualityLevel === "REFERENCE_MEDIUM"
                                  ? "#f57f17"
                                  : "#b71c1c",
                              color: "#fff",
                            }}
                          >
                            {evaluationResult.report.qualityLevel}
                          </span>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "#aaa" }}>Overall Score:</span>
                          <span style={{ color: "#40c4ff", fontWeight: "bold" }}>
                            {evaluationResult.report.overallScore} / 100
                          </span>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "#aaa" }}>Geometry Source:</span>
                          <span style={{ color: "#b388ff", fontFamily: "monospace" }}>
                            {evaluationResult.report.geometrySource}
                          </span>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "#aaa" }}>Ref Adequacy:</span>
                          <span style={{ color: evaluationResult.report.referenceAdequacy === "PROXY_ONLY" ? "#ffab40" : "#a7ffeb", fontWeight: "bold" }}>
                            {evaluationResult.report.referenceAdequacy}
                          </span>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "#aaa" }}>Gate Eligible:</span>
                          <span style={{ color: evaluationResult.report.gateEligible ? "#69f0ae" : "#ff5252", fontWeight: "bold" }}>
                            {evaluationResult.report.gateEligible ? "YES (PASSED GATE RULE)" : "NO (INSUFFICIENT REF)"}
                          </span>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "#aaa" }}>Cross-View Consistency:</span>
                          <span style={{ color: "#e040fb", fontWeight: "bold" }}>
                            {evaluationResult.report.crossViewConsistency}%
                          </span>
                        </div>

                        {!evaluationResult.report.gateEligible && (
                          <div style={{
                            margin: "4px 0",
                            padding: "4px 6px",
                            background: "#3e2723",
                            border: "1px solid #ff6d00",
                            borderRadius: 4,
                            color: "#ffd600",
                            fontSize: 9,
                            fontWeight: "bold",
                            textAlign: "center"
                          }}>
                            ⚠️ PROXY REFERENCE ONLY - NOT ELIGIBLE FOR GATE ACCEPTANCE
                          </div>
                        )}

                        {/* View Metrics Table */}
                        <div style={{ marginTop: 4 }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, textAlign: "left" }}>
                            <thead>
                              <tr style={{ color: "#80cbc4", borderBottom: "1px solid #4a4a60" }}>
                                <th style={{ padding: "2px 0" }}>VIEW</th>
                                <th>IoU</th>
                                <th>MEAN(mm)</th>
                                <th>P95(mm)</th>
                                <th>MAX(mm)</th>
                                <th>RATIO (W/H)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {evaluationResult.report.views.map((v) => (
                                <tr key={v.view} style={{ borderBottom: "1px solid #2a2a38" }}>
                                  <td style={{ padding: "2px 0", color: "#ffd54f", fontWeight: "bold" }}>
                                    {v.view.toUpperCase()}
                                  </td>
                                  <td style={{ color: "#a7ffeb" }}>{v.silhouetteIoU.toFixed(2)}</td>
                                  <td style={{ color: "#ff8a80" }}>{v.meanSymmetricContourDistanceMm ?? v.meanContourDistanceMm}</td>
                                  <td style={{ color: "#ff8a80" }}>{v.p95ContourDistanceMm}</td>
                                  <td style={{ color: "#ff8a80" }}>{v.maxContourDistanceMm}</td>
                                  <td style={{ color: v.sanity?.axisSuspect ? "#ff5252" : "#b2ff59" }}>
                                    {v.sanity ? `${v.sanity.widthRatio}/${v.sanity.heightRatio}` : "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Landmark Residuals */}
                        {evaluationResult.report.landmarks && evaluationResult.report.landmarks.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <div style={{ color: "#80cbc4", fontWeight: "bold", fontSize: 9 }}>Landmark Residuals:</div>
                            {evaluationResult.report.landmarks.map((lm) => (
                              <div key={lm.landmarkName} style={{ display: "flex", justifyContent: "space-between", color: "#ccc" }}>
                                <span>{lm.landmarkName}:</span>
                                <span>{lm.projectedDistanceMm} mm (ΔX:{lm.deltaX}, ΔY:{lm.deltaY})</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div style={{ fontSize: 9, color: "#ff8a80", fontStyle: "italic", marginTop: 2 }}>
                          productionTruth: false (Evaluation Only)
                        </div>

                        {/* Contour Overlay Button */}
                        <button
                          onClick={() => setDisplayMode("contour_overlay")}
                          style={{
                            marginTop: 4,
                            padding: "3px 6px",
                            background: "#4a148c",
                            color: "#ea80fc",
                            border: "1px solid #ab47bc",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontSize: 10,
                          }}
                        >
                          Show 2D Contour Overlay
                        </button>
                      </div>
                    ) : (
                      <div style={{ color: "#888", fontStyle: "italic", fontSize: 9 }}>
                        Evaluating geometry residuals...
                      </div>
                    )}
                  </div>

                </div>
              ) : (
                <div style={{ color: "#888", fontStyle: "italic" }}>
                  Select target component to place AI mesh.
                </div>
              )}
            </div>

          </div>
        )}

        {/* 2D CONTOUR OVERLAY MODAL / OVERLAY VIEW (G4-4D) */}
        {displayMode === "contour_overlay" && evaluationResult?.contours && (
          <div
            style={{
              position: "absolute",
              top: 40,
              left: 12,
              width: 380,
              background: "rgba(18, 18, 24, 0.95)",
              backdropFilter: "blur(8px)",
              border: "1px solid #7b1fa2",
              borderRadius: 8,
              padding: 12,
              zIndex: 10,
              color: "#fff",
              boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: "bold", fontSize: 12, color: "#ea80fc" }}>
                2D CONTOUR OVERLAY ({contourViewMode.toUpperCase()} VIEW)
              </div>
              <button
                onClick={() => setDisplayMode("overlay")}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#aaa",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: "bold",
                }}
              >
                ✕
              </button>
            </div>

            {/* View Selector Tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {(["front", "side", "top"] as ("front" | "side" | "top")[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setContourViewMode(v)}
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    background: contourViewMode === v ? "#6a1b9a" : "#2a2a38",
                    color: contourViewMode === v ? "#fff" : "#ccc",
                    border: `1px solid ${contourViewMode === v ? "#e040fb" : "#4a4a60"}`,
                    borderRadius: 4,
                    cursor: "pointer",
                    fontSize: 10,
                    fontWeight: "bold",
                  }}
                >
                  {v.toUpperCase()}
                </button>
              ))}
            </div>

            {/* SVG Contour Render */}
            {(() => {
              const currentContour = evaluationResult.contours[contourViewMode];
              if (!currentContour) return null;

              const engPts = currentContour.eng.contour;
              const aiPts = currentContour.ai.contour;

              // Compute bounding limits for SVG viewport scaling
              const allPts = [...engPts, ...aiPts];
              let minX = -100, maxX = 100, minY = -100, maxY = 100;
              if (allPts.length > 0) {
                minX = Math.min(...allPts.map((p) => p.x)) - 20;
                maxX = Math.max(...allPts.map((p) => p.x)) + 20;
                minY = Math.min(...allPts.map((p) => p.y)) - 20;
                maxY = Math.max(...allPts.map((p) => p.y)) + 20;
              }
              const w = Math.max(1, maxX - minX);
              const h = Math.max(1, maxY - minY);

              const engPath = engPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
              const aiPath = aiPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

              const viewRes = evaluationResult.report.views.find((r) => r.view === contourViewMode);

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <svg
                    viewBox={`${minX} ${minY} ${w} ${h}`}
                    style={{
                      width: "100%",
                      height: 200,
                      background: "#0a0a0f",
                      border: "1px solid #3d3d4e",
                      borderRadius: 4,
                      transform: "scaleY(-1)", // Invert Y for Cartesian coordinates
                    }}
                  >
                    {/* Grid lines */}
                    <line x1={minX} y1={0} x2={maxX} y2={0} stroke="#222233" strokeWidth="1" strokeDasharray="4 4" />
                    <line x1={0} y1={minY} x2={0} y2={maxY} stroke="#222233" strokeWidth="1" strokeDasharray="4 4" />

                    {/* Engineering Contour (Green Solid) */}
                    <path d={engPath} fill="rgba(76, 175, 80, 0.2)" stroke="#4caf50" strokeWidth="2" />

                    {/* AI Projected Contour (Cyan Dashed) */}
                    <path d={aiPath} fill="rgba(0, 229, 255, 0.25)" stroke="#00e5ff" strokeWidth="2" strokeDasharray="6 4" />
                  </svg>

                  {/* Legend & Metrics */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                    <span style={{ color: "#4caf50", fontWeight: "bold" }}>── Engineering Reference</span>
                    <span style={{ color: "#00e5ff", fontWeight: "bold" }}>- - AI Projected Mesh</span>
                  </div>

                  {viewRes && (
                    <div style={{ fontSize: 10, background: "#1a1a24", padding: 6, borderRadius: 4, display: "flex", justifyContent: "space-around" }}>
                      <div>IoU: <strong style={{ color: "#a7ffeb" }}>{viewRes.silhouetteIoU}</strong></div>
                      <div>Mean: <strong style={{ color: "#ff8a80" }}>{viewRes.meanContourDistanceMm} mm</strong></div>
                      <div>P95: <strong style={{ color: "#ff8a80" }}>{viewRes.p95ContourDistanceMm} mm</strong></div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Floating Collapsible Material & Components Overlay */}

        {showOverlay && (
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              width: 260,
              maxHeight: "calc(100% - 24px)",
              background: "rgba(22, 22, 28, 0.88)",
              backdropFilter: "blur(8px)",
              border: "1px solid #2a2a38",
              borderRadius: 8,
              padding: 12,
              overflowY: "auto",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              zIndex: 5,
              fontSize: 12,
            }}
          >
            {/* Material Legend */}
            <div>
              <div style={{ fontWeight: "bold", fontSize: 12, color: "#4fc3f7", marginBottom: 6 }}>
                材质图例 (Material Palette):
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {Object.entries(VISUALIZATION_MATERIAL_PALETTE).map(([key, item]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: `#${item.color.toString(16).padStart(6, "0")}`,
                        display: "inline-block",
                      }}
                    />
                    <span style={{ color: "#ccc" }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Components Quick Select List */}
            <div>
              <div style={{ fontWeight: "bold", fontSize: 12, color: "#4fc3f7", marginBottom: 6 }}>
                装配部件 ({assembly.components.length})：
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {assembly.components.map((c) => {
                  const isSelected = selectedComponentId === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => onSelectComponent && onSelectComponent(isSelected ? null : c.id)}
                      style={{
                        padding: "5px 8px",
                        borderRadius: 4,
                        background: isSelected ? "#332a00" : "rgba(34, 34, 42, 0.7)",
                        border: `1px solid ${isSelected ? "#ffb300" : "#2d2d38"}`,
                        cursor: "pointer",
                        fontSize: 11,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: "bold", color: isSelected ? "#ffe082" : "#fff" }}>
                          {c.id}
                        </span>
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          {c.shape?.source === "ai_estimated" && (
                            <span style={{ background: "#d32f2f", color: "#fff", padding: "1px 4px", borderRadius: 2, fontSize: 8, fontWeight: 700 }}>
                              AI ESTIMATE
                            </span>
                          )}
                          <span style={{ fontSize: 10, color: "#888" }}>{c.shape?.proxy || c.type}</span>
                        </div>
                      </div>
                      <div style={{ color: "#888", fontSize: 10, marginTop: 2 }}>
                        尺寸: {c.size.x} × {c.size.y} × {c.size.z} mm
                      </div>
                      <div style={{ color: "#aaa", fontSize: 9, marginTop: 1 }}>
                        旋转: [{c.rotation?.x ?? 0}°, {c.rotation?.y ?? 0}°, {c.rotation?.z ?? 0}°]
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Instructions */}
      <div
        style={{
          padding: "4px 16px",
          background: "#16161a",
          borderTop: "1px solid #222228",
          fontSize: 11,
          color: "#888",
          display: "flex",
          justifyContent: "space-between",
          zIndex: 10,
        }}
      >
        <span>
          装配 SKU: <strong>{assembly.sku}</strong> | 正面定义: <strong>{PRODUCT_FRONT_AXIS}</strong>
        </span>
        <span>提示: 切换预设视角 | 按住左键旋转 3D | 按住右键平移 | 滚动缩放 | 点击 3D 部件选定</span>
      </div>
    </div>
  );
}
