import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { EditorSignals } from "./EditorSignals.js";
import { History } from "./History.js";
import type { Command } from "./commands/Command.js";
import {
  AddObjectCommand,
  RemoveObjectCommand,
  SetPositionCommand,
  SetRotationCommand,
  SetScaleCommand,
  RenameObjectCommand,
  ExplodeCommand,
} from "./commands/index.js";
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
import { ModelLoaderService, type ParsedModelResult } from "../utils/3d/modelLoaderService.js";
import { CoordinateSystemAdapter } from "../utils/3d/coordinateSystemAdapter.js";
import { DimensionRulerHelper } from "../utils/3d/dimensionRulerHelper.js";
import { disposeHierarchy } from "../utils/3d/modelDisposal.js";
import { saveModelBuffer } from "../utils/3d/indexedDbStorage.js";
import type {
  Engineering3DScene,
  SceneModelInstance,
  Imported3DAsset,
} from "../../shared/imported3dAsset.js";

export class Engineering3DEditor {
  // Core Three.js Containers
  public scene: THREE.Scene;
  public sceneName: string = "ActiveWorkspace";
  public sceneHelpers: THREE.Scene;
  public camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  public perspCamera: THREE.PerspectiveCamera;
  public orthoCamera: THREE.OrthographicCamera;
  public controls: any = null; // OrbitControls

  // Selection & Helpers
  public selected: THREE.Object3D | null = null;
  public helpers: Map<string, THREE.Object3D> = new Map();
  public selectionBoxHelper: THREE.BoxHelper;
  public dimensionRulerHelper: DimensionRulerHelper;
  public showRulers: boolean = true;
  public gridHelper: THREE.GridHelper;
  public axesHelper: THREE.AxesHelper;

  // Editor Architecture Subsystems
  public readonly signals: EditorSignals;
  public readonly history: History;

  // Registries (single truth for scene elements)
  public readonly objectRegistry: Map<string, THREE.Object3D> = new Map();
  public readonly geometryRegistry: Map<string, THREE.BufferGeometry> = new Map();
  public readonly materialRegistry: Map<string, THREE.Material> = new Map();
  public readonly instanceMetadata: Map<string, SceneModelInstance> = new Map();
  public readonly cachedAssets: Map<string, Imported3DAsset> = new Map();

  // Root group for user imported models
  public readonly instancesGroup: THREE.Group;

  // Controllers & Managers
  public transformController: TransformController | null = null;
  public viewModeManager: ViewModeManager;
  public explodeEngine: ExplodeEngine;
  public faceSelector: FaceSelector | null = null;

  // Editor States
  public transformMode: TransformMode = "translate";
  public transformSpace: TransformSpace = "world";
  public snapSettings: SnapSettings = {
    positionSnap: null,
    rotationSnap: null,
    scaleSnap: null,
  };
  public projectionMode: ProjectionMode = "perspective";
  public viewMode: WorkspaceViewMode = "solid";
  public explodeProgress: number = 0; // 0 to 100
  public currentSceneId: string | null = null;
  public currentSceneName: string = "Untitled Engineering Scene";

  constructor() {
    this.signals = new EditorSignals();
    this.history = new History(this, 60);

    // Initialize Scenes
    this.scene = new THREE.Scene();
    this.scene.name = "EngineeringEditorScene";
    this.scene.background = new THREE.Color(0x18191c);

    this.sceneHelpers = new THREE.Scene();
    this.sceneHelpers.name = "EditorHelpersScene";

    this.instancesGroup = new THREE.Group();
    this.instancesGroup.name = "instancesGroup";
    this.scene.add(this.instancesGroup);

    // Initialize Cameras
    this.perspCamera = new THREE.PerspectiveCamera(45, 1, 1, 50000);
    this.perspCamera.position.set(1200, 1200, 1200);
    this.perspCamera.lookAt(0, 0, 0);

    this.orthoCamera = new THREE.OrthographicCamera(-800, 800, 800, -800, 1, 50000);
    this.orthoCamera.position.set(1200, 1200, 1200);
    this.orthoCamera.lookAt(0, 0, 0);

    this.camera = this.perspCamera;

    // Initialize Helpers
    this.gridHelper = new THREE.GridHelper(3000, 60, 0x555555, 0x2e3238);
    this.gridHelper.position.y = 0;
    this.sceneHelpers.add(this.gridHelper);
    this.helpers.set("grid", this.gridHelper);

    this.axesHelper = new THREE.AxesHelper(300);
    this.axesHelper.renderOrder = 999;
    (this.axesHelper.material as THREE.Material).depthTest = false;
    this.sceneHelpers.add(this.axesHelper);
    this.helpers.set("axes", this.axesHelper);

    this.selectionBoxHelper = new THREE.BoxHelper(new THREE.Object3D(), 0x3b82f6);
    this.selectionBoxHelper.visible = false;
    (this.selectionBoxHelper.material as THREE.Material).depthTest = false;
    this.sceneHelpers.add(this.selectionBoxHelper);
    this.helpers.set("selectionBox", this.selectionBoxHelper);

    this.dimensionRulerHelper = new DimensionRulerHelper();
    this.sceneHelpers.add(this.dimensionRulerHelper);
    this.helpers.set("dimensionRuler", this.dimensionRulerHelper);

    // Initialize Managers
    this.viewModeManager = new ViewModeManager();
    this.explodeEngine = new ExplodeEngine();

    this.setupInternalListeners();
  }

