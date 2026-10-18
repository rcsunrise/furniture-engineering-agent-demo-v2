import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import JSZip from "jszip";
import type { Model3DFormat, CoordinateUpAxis } from "../../../shared/imported3dAsset.js";
import { ModelStatsCalculator } from "./modelStatsCalculator.js";
import { CoordinateSystemAdapter } from "./coordinateSystemAdapter.js";

export interface ParsedModelResult {
  rootObject: THREE.Object3D;
  format: Model3DFormat;
  detectedUp: CoordinateUpAxis;
  stats: ReturnType<typeof ModelStatsCalculator.computeStats>["stats"];
  materials: ReturnType<typeof ModelStatsCalculator.computeStats>["materials"];
  thumbnailWebP?: string;
}

export class ModelLoaderService {
  /**
   * Detects 3D file format from filename or mime-type.
   */
  public static detectFormat(fileName: string): Model3DFormat {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    if (ext === "glb") return "glb";
    if (ext === "gltf") return "gltf";
    if (ext === "obj") return "obj";
    if (ext === "stl") return "stl";
    if (ext === "ply") return "ply";
    if (ext === "fbx") return "fbx";
    if (ext === "zip") return "zip";
    return "glb";
  }

  /**
   * Loads a model from an ArrayBuffer or File using standard Three.js loaders.
   * Does NOT alter scene global state.
   */
  public static async loadModel(
    buffer: ArrayBuffer,
    fileName: string,
    forcedFormat?: Model3DFormat
  ): Promise<ParsedModelResult> {
    const format = forcedFormat || this.detectFormat(fileName);
    let rootObject: THREE.Object3D;

    switch (format) {
      case "glb":
      case "gltf": {
        rootObject = await this.loadGLTF(buffer);
        break;
      }
      case "zip": {
        rootObject = await this.loadZipBundle(buffer);
        break;
      }
      case "obj": {
        rootObject = await this.loadOBJ(buffer);
        break;
      }
      case "stl": {
        rootObject = await this.loadSTL(buffer);
        break;
      }
      case "ply": {
        rootObject = await this.loadPLY(buffer);
        break;
      }
      case "fbx": {
        rootObject = await this.loadFBX(buffer);
        break;
      }
      default:
        throw new Error(`Unsupported 3D model format: ${format}`);
    }

    rootObject.name = fileName.replace(/\.[^/.]+$/, "");

    // Detect coordinate UP axis from format or geometry heuristics
    let detectedUp: CoordinateUpAxis = "Y_UP";
    if (format === "stl" || format === "ply") {
      // STL and PLY from CAD are predominantly Z-UP
      detectedUp = "Z_UP";
    }

    // Calculate geometric stats
    const { stats, materials } = ModelStatsCalculator.computeStats(rootObject);

    // Generate WebP isometric thumbnail
    let thumbnailWebP: string | undefined;
    try {
      thumbnailWebP = this.generateThumbnail(rootObject);
    } catch (e) {
      console.warn("Thumbnail generation deferred or skipped:", e);
    }

    return {
      rootObject,
      format,
      detectedUp,
      stats,
      materials,
      thumbnailWebP,
    };
  }

