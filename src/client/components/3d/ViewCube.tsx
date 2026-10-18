import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import type { CameraPreset, ProjectionMode } from "../../utils/3d/cameraController.js";
import { Box, Compass } from "lucide-react";

interface ViewCubeProps {
  camera: THREE.Camera | null;
  controls: any;
  onSelectPreset: (preset: CameraPreset) => void;
  projectionMode: ProjectionMode;
  onToggleProjection: () => void;
}

export const ViewCube: React.FC<ViewCubeProps> = ({
  camera,
  controls,
  onSelectPreset,
  projectionMode,
  onToggleProjection,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const cubeSceneRef = useRef<THREE.Scene | null>(null);
  const cubeCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const cubeRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cubeMeshRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const width = 110;
    const height = 110;

    const scene = new THREE.Scene();
    cubeSceneRef.current = scene;

    const orthoCam = new THREE.OrthographicCamera(-1.8, 1.8, 1.8, -1.8, 0.1, 50);
    orthoCam.position.set(0, 0, 10);
    cubeCameraRef.current = orthoCam;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);
    cubeRendererRef.current = renderer;

    // Create 6 face canvas textures
    const createFaceTexture = (text: string, bgColor: string, textColor: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, 128, 128);

      // Border
      ctx.strokeStyle = "#444455";
      ctx.lineWidth = 6;
      ctx.strokeRect(0, 0, 128, 128);

      // Text
      ctx.fillStyle = textColor;
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 64, 64);

      return new THREE.CanvasTexture(canvas);
    };

    // Right (+X), Left (-X), Top (+Y or +Z), Bottom, Front, Back
    const materials = [
      new THREE.MeshBasicMaterial({ map: createFaceTexture("右 (R)", "#22252e", "#81c784") }), // +X
      new THREE.MeshBasicMaterial({ map: createFaceTexture("左 (L)", "#22252e", "#81c784") }), // -X
      new THREE.MeshBasicMaterial({ map: createFaceTexture("前 (F)", "#262b36", "#64b5f6") }), // +Y
      new THREE.MeshBasicMaterial({ map: createFaceTexture("后 (B)", "#262b36", "#64b5f6") }), // -Y
      new THREE.MeshBasicMaterial({ map: createFaceTexture("顶 (T)", "#2c2a38", "#ba68c8") }), // +Z
      new THREE.MeshBasicMaterial({ map: createFaceTexture("底 (D)", "#2c2a38", "#ba68c8") }), // -Z
    ];

    const geom = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    const cube = new THREE.Mesh(geom, materials);
    scene.add(cube);
    cubeMeshRef.current = cube;

    // Raycaster for face clicking
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, orthoCam);
      const intersects = raycaster.intersectObject(cube);
      if (intersects.length > 0 && intersects[0].faceIndex !== undefined && intersects[0].faceIndex !== null) {
        const faceIdx = Math.floor(intersects[0].faceIndex / 2);
        // Face indices: 0: +X (Right), 1: -X (Left), 2: +Y (Front), 3: -Y (Back), 4: +Z (Top), 5: -Z (Bottom)
        const presetMap: CameraPreset[] = ["RIGHT", "LEFT", "FRONT", "BACK", "TOP", "BOTTOM"];
        const chosen = presetMap[faceIdx];
        if (chosen) {
          onSelectPreset(chosen);
        }
      }
    };

    renderer.domElement.addEventListener("click", handleClick);

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (camera && cube) {
        // Sync cube rotation with main camera's inverted rotation
        cube.quaternion.copy(camera.quaternion).invert();
      }
      renderer.render(scene, orthoCam);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      renderer.domElement.removeEventListener("click", handleClick);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      geom.dispose();
      materials.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
      renderer.dispose();
    };
  }, [camera, onSelectPreset]);

  return (
    <div className="flex flex-col items-center gap-1.5 pointer-events-auto bg-neutral-900/90 p-1.5 rounded-xl border border-neutral-800 shadow-xl backdrop-blur-md">
      {/* 3D Cube Canvas Mount */}
      <div
        ref={mountRef}
        className="w-[110px] h-[110px] cursor-pointer"
        title="点击立方体表面切换正交视角 (Front/Back/Left/Right/Top/Bottom)"
      />

      {/* Preset Quick Actions */}
      <div className="flex items-center gap-1 w-full justify-center">
        <button
          onClick={() => onSelectPreset("ISO")}
          className="px-2 py-0.5 text-[10px] font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded border border-neutral-700 transition"
          title="重置为等轴测视角 (ISO)"
        >
          ISO
        </button>
        <button
          onClick={onToggleProjection}
          className="px-2 py-0.5 text-[10px] font-semibold bg-neutral-800 hover:bg-neutral-700 text-indigo-300 rounded border border-neutral-700 transition"
          title="切换 透视 (Perspective) / 正交 (Orthographic) 投影"
        >
          {projectionMode === "perspective" ? "透视" : "正交"}
        </button>
      </div>
    </div>
  );
};
