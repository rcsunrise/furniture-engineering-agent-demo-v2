import * as THREE from "three";
import type {
  Imported3DAsset,
  SceneModelInstance,
} from "../../../shared/imported3dAsset.js";
import {
  TriangleConnectivityAnalyzer,
  type ConnectedComponentInfo,
  type ConnectivityAnalysisResult,
} from "./triangleConnectivity.js";
import { ModelStatsCalculator } from "./modelStatsCalculator.js";

export interface ExplodeComponentData {
  componentId: string;
  name: string;
  origin: [number, number, number];
  explodeDirection: [number, number, number];
  explodeDistance: number;
}

export interface SplitResult {
  derivedAssets: Imported3DAsset[];
  newInstances: SceneModelInstance[];
  threeObjects: THREE.Object3D[];
  explodeComponents: ExplodeComponentData[];
  removedInstanceId?: string;
  splitType: "scene_node" | "material_group" | "connected_component" | "face_extraction";
}

export class ModelSplitService {
  /**
   * Helper to create a compliant Derived Imported3DAsset
   * Enforces Section O: Source Immutability (productionTruth = false)
   */
  public static createDerivedAsset(
    sourceAsset: Imported3DAsset,
    derivedObject: THREE.Object3D,
    suffix: string,
    splitType: string
  ): Imported3DAsset {
    const derivedId = `asset-derived-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const { stats, materials } = ModelStatsCalculator.computeStats(derivedObject);

    return {
      id: derivedId,
      name: `${sourceAsset.name} [${suffix}]`,
      fileName: `${sourceAsset.fileName.replace(/\.[^/.]+$/, "")}_${suffix.toLowerCase().replace(/\s+/g, "_")}.glb`,
      fileSize: Math.round(sourceAsset.fileSize * (stats.triangleCount / Math.max(1, sourceAsset.stats.triangleCount))),
      format: sourceAsset.format,
      storageBucket: sourceAsset.storageBucket || "engineering-3d-assets",
      storagePath: `derived/${derivedId}.glb`,
      downloadUrl: `/api/assets/file/${derivedId}/model.glb`,
      stats,
      materials,
      coordinateSystem: { ...sourceAsset.coordinateSystem },
      metadata: {
        derivedFromAssetId: sourceAsset.id,
        splitType,
        createdAt: new Date().toISOString(),
      },
      productionTruth: false, // MANDATORY: AI/Derived asset is never productionTruth
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Directly splits an Object3D by its material groups into independent THREE.Mesh objects.
   */
  public static splitByMaterials(selected: THREE.Object3D): { createdObjects: THREE.Object3D[] } {
    const mesh = (selected instanceof THREE.Mesh ? selected : selected.children.find((c) => c instanceof THREE.Mesh)) as THREE.Mesh | undefined;
    if (!mesh || !mesh.geometry || !mesh.geometry.groups || mesh.geometry.groups.length <= 1) {
      return { createdObjects: [] };
    }
    const fakeAsset: any = { id: "asset-temp", name: selected.name || "Model", fileName: "model.glb", fileSize: 1000, format: "glb", coordinateSystem: { detectedUp: "Y_UP", targetUp: "FES", conversionApplied: "NONE" }, stats: { triangleCount: 100, vertexCount: 100, boundingBox: { min: [0,0,0], max: [1,1,1] }, dimensions: [1,1,1], hasNormals: true, hasUVs: true, hasColors: false, meshCount: 1, materialCount: 1 } };
    const fakeInstance: any = { instanceId: "inst-temp", assetId: "asset-temp", name: selected.name || "Model", transform: { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] } };
    const result = this.splitByMaterialGroups(mesh, fakeInstance, fakeAsset);
    return { createdObjects: result?.threeObjects || [] };
  }

  /**
   * Directly splits an Object3D into topological connected components.
   */
  public static splitConnectedComponents(selected: THREE.Object3D, minPercentageThreshold: number = 0.5): { createdObjects: THREE.Object3D[] } {
    const mesh = (selected instanceof THREE.Mesh ? selected : selected.children.find((c) => c instanceof THREE.Mesh)) as THREE.Mesh | undefined;
    if (!mesh || !mesh.geometry) {
      return { createdObjects: [] };
    }
    const fakeAsset: any = { id: "asset-temp", name: selected.name || "Model", fileName: "model.glb", fileSize: 1000, format: "glb", coordinateSystem: { detectedUp: "Y_UP", targetUp: "FES", conversionApplied: "NONE" }, stats: { triangleCount: 100, vertexCount: 100, boundingBox: { min: [0,0,0], max: [1,1,1] }, dimensions: [1,1,1], hasNormals: true, hasUVs: true, hasColors: false, meshCount: 1, materialCount: 1 } };
    const fakeInstance: any = { instanceId: "inst-temp", assetId: "asset-temp", name: selected.name || "Model", transform: { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] } };
    const result = this.splitByConnectedComponents(mesh, fakeInstance, fakeAsset, minPercentageThreshold);
    return { createdObjects: result?.threeObjects || [] };
  }

  /**
   * J. SCENE NODE SPLIT:
   * Splits children of a GLTF/GLB group into independent scene objects.
   * Does NOT modify underlying geometries.
   */
  public static splitBySceneNodes(
    targetObject: THREE.Object3D,
    targetInstance: SceneModelInstance,
    sourceAsset: Imported3DAsset
  ): SplitResult | null {
    // Find all direct child meshes or sub-groups
    const childNodes: THREE.Object3D[] = [];
    targetObject.children.forEach((child) => {
      // If wrapper has inner container, look into inner container
      if (child.type === "Group" && child.children.length > 0) {
        child.children.forEach((subChild) => childNodes.push(subChild));
      } else {
        childNodes.push(child);
      }
    });

    if (childNodes.length <= 1) {
      // Try finding meshes recursively if top level is single group
      const allMeshes: THREE.Mesh[] = [];
      targetObject.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          allMeshes.push(obj as THREE.Mesh);
        }
      });
      if (allMeshes.length <= 1) {
        return null; // Cannot split single node
      }
      childNodes.length = 0;
      allMeshes.forEach((m) => childNodes.push(m));
    }

    // Compute overall center for explode direction
    targetObject.updateWorldMatrix(true, true);
    const overallBox = new THREE.Box3().setFromObject(targetObject);
    const overallCenter = new THREE.Vector3();
    overallBox.getCenter(overallCenter);

    const derivedAssets: Imported3DAsset[] = [];
    const newInstances: SceneModelInstance[] = [];
    const threeObjects: THREE.Object3D[] = [];
    const explodeComponents: ExplodeComponentData[] = [];

    childNodes.forEach((child, idx) => {
      // Detach child and bake its world transform
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      child.getWorldPosition(worldPos);
      child.getWorldQuaternion(worldQuat);
      child.getWorldScale(worldScale);

      // Clone child to preserve original structure in memory
      const clonedChild = child.clone(true);
      clonedChild.position.copy(worldPos);
      clonedChild.quaternion.copy(worldQuat);
      clonedChild.scale.copy(worldScale);

      const nodeName = child.name || `Part_${idx + 1}`;
      const derivedAsset = this.createDerivedAsset(
        sourceAsset,
        clonedChild,
        `Node: ${nodeName}`,
        "scene_node_split"
      );

      const newInstanceId = `inst-split-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
      clonedChild.userData.instanceId = newInstanceId;
      clonedChild.userData.assetId = derivedAsset.id;

      // Compute explode direction
      const childBox = new THREE.Box3().setFromObject(clonedChild);
      const childCenter = new THREE.Vector3();
      childBox.getCenter(childCenter);

      const dir = new THREE.Vector3().subVectors(childCenter, overallCenter);
      if (dir.lengthSq() < 1e-4) {
        dir.set(0, 0, 1); // default outward
      } else {
        dir.normalize();
      }

      derivedAssets.push(derivedAsset);
      threeObjects.push(clonedChild);

      newInstances.push({
        instanceId: newInstanceId,
        assetId: derivedAsset.id,
        name: derivedAsset.name,
        transform: {
          position: [clonedChild.position.x, clonedChild.position.y, clonedChild.position.z],
          rotation: [
            THREE.MathUtils.radToDeg(clonedChild.rotation.x),
            THREE.MathUtils.radToDeg(clonedChild.rotation.y),
            THREE.MathUtils.radToDeg(clonedChild.rotation.z),
          ],
          scale: [clonedChild.scale.x, clonedChild.scale.y, clonedChild.scale.z],
        },
        visible: true,
        locked: false,
        coordinateAdapter: { ...targetInstance.coordinateAdapter },
      });

      explodeComponents.push({
        componentId: newInstanceId,
        name: derivedAsset.name,
        origin: [clonedChild.position.x, clonedChild.position.y, clonedChild.position.z],
        explodeDirection: [dir.x, dir.y, dir.z],
        explodeDistance: 200,
      });
    });

    return {
      derivedAssets,
      newInstances,
      threeObjects,
      explodeComponents,
      removedInstanceId: targetInstance.instanceId,
      splitType: "scene_node",
    };
  }

  /**
   * K. MATERIAL SPLIT:
   * Splits a mesh with multiple material groups (BufferGeometry.groups) into independent meshes.
   */
  public static splitByMaterialGroups(
    targetMesh: THREE.Mesh,
    targetInstance: SceneModelInstance,
    sourceAsset: Imported3DAsset
  ): SplitResult | null {
    const geometry = targetMesh.geometry;
    if (!geometry) return null;

    const groups = geometry.groups;
    if (!groups || groups.length <= 1) {
      return null; // Not a multi-material group geometry
    }

    targetMesh.updateWorldMatrix(true, true);
    const overallBox = new THREE.Box3().setFromObject(targetMesh);
    const overallCenter = new THREE.Vector3();
    overallBox.getCenter(overallCenter);

    const derivedAssets: Imported3DAsset[] = [];
    const newInstances: SceneModelInstance[] = [];
    const threeObjects: THREE.Object3D[] = [];
    const explodeComponents: ExplodeComponentData[] = [];

    const materialsArray = Array.isArray(targetMesh.material) ? targetMesh.material : [targetMesh.material];

    groups.forEach((group, idx) => {
      const startTri = Math.floor(group.start / 3);
      const countTri = Math.floor(group.count / 3);
      const triIndices: number[] = [];
      for (let i = startTri; i < startTri + countTri; i++) {
        triIndices.push(i);
      }

      if (triIndices.length === 0) return;

      const subGeom = TriangleConnectivityAnalyzer.extractSubGeometry(geometry, triIndices);
      const matIndex = group.materialIndex ?? idx;
      const mat = materialsArray[matIndex] || materialsArray[0];

      const newMesh = new THREE.Mesh(subGeom, mat.clone());
      newMesh.position.copy(targetMesh.position);
      newMesh.quaternion.copy(targetMesh.quaternion);
      newMesh.scale.copy(targetMesh.scale);

      const matName = mat.name || `Material_${matIndex + 1}`;
      const derivedAsset = this.createDerivedAsset(
        sourceAsset,
        newMesh,
        `Material: ${matName}`,
        "material_split"
      );

      const newInstanceId = `inst-mat-split-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
      newMesh.userData.instanceId = newInstanceId;
      newMesh.userData.assetId = derivedAsset.id;

      // Compute explode direction
      const subBox = new THREE.Box3().setFromObject(newMesh);
      const subCenter = new THREE.Vector3();
      subBox.getCenter(subCenter);

      const dir = new THREE.Vector3().subVectors(subCenter, overallCenter);
      if (dir.lengthSq() < 1e-4) {
        dir.set(0, 0, 1);
      } else {
        dir.normalize();
      }

      derivedAssets.push(derivedAsset);
      threeObjects.push(newMesh);

      newInstances.push({
        instanceId: newInstanceId,
        assetId: derivedAsset.id,
        name: derivedAsset.name,
        transform: {
          position: [newMesh.position.x, newMesh.position.y, newMesh.position.z],
          rotation: [
            THREE.MathUtils.radToDeg(newMesh.rotation.x),
            THREE.MathUtils.radToDeg(newMesh.rotation.y),
            THREE.MathUtils.radToDeg(newMesh.rotation.z),
          ],
          scale: [newMesh.scale.x, newMesh.scale.y, newMesh.scale.z],
        },
        visible: true,
        locked: false,
        coordinateAdapter: { ...targetInstance.coordinateAdapter },
      });

      explodeComponents.push({
        componentId: newInstanceId,
        name: derivedAsset.name,
        origin: [newMesh.position.x, newMesh.position.y, newMesh.position.z],
        explodeDirection: [dir.x, dir.y, dir.z],
        explodeDistance: 200,
      });
    });

    return {
      derivedAssets,
      newInstances,
      threeObjects,
      explodeComponents,
      removedInstanceId: targetInstance.instanceId,
      splitType: "material_group",
    };
  }

  /**
   * L. CONNECTED COMPONENT SPLIT:
   * Splits a mesh into independent components based on Triangle Connectivity Analysis.
   */
  public static splitByConnectedComponents(
    targetMesh: THREE.Mesh,
    targetInstance: SceneModelInstance,
    sourceAsset: Imported3DAsset,
    minPercentageThreshold: number = 0.0
  ): SplitResult | null {
    const geometry = targetMesh.geometry;
    if (!geometry) return null;

    const analysis = TriangleConnectivityAnalyzer.analyze(geometry, 0.5);
    if (analysis.components.length <= 1) {
      return null; // Already a single continuous topological component
    }

    targetMesh.updateWorldMatrix(true, true);
    const overallBox = new THREE.Box3().setFromObject(targetMesh);
    const overallCenter = new THREE.Vector3();
    overallBox.getCenter(overallCenter);

    const derivedAssets: Imported3DAsset[] = [];
    const newInstances: SceneModelInstance[] = [];
    const threeObjects: THREE.Object3D[] = [];
    const explodeComponents: ExplodeComponentData[] = [];

    // Filter components above min threshold
    const validComponents = analysis.components.filter(
      (c) => c.percentage >= minPercentageThreshold
    );

    validComponents.forEach((comp, idx) => {
      const subGeom = TriangleConnectivityAnalyzer.extractSubGeometry(geometry, comp.triangleIndices);
      const newMesh = new THREE.Mesh(subGeom, targetMesh.material);
      newMesh.position.copy(targetMesh.position);
      newMesh.quaternion.copy(targetMesh.quaternion);
      newMesh.scale.copy(targetMesh.scale);

      const compName = `Part_${idx + 1} (${comp.percentage}%)`;
      const derivedAsset = this.createDerivedAsset(
        sourceAsset,
        newMesh,
        compName,
        "connected_component_split"
      );

      const newInstanceId = `inst-comp-split-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
      newMesh.userData.instanceId = newInstanceId;
      newMesh.userData.assetId = derivedAsset.id;

      // Center of this component
      const subCenter = new THREE.Vector3(
        (comp.boundingBox.min[0] + comp.boundingBox.max[0]) / 2,
        (comp.boundingBox.min[1] + comp.boundingBox.max[1]) / 2,
        (comp.boundingBox.min[2] + comp.boundingBox.max[2]) / 2
      );

      const dir = new THREE.Vector3().subVectors(subCenter, overallCenter);
      if (dir.lengthSq() < 1e-4) {
        dir.set(0, 0, 1);
      } else {
        dir.normalize();
      }

      derivedAssets.push(derivedAsset);
      threeObjects.push(newMesh);

      newInstances.push({
        instanceId: newInstanceId,
        assetId: derivedAsset.id,
        name: derivedAsset.name,
        transform: {
          position: [newMesh.position.x, newMesh.position.y, newMesh.position.z],
          rotation: [
            THREE.MathUtils.radToDeg(newMesh.rotation.x),
            THREE.MathUtils.radToDeg(newMesh.rotation.y),
            THREE.MathUtils.radToDeg(newMesh.rotation.z),
          ],
          scale: [newMesh.scale.x, newMesh.scale.y, newMesh.scale.z],
        },
        visible: true,
        locked: false,
        coordinateAdapter: { ...targetInstance.coordinateAdapter },
      });

      explodeComponents.push({
        componentId: newInstanceId,
        name: derivedAsset.name,
        origin: [newMesh.position.x, newMesh.position.y, newMesh.position.z],
        explodeDirection: [dir.x, dir.y, dir.z],
        explodeDistance: 250,
      });
    });

    return {
      derivedAssets,
      newInstances,
      threeObjects,
      explodeComponents,
      removedInstanceId: targetInstance.instanceId,
      splitType: "connected_component",
    };
  }

  /**
   * N. MANUAL SURFACE EXTRACTION:
   * Extracts manually selected triangle faces into a new Derived Mesh.
   */
  public static extractSelectedFaces(
    targetMesh: THREE.Mesh,
    targetInstance: SceneModelInstance,
    sourceAsset: Imported3DAsset,
    selectedFaceIndices: number[]
  ): { extractedResult: SplitResult; remainingGeometry: THREE.BufferGeometry } | null {
    const geometry = targetMesh.geometry;
    if (!geometry || selectedFaceIndices.length === 0) return null;

    const numTriangles = geometry.index
      ? geometry.index.count / 3
      : geometry.attributes.position.count / 3;

    if (selectedFaceIndices.length >= numTriangles) {
      return null; // Cannot extract all faces (would leave empty)
    }

    const selectedSet = new Set(selectedFaceIndices);
    const remainingIndices: number[] = [];
    for (let i = 0; i < numTriangles; i++) {
      if (!selectedSet.has(i)) {
        remainingIndices.push(i);
      }
    }

    // Extract selected sub-geometry
    const extractedGeom = TriangleConnectivityAnalyzer.extractSubGeometry(
      geometry,
      selectedFaceIndices
    );
    const extractedMesh = new THREE.Mesh(extractedGeom, targetMesh.material);
    extractedMesh.position.copy(targetMesh.position);
    extractedMesh.quaternion.copy(targetMesh.quaternion);
    extractedMesh.scale.copy(targetMesh.scale);

    const derivedAsset = this.createDerivedAsset(
      sourceAsset,
      extractedMesh,
      `Extracted Surfaces (${selectedFaceIndices.length} faces)`,
      "manual_surface_extraction"
    );

    const newInstanceId = `inst-extracted-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    extractedMesh.userData.instanceId = newInstanceId;
    extractedMesh.userData.assetId = derivedAsset.id;

    // Remaining geometry
    const remainingGeom = TriangleConnectivityAnalyzer.extractSubGeometry(
      geometry,
      remainingIndices
    );

    return {
      extractedResult: {
        derivedAssets: [derivedAsset],
        newInstances: [
          {
            instanceId: newInstanceId,
            assetId: derivedAsset.id,
            name: derivedAsset.name,
            transform: {
              position: [extractedMesh.position.x, extractedMesh.position.y, extractedMesh.position.z],
              rotation: [
                THREE.MathUtils.radToDeg(extractedMesh.rotation.x),
                THREE.MathUtils.radToDeg(extractedMesh.rotation.y),
                THREE.MathUtils.radToDeg(extractedMesh.rotation.z),
              ],
              scale: [extractedMesh.scale.x, extractedMesh.scale.y, extractedMesh.scale.z],
            },
            visible: true,
            locked: false,
            coordinateAdapter: { ...targetInstance.coordinateAdapter },
          },
        ],
        threeObjects: [extractedMesh],
        explodeComponents: [
          {
            componentId: newInstanceId,
            name: derivedAsset.name,
            origin: [extractedMesh.position.x, extractedMesh.position.y, extractedMesh.position.z],
            explodeDirection: [0, 0, 1],
            explodeDistance: 150,
          },
        ],
        splitType: "face_extraction",
      },
      remainingGeometry: remainingGeom,
    };
  }

  /**
   * M. SMALL COMPONENT FILTER:
   * Returns list of small components and enables user-confirmed deletion.
   */
  public static filterSmallComponents(
    geometry: THREE.BufferGeometry,
    thresholdPercent: number
  ): {
    smallComponents: ConnectedComponentInfo[];
    totalSmallTriangles: number;
    totalSmallPercentage: number;
  } {
    const analysis = TriangleConnectivityAnalyzer.analyze(geometry, thresholdPercent);
    const small = analysis.components.filter((c) => c.isSmall);
    const totalSmallTriangles = small.reduce((sum, c) => sum + c.triangleCount, 0);
    const totalSmallPercentage = small.reduce((sum, c) => sum + c.percentage, 0);

    return {
      smallComponents: small,
      totalSmallTriangles,
      totalSmallPercentage: parseFloat(totalSmallPercentage.toFixed(2)),
    };
  }

  /**
   * Removes small components upon explicit user confirmation
   */
  public static removeComponents(
    geometry: THREE.BufferGeometry,
    componentsToRemove: ConnectedComponentInfo[]
  ): THREE.BufferGeometry {
    const removeTriSet = new Set<number>();
    componentsToRemove.forEach((c) => {
      c.triangleIndices.forEach((t) => removeTriSet.add(t));
    });

    const totalTriangles = geometry.index
      ? geometry.index.count / 3
      : geometry.attributes.position.count / 3;

    const remainingIndices: number[] = [];
    for (let t = 0; t < totalTriangles; t++) {
      if (!removeTriSet.has(t)) {
        remainingIndices.push(t);
      }
    }

    return TriangleConnectivityAnalyzer.extractSubGeometry(geometry, remainingIndices);
  }
}