  private setupInternalListeners(): void {
    // When an object changes, update selection box, rulers, and world matrices
    this.signals.objectChanged.add((object) => {
      if (this.selected === object && this.selectionBoxHelper.visible) {
        this.selectionBoxHelper.update();
      }
      if (this.selected === object && this.showRulers) {
        this.dimensionRulerHelper.update();
      }
    });

    // When selection changes, update selection box helper & dimension rulers
    this.signals.objectSelected.add((object) => {
      if (object) {
        this.selectionBoxHelper.setFromObject(object);
        this.selectionBoxHelper.visible = true;
        this.selectionBoxHelper.update();
        if (this.showRulers) {
          this.dimensionRulerHelper.attachTarget(object);
        }
        if (this.transformController) {
          this.transformController.attach(object);
        }
      } else {
        this.selectionBoxHelper.visible = false;
        this.dimensionRulerHelper.detachTarget();
        if (this.transformController) {
          this.transformController.detach();
        }
      }
      this.signals.selectionHelperChanged.dispatch();
    });
  }

  /**
   * Bind camera controls (OrbitControls) and TransformController once DOM mounts
   */
  public bindControls(controls: any, transformController: TransformController): void {
    this.controls = controls;
    this.transformController = transformController;

    // Connect TransformControls transform end to command recording
    let transformStartPosition = new THREE.Vector3();
    let transformStartRotation = new THREE.Euler();
    let transformStartScale = new THREE.Vector3();

    const tc = transformController.getControls();

    tc.addEventListener("mouseDown", () => {
      if (this.selected) {
        transformStartPosition.copy(this.selected.position);
        transformStartRotation.copy(this.selected.rotation);
        transformStartScale.copy(this.selected.scale);
      }
    });

    tc.addEventListener("mouseUp", () => {
      if (!this.selected) return;

      const mode = this.transformMode;
      if (mode === "translate" && !this.selected.position.equals(transformStartPosition)) {
        const cmd = new SetPositionCommand(
          this,
          this.selected,
          this.selected.position.clone(),
          transformStartPosition.clone()
        );
        this.history.execute(cmd);
      } else if (mode === "rotate" && !this.selected.rotation.equals(transformStartRotation)) {
        const cmd = new SetRotationCommand(
          this,
          this.selected,
          this.selected.rotation.clone(),
          transformStartRotation.clone()
        );
        this.history.execute(cmd);
      } else if (mode === "scale" && !this.selected.scale.equals(transformStartScale)) {
        const cmd = new SetScaleCommand(
          this,
          this.selected,
          this.selected.scale.clone(),
          transformStartScale.clone()
        );
        this.history.execute(cmd);
      }
    });

    // Face selector initialization
    this.faceSelector = new FaceSelector(this.scene, this.camera, tc.domElement as HTMLElement);
  }

  // --- Command & History Execution ---
  public execute(command: Command): void {
    this.history.execute(command);
  }

  public undo(): boolean {
    return this.history.undo();
  }

  public redo(): boolean {
    return this.history.redo();
  }

  // --- Selection API ---
  public engineeringDocument: any = null;

