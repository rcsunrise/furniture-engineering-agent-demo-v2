import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

export type TransformMode = "translate" | "rotate" | "scale";
export type TransformSpace = "world" | "local";

export interface SnapSettings {
  positionSnap: number | null; // in mm: 1, 5, 10, 50 or null (off)
  rotationSnap: number | null; // in degrees: 1, 5, 15, 45 or null (off)
  scaleSnap: number | null;    // factor: 0.01, 0.1 or null (off)
}

export class TransformController {
  public controls: TransformControls;
  private camera: THREE.Camera;
  private domElement: HTMLElement;
  private orbitControls?: any;
  private scene?: THREE.Scene;
  private snapSettings: SnapSettings = {
    positionSnap: null,
    rotationSnap: null,
    scaleSnap: null,
  };
  private onTransformEndCallback?: (object: THREE.Object3D) => void;

  constructor(
    camera: THREE.Camera,
    domElement: HTMLElement,
    scene?: THREE.Scene,
    orbitControls?: any,
    onTransformEnd?: (object: THREE.Object3D) => void
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.scene = scene;
    this.orbitControls = orbitControls;
    this.onTransformEndCallback = onTransformEnd;

    this.controls = new TransformControls(this.camera, this.domElement);
    this.controls.size = 0.85;

    // Connect to OrbitControls to prevent conflict (Section D)
    this.controls.addEventListener("dragging-changed", (event: any) => {
      if (this.orbitControls) {
        this.orbitControls.enabled = !event.value;
      }
      if (!event.value && this.controls.object && this.onTransformEndCallback) {
        this.onTransformEndCallback(this.controls.object);
      }
    });

    if (this.scene) {
      this.scene.add(this.controls.getHelper());
    }
  }

  public getControls(): TransformControls {
    return this.controls;
  }

  public getTarget(): THREE.Object3D | null {
    return this.controls.object || null;
  }

  public setMode(mode: TransformMode): void {
    this.controls.setMode(mode);
    this.applySnaps();
  }

  public getMode(): TransformMode {
    return this.controls.getMode() as TransformMode;
  }

  public setSpace(space: TransformSpace): void {
    this.controls.setSpace(space);
  }

  public getSpace(): TransformSpace {
    return this.controls.space as TransformSpace;
  }

  public setSnapSettings(settings: Partial<SnapSettings>): void {
    this.snapSettings = { ...this.snapSettings, ...settings };
    this.applySnaps();
  }

  public getSnapSettings(): SnapSettings {
    return { ...this.snapSettings };
  }

  private applySnaps(): void {
    // Position snap
    this.controls.setTranslationSnap(this.snapSettings.positionSnap ?? null);

    // Rotation snap (convert degrees to radians)
    if (this.snapSettings.rotationSnap !== null) {
      this.controls.setRotationSnap(THREE.MathUtils.degToRad(this.snapSettings.rotationSnap));
    } else {
      this.controls.setRotationSnap(null);
    }

    // Scale snap
    this.controls.setScaleSnap(this.snapSettings.scaleSnap ?? null);
  }

  public attach(object: THREE.Object3D): void {
    this.controls.attach(object);
    this.applySnaps();
  }

  public detach(): void {
    this.controls.detach();
  }

  public isAttached(): boolean {
    return !!this.controls.object;
  }

  public getAttachedObject(): THREE.Object3D | null {
    return this.controls.object || null;
  }

  public setEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  public updateCamera(camera: THREE.Camera): void {
    this.camera = camera;
    this.controls.camera = camera;
  }

  public dispose(scene?: THREE.Scene): void {
    this.controls.detach();
    this.controls.dispose();
    const targetScene = scene || this.scene;
    if (targetScene) {
      try {
        targetScene.remove(this.controls.getHelper());
      } catch (e) {
        // ignore
      }
    }
  }
}
