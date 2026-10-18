import * as THREE from "three";
import type { ModelGeometryStats, ModelMaterialInfo } from "../../../shared/imported3dAsset.js";

export class ModelStatsCalculator {
  /**
   * Recursively traverses an Object3D to extract accurate geometric and material statistics.
   */
  public static computeStats(root: THREE.Object3D): {
    stats: ModelGeometryStats;
    materials: ModelMaterialInfo[];
  } {
    let meshCount = 0;
    let vertexCount = 0;
    let triangleCount = 0;
    const materialMap = new Map<string, THREE.Material>();
    const textureSet = new Set<string>();

    root.updateMatrixWorld(true);

    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshCount++;
        const mesh = child as THREE.Mesh;
        const geom = mesh.geometry;
        if (geom) {
          // Count vertices
          const posAttr = geom.getAttribute("position");
          if (posAttr) {
            vertexCount += posAttr.count;
          }

          // Count triangles
          if (geom.index) {
            triangleCount += geom.index.count / 3;
          } else if (posAttr) {
            triangleCount += posAttr.count / 3;
          }
        }

        // Collect materials
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((mat) => {
            if (mat && !materialMap.has(mat.uuid)) {
              materialMap.set(mat.uuid, mat);

              // Check for textures
              for (const key of Object.keys(mat)) {
                const val = (mat as any)[key];
                if (val && val.isTexture) {
                  textureSet.add(val.uuid);
                }
              }
            }
          });
        }
      }
    });

    // Compute bounding box in local frame
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);

    const materials: ModelMaterialInfo[] = Array.from(materialMap.values()).map((mat) => {
      const standard = mat as THREE.MeshStandardMaterial;
      return {
        name: mat.name || "DefaultMaterial",
        type: mat.type,
        color: standard.color ? `#${standard.color.getHexString()}` : undefined,
        wireframe: (mat as any).wireframe,
        hasTexture: Object.values(mat).some((v: any) => v && v.isTexture),
      };
    });

    const stats: ModelGeometryStats = {
      meshCount,
      vertexCount,
      triangleCount: Math.round(triangleCount),
      materialCount: materialMap.size,
      textureCount: textureSet.size,
      boundingBox: {
        min: [box.min.x, box.min.y, box.min.z],
        max: [box.max.x, box.max.y, box.max.z],
      },
      dimensions: {
        width: Math.round(size.x * 100) / 100,
        depth: Math.round(size.y * 100) / 100,
        height: Math.round(size.z * 100) / 100,
      },
    };

    return { stats, materials };
  }
}
