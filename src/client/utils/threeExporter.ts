import * as THREE from "three";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { PLYExporter } from "three/examples/jsm/exporters/PLYExporter.js";
import { triggerFileDownload } from "./cadExporter.js";

export type Export3DFormat = "OBJ" | "STL" | "GLTF" | "GLB" | "PLY";

/**
 * Filter and clone assembly mesh components from scene to prepare clean export group.
 */
function createExportGroup(sceneOrGroup: THREE.Object3D): THREE.Group {
  const exportGroup = new THREE.Group();
  exportGroup.name = "FurnitureAssembly";

  sceneOrGroup.traverse((child) => {
    if (child instanceof THREE.Mesh && child.name && !child.name.includes("Grid") && !child.name.includes("Helper")) {
      const clonedMesh = child.clone(true);
      exportGroup.add(clonedMesh);
    }
  });

  // Fallback: if no named child meshes found, clone all visible meshes
  if (exportGroup.children.length === 0) {
    sceneOrGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && !(child.geometry instanceof THREE.PlaneGeometry)) {
        exportGroup.add(child.clone(true));
      }
    });
  }

  return exportGroup;
}

/**
 * Export 3D assembly scene or group to standard 3D formats (OBJ, STL, GLTF, GLB, PLY).
 */
export async function export3DModel(
  sceneOrGroup: THREE.Object3D,
  fileNameBase: string,
  format: Export3DFormat
): Promise<void> {
  const exportGroup = createExportGroup(sceneOrGroup);

  switch (format) {
    case "OBJ": {
      const exporter = new OBJExporter();
      const result = exporter.parse(exportGroup);
      triggerFileDownload(result, `${fileNameBase}.obj`, "text/plain");
      break;
    }

    case "STL": {
      const exporter = new STLExporter();
      const result = exporter.parse(exportGroup, { binary: true });
      triggerFileDownload(
        new Blob([result], { type: "application/octet-stream" }),
        `${fileNameBase}.stl`,
        "application/octet-stream"
      );
      break;
    }

    case "GLTF": {
      const exporter = new GLTFExporter();
      exporter.parse(
        exportGroup,
        (gltf) => {
          const output = JSON.stringify(gltf, null, 2);
          triggerFileDownload(output, `${fileNameBase}.gltf`, "application/json");
        },
        (error) => {
          console.error("GLTF Export error:", error);
        },
        { binary: false }
      );
      break;
    }

    case "GLB": {
      const exporter = new GLTFExporter();
      exporter.parse(
        exportGroup,
        (glb) => {
          if (glb instanceof ArrayBuffer) {
            triggerFileDownload(
              new Blob([glb], { type: "model/gltf-binary" }),
              `${fileNameBase}.glb`,
              "model/gltf-binary"
            );
          }
        },
        (error) => {
          console.error("GLB Export error:", error);
        },
        { binary: true }
      );
      break;
    }

    case "PLY": {
      const exporter = new PLYExporter();
      exporter.parse(
        exportGroup,
        (result) => {
          if (result instanceof ArrayBuffer) {
            triggerFileDownload(
              new Blob([result], { type: "application/octet-stream" }),
              `${fileNameBase}.ply`,
              "application/octet-stream"
            );
          } else {
            triggerFileDownload(result, `${fileNameBase}.ply`, "text/plain");
          }
        },
        { binary: true }
      );
      break;
    }
  }
}