  public setEngineeringDocument(doc: any): void {
    this.engineeringDocument = doc;
  }

  public setSceneName(name: string): void {
    this.currentSceneName = name;
  }

  public select(object: THREE.Object3D | null): void {
    if (this.selected === object) return;
    this.selected = object;
    this.signals.objectSelected.dispatch(object);
  }

  public selectById(id: string): void {
    const obj = this.objectRegistry.get(id);
    if (obj) {
      this.select(obj);
    }
  }

  public selectByUuid(uuid: string): void {
    const obj = this.scene.getObjectByProperty("uuid", uuid);
    if (obj) {
      this.select(obj);
    }
  }

  public deselect(): void {
    this.select(null);
  }

  public focus(object?: THREE.Object3D): void {
    const target = object || this.selected;
    if (!target) {
      // Focus entire instancesGroup or scene
      if (this.instancesGroup.children.length > 0) {
        CameraController.fitCameraToObject(this.camera, this.controls, this.instancesGroup);
      }
      return;
    }
    CameraController.fitCameraToObject(this.camera, this.controls, target);
    this.signals.objectFocused.dispatch(target);
  }

  // --- Quick Rotation & Transform API ---
  public rotateSelected(axis: "x" | "y" | "z", deltaDeg: number): void {
    if (!this.selected) return;
    const currentDeg = THREE.MathUtils.radToDeg(this.selected.rotation[axis]);
    const targetDeg = Math.round((currentDeg + deltaDeg) * 10) / 10;
    const newRot = this.selected.rotation.clone();
    newRot[axis] = THREE.MathUtils.degToRad(targetDeg);
    this.execute(new SetRotationCommand(this, this.selected, newRot));
  }

  public setRotationSelected(axis: "x" | "y" | "z", absDeg: number): void {
    if (!this.selected) return;
    const newRot = this.selected.rotation.clone();
    newRot[axis] = THREE.MathUtils.degToRad(absDeg);
    this.execute(new SetRotationCommand(this, this.selected, newRot));
  }

  public resetRotationSelected(): void {
    if (!this.selected) return;
    const newRot = new THREE.Euler(0, 0, 0);
    this.execute(new SetRotationCommand(this, this.selected, newRot));
  }

  public rotateSelectedPreset(preset: "y_90" | "y_minus_90" | "y_180" | "x_90" | "x_minus_90" | "z_90" | "z_minus_90" | "reset"): void {
    if (!this.selected) return;
    switch (preset) {
      case "y_90":
        this.rotateSelected("y", 90);
        break;
      case "y_minus_90":
        this.rotateSelected("y", -90);
        break;
      case "y_180":
        this.rotateSelected("y", 180);
        break;
      case "x_90":
        this.rotateSelected("x", 90);
        break;
      case "x_minus_90":
        this.rotateSelected("x", -90);
        break;
      case "z_90":
        this.rotateSelected("z", 90);
        break;
      case "z_minus_90":
        this.rotateSelected("z", -90);
        break;
      case "reset":
        this.resetRotationSelected();
        break;
    }
  }

