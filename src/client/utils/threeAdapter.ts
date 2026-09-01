import * as THREE from "three";

/**
 * Centralized Three.js Coordinate & Rotation Adapter.
 *
 * FES Coordinate System:
 * - X = Left / Right
 * - Y = Front / Back (Product front faces -Y)
 * - Z = Up / Down
 *
 * Three.js World Coordinates:
 * - threePos.x = fesPos.x
 * - threePos.y = fesPos.z
 * - threePos.z = -fesPos.y
 *
 * - threeSize.x = fesSize.x
 * - threeSize.y = fesSize.z
 * - threeSize.z = fesSize.y
 */

export const PRODUCT_FRONT_AXIS = "-Y";
export const UNIT_SCALE_MM_TO_M = 0.001;

export function fesToThreePosition(
  pos: { x: number; y: number; z: number },
  unitScale: number = UNIT_SCALE_MM_TO_M
): { x: number; y: number; z: number } {
  const px = Number.isFinite(pos?.x) ? pos.x : 0;
  const py = Number.isFinite(pos?.y) ? pos.y : 0;
  const pz = Number.isFinite(pos?.z) ? pos.z : 0;
  return {
    x: px * unitScale,
    y: pz * unitScale,
    z: -py * unitScale,
  };
}

export function fesToThreeSize(
  size: { x: number; y: number; z: number },
  unitScale: number = UNIT_SCALE_MM_TO_M
): { x: number; y: number; z: number } {
  const sx = Math.max(0.001, Number.isFinite(size?.x) ? size.x : 100);
  const sy = Math.max(0.001, Number.isFinite(size?.y) ? size.y : 100);
  const sz = Math.max(0.001, Number.isFinite(size?.z) ? size.z : 100);
  return {
    x: sx * unitScale,
    y: sz * unitScale,
    z: sy * unitScale,
  };
}

export function fesToThreeRotation(rot?: { x?: number; y?: number; z?: number }): { x: number; y: number; z: number } {
  const rx = rot?.x ?? 0;
  const ry = rot?.y ?? 0;
  const rz = rot?.z ?? 0;

  return {
    x: (rx * Math.PI) / 180,
    y: (rz * Math.PI) / 180,
    z: (-ry * Math.PI) / 180,
  };
}

export const VISUALIZATION_MATERIAL_PALETTE: Record<string, { color: number; label: string }> = {
  frame: { color: 0x8d6e63, label: "Frame / Structure (Wood Brown)" },
  base: { color: 0x6d4c41, label: "Base / Foundation (Dark Wood)" },
  base_frame: { color: 0x6d4c41, label: "Base Frame (Dark Wood)" },
  foam: { color: 0xfff59d, label: "Foam / Cushion (Yellow)" },
  fabric: { color: 0x42a5f5, label: "Fabric / Cover (Blue)" },
  hardware: { color: 0xb0bec5, label: "Hardware / Connectors (Metallic)" },
  leg: { color: 0x37474f, label: "Leg / Foot (Dark Slate)" },
  armrest: { color: 0xab47bc, label: "Armrest (Purple)" },
  seat: { color: 0x26a69a, label: "Seat Core (Teal)" },
  cushion: { color: 0x26a69a, label: "Cushion (Teal)" },
  cushion_seat: { color: 0x26a69a, label: "Seat Cushion (Teal)" },
  backrest: { color: 0xef5350, label: "Backrest (Coral Red)" },
  cushion_back: { color: 0xef5350, label: "Back Cushion (Coral Red)" },
  pillow: { color: 0xffb74d, label: "Pillow / Lumbar (Orange Amber)" },
  support: { color: 0x90a4ae, label: "Support / Beam (Steel Blue)" },
  panel: { color: 0xbcaaa4, label: "Panel / Board (Sand Gray)" },
  structure: { color: 0x78909c, label: "Structure (Cool Gray)" },
  other: { color: 0x78909c, label: "Other / Misc Component" },
};

export function getVisualizationMaterialColor(type: string): number {
  const t = (type || "").toLowerCase().replace(/[\s\-_]+/g, "");
  if (VISUALIZATION_MATERIAL_PALETTE[type.toLowerCase()]) {
    return VISUALIZATION_MATERIAL_PALETTE[type.toLowerCase()].color;
  }
  if (t.includes("seat") || t.includes("座")) return VISUALIZATION_MATERIAL_PALETTE.seat.color;
  if (t.includes("back") || t.includes("靠")) return VISUALIZATION_MATERIAL_PALETTE.backrest.color;
  if (t.includes("arm") || t.includes("扶手")) return VISUALIZATION_MATERIAL_PALETTE.armrest.color;
  if (t.includes("leg") || t.includes("foot") || t.includes("脚")) return VISUALIZATION_MATERIAL_PALETTE.leg.color;
  if (t.includes("base") || t.includes("底")) return VISUALIZATION_MATERIAL_PALETTE.base.color;
  if (t.includes("pillow") || t.includes("枕")) return VISUALIZATION_MATERIAL_PALETTE.pillow.color;
  if (t.includes("frame") || t.includes("架") || t.includes("框")) return VISUALIZATION_MATERIAL_PALETTE.frame.color;
  if (t.includes("foam") || t.includes("海绵")) return VISUALIZATION_MATERIAL_PALETTE.foam.color;
  if (t.includes("fabric") || t.includes("面料") || t.includes("皮") || t.includes("布")) return VISUALIZATION_MATERIAL_PALETTE.fabric.color;
  if (t.includes("hardware") || t.includes("五金") || t.includes("螺丝")) return VISUALIZATION_MATERIAL_PALETTE.hardware.color;
  return VISUALIZATION_MATERIAL_PALETTE.other.color;
}

/**
 * Auto-fits camera frustum to frame object bounding box.
 */
export function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void },
  object: THREE.Object3D,
  offset: number = 1.25
) {
  const boundingBox = new THREE.Box3();
  boundingBox.setFromObject(object);

  if (boundingBox.isEmpty()) {
    return {
      center: new THREE.Vector3(0, 0, 0),
      size: new THREE.Vector3(1, 1, 1),
      maxDim: 1,
      cameraDistance: 2,
    };
  }

  const center = boundingBox.getCenter(new THREE.Vector3());
  const size = boundingBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);

  const fovRad = (camera.fov * Math.PI) / 180;
  let cameraDistance = (maxDim / 2) / Math.tan(fovRad / 2);
  cameraDistance *= offset;

  camera.position.set(center.x, center.y + size.y * 0.2, center.z + cameraDistance);
  controls.target.copy(center);

  camera.near = Math.max(0.001, cameraDistance / 100);
  camera.far = Math.max(100, cameraDistance * 100);

  camera.updateProjectionMatrix();
  controls.update();

  return { center, size, maxDim, cameraDistance };
}
