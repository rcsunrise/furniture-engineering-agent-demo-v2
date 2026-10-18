import * as THREE from "three";

export type CameraPreset = "FRONT" | "BACK" | "LEFT" | "RIGHT" | "TOP" | "BOTTOM" | "ISO";
export type ProjectionMode = "perspective" | "orthographic";

export class CameraController {
  /**
   * Fit camera to an object or bounding box without ever modifying object scale (Section F)
   */
  public static fitCameraToObject(
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
    controls: any,
    targetObject: THREE.Object3D,
    paddingFactor: number = 1.5
  ): void {
    targetObject.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(targetObject);
    if (box.isEmpty()) return;

    this.fitCameraToBox(camera, controls, box, paddingFactor);
  }

  /**
   * Fit camera to a specified Box3
   */
  public static fitCameraToBox(
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
    controls: any,
    box: THREE.Box3,
    paddingFactor: number = 1.5
  ): void {
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z, 50);
    const target = controls?.target ? controls.target.clone() : new THREE.Vector3(0, 0, 0);

    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const perspCam = camera as THREE.PerspectiveCamera;
      const fovRad = (perspCam.fov * Math.PI) / 180;
      const distance = (maxDim / (2 * Math.tan(fovRad / 2))) * paddingFactor;

      // Maintain current camera look direction or use default offset
      const direction = new THREE.Vector3()
        .subVectors(perspCam.position, target)
        .normalize();

      if (direction.lengthSq() < 1e-4) {
        direction.set(1, 1, 1).normalize();
      }

      perspCam.position.copy(center).addScaledVector(direction, distance);
      perspCam.lookAt(center);
      if (controls?.target) {
        controls.target.copy(center);
        if (typeof controls.update === "function") controls.update();
      }
    } else {
      const orthoCam = camera as THREE.OrthographicCamera;
      const aspect = (orthoCam.right - orthoCam.left) / (orthoCam.top - orthoCam.bottom || 1);
      const halfSize = (maxDim / 2) * paddingFactor;

      orthoCam.left = -halfSize * aspect;
      orthoCam.right = halfSize * aspect;
      orthoCam.top = halfSize;
      orthoCam.bottom = -halfSize;
      orthoCam.updateProjectionMatrix();

      orthoCam.lookAt(center);
      if (controls?.target) {
        controls.target.copy(center);
        if (typeof controls.update === "function") controls.update();
      }
    }
  }

  /**
   * Move camera to a standard engineering orthographic / perspective preset
   */
  public static setPresetView(
    camera: THREE.Camera,
    controls: any,
    preset: CameraPreset,
    targetBox?: THREE.Box3
  ): void {
    const center = new THREE.Vector3();
    let distance = 1200;

    if (targetBox && !targetBox.isEmpty()) {
      targetBox.getCenter(center);
      const size = new THREE.Vector3();
      targetBox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 100);
      distance = maxDim * 1.8;
    } else if (controls?.target) {
      center.copy(controls.target);
      distance = camera.position.distanceTo(center) || 1200;
    } else {
      center.set(0, 0, 0);
      distance = camera.position.distanceTo(center) || 1200;
    }

    const pos = new THREE.Vector3();
    camera.up.set(0, 1, 0);

    switch (preset) {
      case "FRONT":
        pos.set(center.x, center.y, center.z + distance);
        break;
      case "BACK":
        pos.set(center.x, center.y, center.z - distance);
        break;
      case "LEFT":
        pos.set(center.x - distance, center.y, center.z);
        break;
      case "RIGHT":
        pos.set(center.x + distance, center.y, center.z);
        break;
      case "TOP":
        camera.up.set(0, 0, -1);
        pos.set(center.x, center.y + distance, center.z + 0.001);
        break;
      case "BOTTOM":
        camera.up.set(0, 0, 1);
        pos.set(center.x, center.y - distance, center.z + 0.001);
        break;
      case "ISO":
      default:
        pos.set(
          center.x + distance * 0.65,
          center.y + distance * 0.55,
          center.z + distance * 0.65
        );
        break;
    }

    camera.position.copy(pos);
    camera.lookAt(center);
    if (controls?.target) {
      controls.target.copy(center);
      if (typeof controls.update === "function") controls.update();
    }
  }
}