  // --- Object Registry Management ---
  public registerObject(object: THREE.Object3D): void {
    const key = object.userData.instanceId || object.uuid;
    this.objectRegistry.set(key, object);
    this.objectRegistry.set(object.uuid, object);

    object.traverse((child) => {
      this.objectRegistry.set(child.uuid, child);
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) {
          this.geometryRegistry.set(mesh.geometry.uuid, mesh.geometry);
        }
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => this.materialRegistry.set(m.uuid, m));
          } else {
            this.materialRegistry.set(mesh.material.uuid, mesh.material);
          }
        }
      }
    });
  }

  public unregisterObject(object: THREE.Object3D): void {
    const key = object.userData.instanceId || object.uuid;
    this.objectRegistry.delete(key);
    this.objectRegistry.delete(object.uuid);

    object.traverse((child) => {
      this.objectRegistry.delete(child.uuid);
    });
  }

  // --- Scene Graph Manipulation ---
  public addObject(object: THREE.Object3D, parent?: THREE.Object3D, index?: number): void {
    const cmd = new AddObjectCommand(this, object, parent || this.instancesGroup, index);
    this.execute(cmd);
  }

  public removeObject(object: THREE.Object3D): void {
    const cmd = new RemoveObjectCommand(this, object);
    this.execute(cmd);
  }

  public deleteSelected(): void {
    if (this.selected && this.selected !== this.scene && this.selected !== this.instancesGroup) {
      this.removeObject(this.selected);
    }
  }

  public duplicateSelected(): THREE.Object3D | null {
    if (!this.selected) return null;
    const clone = this.selected.clone(true);
    clone.name = `${this.selected.name}_copy`;
    clone.position.x += 50; // offset slightly

    // Regenerate unique UUID and instanceId for clone and all nested descendants
    const newInstId = `inst_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    clone.uuid = THREE.MathUtils.generateUUID();
    clone.userData = {
      ...clone.userData,
      instanceId: newInstId,
    };
    clone.traverse((child) => {
      child.uuid = THREE.MathUtils.generateUUID();
      if (child.userData?.instanceId) {
        child.userData.instanceId = `inst_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      }
    });

    const cmd = new AddObjectCommand(this, clone, this.selected.parent || this.instancesGroup);
    this.execute(cmd);
    return clone;
  }

  public addPrimitive(type: "box" | "cylinder" | "sphere" | "plane" | "torus"): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    let name = "Object";

    switch (type) {
      case "box":
        geometry = new THREE.BoxGeometry(400, 400, 400);
        name = "Box";
        break;
      case "cylinder":
        geometry = new THREE.CylinderGeometry(200, 200, 400, 32);
        name = "Cylinder";
        break;
      case "sphere":
        geometry = new THREE.SphereGeometry(200, 32, 24);
        name = "Sphere";
        break;
      case "plane":
        geometry = new THREE.PlaneGeometry(800, 800);
        geometry.rotateX(-Math.PI / 2);
        name = "Plane";
        break;
      case "torus":
        geometry = new THREE.TorusGeometry(200, 50, 16, 48);
        name = "Torus";
        break;
    }

    const material = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.4,
      metalness: 0.1,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${name}_${Math.floor(Math.random() * 1000)}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(0, 200, 0);

    const instanceId = `prim_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    mesh.userData.instanceId = instanceId;
    mesh.userData.isPrimitive = true;

    this.addObject(mesh);
    this.select(mesh);
    return mesh;
  }

  public addLight(type: "directional" | "point" | "spot" | "ambient"): THREE.Light {
    let light: THREE.Light;
    let name = "Light";

    switch (type) {
      case "directional":
        light = new THREE.DirectionalLight(0xffffff, 1.2);
        light.position.set(500, 1000, 500);
        name = "DirectionalLight";
        break;
      case "point":
        light = new THREE.PointLight(0xffffff, 1.0, 3000);
        light.position.set(0, 500, 0);
        name = "PointLight";
        break;
      case "spot":
        light = new THREE.SpotLight(0xffffff, 1.5, 4000, Math.PI / 4, 0.2);
        light.position.set(300, 800, 300);
        name = "SpotLight";
        break;
      case "ambient":
        light = new THREE.AmbientLight(0xffffff, 0.5);
        name = "AmbientLight";
        break;
    }

    light.name = `${name}_${Math.floor(Math.random() * 1000)}`;
    this.addObject(light);
    this.select(light);
    return light;
  }

  public addGroup(): THREE.Group {
    const group = new THREE.Group();
    group.name = `Group_${Math.floor(Math.random() * 1000)}`;
    this.addObject(group);
    this.select(group);
    return group;
  }

  public centerSelected(): void {
    if (!this.selected) return;
    const box = new THREE.Box3().setFromObject(this.selected);
    const center = new THREE.Vector3();
    box.getCenter(center);
    this.selected.position.sub(center);
    this.signals.objectChanged.dispatch(this.selected);
  }

  public resetSelectedTransform(): void {
    if (!this.selected) return;
    this.selected.position.set(0, 0, 0);
    this.selected.rotation.set(0, 0, 0);
    this.selected.scale.set(1, 1, 1);
    this.signals.objectChanged.dispatch(this.selected);
  }

  // --- Dimension Rulers & Uniform Scaling ---
  public setShowRulers(show: boolean): void {
    this.showRulers = show;
    this.dimensionRulerHelper.setVisible(show);
    if (show && this.selected) {
      this.dimensionRulerHelper.attachTarget(this.selected);
    } else if (!show) {
      this.dimensionRulerHelper.detachTarget();
    }
    this.signals.rulerVisibilityChanged.dispatch(show);
  }

  public scaleSelected(factor: number): void {
    if (!this.selected || factor <= 0) return;
    const newScale = this.selected.scale.clone().multiplyScalar(factor);
    this.execute(new SetScaleCommand(this, this.selected, newScale));
  }

  public setUniformScaleSelected(uniformScale: number): void {
    if (!this.selected || uniformScale <= 0) return;
    const newScale = new THREE.Vector3(uniformScale, uniformScale, uniformScale);
    this.execute(new SetScaleCommand(this, this.selected, newScale));
  }

  public scaleSelectedToDimension(axis: "x" | "y" | "z", targetMm: number): void {
    if (!this.selected || targetMm <= 0) return;
    const box = new THREE.Box3().setFromObject(this.selected);
    const currentSize = Math.max(0.001, box.max[axis] - box.min[axis]);
    const factor = targetMm / currentSize;
    this.scaleSelected(factor);
  }

  public autoFitSelectedToMm(targetMaxDim: number = 800): void {
    if (!this.selected) return;
    const box = new THREE.Box3().setFromObject(this.selected);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim <= 0.001) return;
    const factor = targetMaxDim / maxDim;
    this.scaleSelected(factor);
    this.focus(this.selected);
  }

  // --- Transform & View Controls ---
  public setTransformMode(mode: TransformMode): void {
    this.transformMode = mode;
    if (this.transformController) {
      this.transformController.setMode(mode);
    }
    this.signals.transformModeChanged.dispatch(mode);
  }

  public setTransformSpace(space: TransformSpace): void {
    this.transformSpace = space;
    if (this.transformController) {
      this.transformController.setSpace(space);
    }
    this.signals.transformSpaceChanged.dispatch(space);
  }

  public setSnapSettings(settings: Partial<SnapSettings>): void {
    this.snapSettings = { ...this.snapSettings, ...settings };
    if (this.transformController) {
      this.transformController.setSnapSettings(this.snapSettings);
    }
    this.signals.snapChanged.dispatch(this.snapSettings);
  }

  public setProjectionMode(mode: ProjectionMode): void {
    if (this.projectionMode === mode) return;
    this.projectionMode = mode;

    const oldCam = this.camera;
    const newCam = mode === "perspective" ? this.perspCamera : this.orthoCamera;

    newCam.position.copy(oldCam.position);
    newCam.quaternion.copy(oldCam.quaternion);

    this.camera = newCam;
    if (this.controls) {
      this.controls.object = newCam;
      this.controls.update();
    }
    if (this.transformController) {
      this.transformController.updateCamera(newCam);
    }

    this.signals.projectionModeChanged.dispatch(mode);
    this.signals.cameraChanged.dispatch(newCam);
  }

  public setCameraPreset(preset: CameraPreset): void {
    CameraController.setPresetView(this.camera, this.controls, preset);
    this.signals.cameraChanged.dispatch(this.camera);
  }

  public setViewMode(mode: WorkspaceViewMode): void {
    this.viewMode = mode;
    this.viewModeManager.setViewMode(mode, this.instancesGroup);
    this.signals.viewModeChanged.dispatch(mode);
  }

  public setExplode(progress: number, recordHistory: boolean = true): void {
    const prev = this.explodeProgress;
    this.explodeProgress = Math.max(0, Math.min(100, progress));

    if (recordHistory && Math.abs(prev - this.explodeProgress) > 1) {
      const cmd = new ExplodeCommand(this, this.explodeProgress, prev);
      this.history.execute(cmd);
      return;
    }

    // Apply exploded offsets to instances
    const instanceArray: THREE.Object3D[] = [];
    this.instancesGroup.traverse((child) => {
      if (child.parent === this.instancesGroup) {
        instanceArray.push(child);
      }
    });

    if (this.explodeEngine.getInstanceCount() === 0 && instanceArray.length > 0) {
      this.explodeEngine.computeExplodeVectors(instanceArray);
    }

    this.explodeEngine.applyExplodeProgress(this.explodeProgress, instanceArray);
    this.signals.explodeChanged.dispatch(this.explodeProgress);
    if (this.selected) {
      this.signals.objectChanged.dispatch(this.selected);
    }
  }

  // --- Model Import & Asset Loading ---
  public async loadModelFromBuffer(
    buffer: ArrayBuffer,
    fileName: string
  ): Promise<{ object: THREE.Object3D; parsed: ParsedModelResult }> {
    const parsed = await ModelLoaderService.loadModel(buffer, fileName);
    const root = parsed.rootObject;
    root.name = fileName.replace(/\.[^/.]+$/, "");

    // Check raw dimensions before coordinate adapter:
    // If max dimension is < 20 (e.g. ComfyUI / Hunyuan3D / Blender exported in meters or unit cube 0.2 ~ 3.0),
    // automatically scale by 1000 to convert meters to standard engineering millimeters (mm).
    const rawBox = new THREE.Box3().setFromObject(root);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);
    const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z);

    let scaleFactor = 1.0;
    if (maxDim > 0 && maxDim < 20) {
      scaleFactor = 1000.0;
    }

    // Apply default coordinate adapter (align to ground, center origin)
    CoordinateSystemAdapter.applyAdapter(root, {
      sourceUp: parsed.detectedUp,
      alignGround: true,
      centerOrigin: true,
      scaleFactor,
    });

    const instanceId = `inst_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    root.userData.instanceId = instanceId;
    root.userData.sourceFileName = fileName;

    // Cache binary buffer into IndexedDB for cross-session/cross-tab durability
    saveModelBuffer(instanceId, {
      name: root.name,
      buffer,
      sourceFileName: fileName,
      downloadUrl: root.userData.downloadUrl,
      assetId: root.userData.assetId,
    }).catch(() => {});

    this.addObject(root);
    this.focus(root);

    return { object: root, parsed };
  }

  public async loadGLTF(url: string): Promise<THREE.Object3D> {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} loading GLTF from ${url}`);
      const buffer = await res.arrayBuffer();
      const fileName = url.split("/").pop() || "model.glb";
      const { object } = await this.loadModelFromBuffer(buffer, fileName);
      object.userData.downloadUrl = url;

      // Save to IndexedDB keyed by url as well
      saveModelBuffer(url, {
        name: object.name,
        buffer,
        sourceFileName: fileName,
        downloadUrl: url,
      }).catch(() => {});

      return object;
    } catch (err) {
      console.warn(`[Engineering3DEditor] Failed to load GLTF from ${url}:`, err);
      throw err;
    }
  }

  // --- Export Methods ---
  public exportGLB(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const exporter = new GLTFExporter();
      exporter.parse(
        this.instancesGroup,
        (gltf) => {
          const blob = new Blob([gltf as ArrayBuffer], { type: "model/gltf-binary" });
          resolve(blob);
        },
        (error) => reject(error),
        { binary: true }
      );
    });
  }

  public exportOBJ(): Promise<Blob> {
    return new Promise((resolve) => {
      const exporter = new OBJExporter();
      const result = exporter.parse(this.instancesGroup);
      const blob = new Blob([result], { type: "text/plain" });
      resolve(blob);
    });
  }

  public exportSTL(): Promise<Blob> {
    return new Promise((resolve) => {
      const exporter = new STLExporter();
      const result = exporter.parse(this.instancesGroup, { binary: true });
      const blob = new Blob([result as any], { type: "application/octet-stream" });
      resolve(blob);
    });
  }

  public exportJSON(): Promise<Blob> {
    return new Promise((resolve) => {
      const json = this.instancesGroup.toJSON();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
      resolve(blob);
    });
  }

  // --- Scene Serialization & Clearing ---
  public clear(): void {
    this.deselect();

    // Dispose all objects in instancesGroup
    while (this.instancesGroup.children.length > 0) {
      const obj = this.instancesGroup.children[0];
      this.instancesGroup.remove(obj);
      disposeHierarchy(obj);
      this.unregisterObject(obj);
    }

    this.history.clear();
    this.explodeEngine.clear();
    this.explodeProgress = 0;
    this.currentSceneId = null;
    this.currentSceneName = "Untitled Engineering Scene";

    this.signals.editorCleared.dispatch();
    this.signals.sceneGraphChanged.dispatch();
  }

  public dispose(): void {
    this.clear();
    this.signals.dispose();
    this.viewModeManager.dispose();
    this.explodeEngine.clear();
    this.faceSelector?.dispose();
    this.transformController?.dispose();
  }
}