  /**
   * Loads GLTF or GLB from ArrayBuffer.
   */
  private static loadGLTF(buffer: ArrayBuffer): Promise<THREE.Object3D> {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.parse(
        buffer,
        "",
        (gltf) => {
          const scene = gltf.scene || new THREE.Group();
          resolve(scene);
        },
        (error) => {
          reject(new Error(`Failed to parse GLTF/GLB: ${error.message || error}`));
        }
      );
    });
  }

  /**
   * Loads a ZIP bundle containing GLTF with external .bin and texture assets.
   */
  private static async loadZipBundle(buffer: ArrayBuffer): Promise<THREE.Object3D> {
    const zip = await JSZip.loadAsync(buffer);
    const blobUrls: string[] = [];
    const fileUrlMap: Record<string, string> = {};

    let gltfFileName = "";
    let glbFileName = "";
    let objFileName = "";
    let stlFileName = "";
    let plyFileName = "";

    // Unpack files into blob URLs
    const entries = Object.keys(zip.files);
    for (const relativePath of entries) {
      const zipEntry = zip.files[relativePath];
      if (zipEntry.dir) continue;

      const lower = relativePath.toLowerCase();
      if (lower.endsWith(".gltf")) {
        gltfFileName = relativePath;
      } else if (lower.endsWith(".glb")) {
        glbFileName = relativePath;
      } else if (lower.endsWith(".obj")) {
        objFileName = relativePath;
      } else if (lower.endsWith(".stl")) {
        stlFileName = relativePath;
      } else if (lower.endsWith(".ply")) {
        plyFileName = relativePath;
      }

      const blob = await zipEntry.async("blob");
      const url = URL.createObjectURL(blob);
      blobUrls.push(url);
      fileUrlMap[relativePath] = url;
      // Also index by simple filename without path
      const simpleName = relativePath.split("/").pop() || relativePath;
      fileUrlMap[simpleName] = url;
    }

    const cleanupUrls = () => {
      blobUrls.forEach((u) => URL.revokeObjectURL(u));
    };

    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      // Normalize url
      const cleanUrl = decodeURIComponent(url).replace(/^[./]+/, "");
      const simpleName = cleanUrl.split("/").pop() || cleanUrl;
      return fileUrlMap[cleanUrl] || fileUrlMap[simpleName] || url;
    });

    try {
      if (glbFileName) {
        const glbBuffer = await zip.files[glbFileName].async("arraybuffer");
        const res = await this.loadGLTF(glbBuffer);
        cleanupUrls();
        return res;
      } else if (gltfFileName) {
        const gltfText = await zip.files[gltfFileName].async("text");
        return await new Promise<THREE.Object3D>((resolve, reject) => {
          const loader = new GLTFLoader(manager);
          loader.parse(
            gltfText,
            "",
            (gltf) => {
              cleanupUrls();
              resolve(gltf.scene || new THREE.Group());
            },
            (err) => {
              cleanupUrls();
              reject(err);
            }
          );
        });
      } else if (objFileName) {
        const objText = await zip.files[objFileName].async("text");
        const loader = new OBJLoader(manager);
        const obj = loader.parse(objText);
        cleanupUrls();
        return obj;
      } else if (stlFileName) {
        const stlBuffer = await zip.files[stlFileName].async("arraybuffer");
        const res = await this.loadSTL(stlBuffer);
        cleanupUrls();
        return res;
      } else if (plyFileName) {
        const plyBuffer = await zip.files[plyFileName].async("arraybuffer");
        const res = await this.loadPLY(plyBuffer);
        cleanupUrls();
        return res;
      } else {
        cleanupUrls();
        throw new Error("ZIP bundle does not contain a supported 3D model (.glb, .gltf, .obj, .stl, .ply).");
      }
    } catch (e) {
      cleanupUrls();
      throw e;
    }
  }

  /**
   * Loads OBJ format.
   */
  private static loadOBJ(buffer: ArrayBuffer): Promise<THREE.Object3D> {
    return new Promise((resolve) => {
      const decoder = new TextDecoder("utf-8");
      const text = decoder.decode(buffer);
      const loader = new OBJLoader();
      const object = loader.parse(text);
      resolve(object);
    });
  }

  /**
   * Loads STL format and wraps in a Mesh with standard material.
   */
  private static loadSTL(buffer: ArrayBuffer): Promise<THREE.Object3D> {
    return new Promise((resolve) => {
      const loader = new STLLoader();
      const geometry = loader.parse(buffer);
      geometry.computeVertexNormals();

      const material = new THREE.MeshStandardMaterial({
        color: 0x90caf9,
        roughness: 0.4,
        metalness: 0.2,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const group = new THREE.Group();
      group.add(mesh);
      resolve(group);
    });
  }

  /**
   * Loads PLY format.
   */
  private static loadPLY(buffer: ArrayBuffer): Promise<THREE.Object3D> {
    return new Promise((resolve) => {
      const loader = new PLYLoader();
      const geometry = loader.parse(buffer);
      geometry.computeVertexNormals();

      const material = new THREE.MeshStandardMaterial({
        color: 0xa5d6a7,
        roughness: 0.5,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const group = new THREE.Group();
      group.add(mesh);
      resolve(group);
    });
  }

  /**
   * Loads FBX format.
   */
  private static loadFBX(buffer: ArrayBuffer): Promise<THREE.Object3D> {
    return new Promise((resolve, reject) => {
      try {
        const loader = new FBXLoader();
        const object = loader.parse(buffer, "");
        resolve(object);
      } catch (err: any) {
        reject(new Error(`Failed to parse FBX: ${err?.message || err}`));
      }
    });
  }

  /**
   * Generates a clean 256x256 WebP thumbnail using a dedicated offscreen canvas.
   */
  public static generateThumbnail(sourceObject: THREE.Object3D, width = 256, height = 256): string {
    if (typeof document === "undefined") return "";

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x1e1f22, 1);

    const scene = new THREE.Scene();

    // Soft studio lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(5, 10, 7);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x90caf9, 0.4);
    dirLight2.position.set(-5, -5, -5);
    scene.add(dirLight2);

    // Clone object for thumbnail snapshot
    const cloned = sourceObject.clone(true);
    scene.add(cloned);

    // Center and scale clone into a unit box
    const box = new THREE.Box3().setFromObject(cloned);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);

    cloned.position.sub(center);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    const distance = Math.max(sphere.radius * 2.4, 2);
    // Fixed ISO camera position: 30° elevation, 45° azimuth
    camera.position.set(distance * 0.7, distance * 0.6, distance * 0.7);
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);

    const dataUrl = canvas.toDataURL("image/webp", 0.85);

    // Clean up thumbnail resources
    renderer.dispose();
    return dataUrl;
  }
}
