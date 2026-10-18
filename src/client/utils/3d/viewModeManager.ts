import * as THREE from "three";

export type WorkspaceViewMode = "solid" | "wireframe" | "ghost" | "xray";

export class ViewModeManager {
  private currentMode: WorkspaceViewMode = "solid";
  private isIsolated: boolean = false;
  private isolatedObjectId: string | null = null;
  private hiddenForIsolation: THREE.Object3D[] = [];

  // Runtime materials for Ghost and X-Ray (never overwrite original materials)
  private ghostMaterial = new THREE.MeshStandardMaterial({
    color: 0x8899aa,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    roughness: 0.9,
    metalness: 0.1,
  });

  private xrayMaterial = new THREE.MeshBasicMaterial({
    color: 0x4fc3f7,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  private wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0x64b5f6,
    wireframe: true,
  });

  public setViewMode(mode: WorkspaceViewMode, rootObject: THREE.Object3D): void {
    if (this.currentMode === mode) return;
    this.currentMode = mode;

    rootObject.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        // Backup original material if not already backed up
        if (!mesh.userData.__origMaterial) {
          mesh.userData.__origMaterial = mesh.material;
        }

        switch (mode) {
          case "solid":
            mesh.material = mesh.userData.__origMaterial;
            break;
          case "wireframe":
            mesh.material = this.wireframeMaterial;
            break;
          case "ghost":
            mesh.material = this.ghostMaterial;
            break;
          case "xray":
            mesh.material = this.xrayMaterial;
            break;
        }
      }
    });
  }

  public getViewMode(): WorkspaceViewMode {
    return this.currentMode;
  }

  /**
   * Isolate target object, hiding all other sibling/root objects (Section Q)
   */
  public isolateObject(target: THREE.Object3D, rootObject: THREE.Object3D): void {
    this.exitIsolation(); // Clear any previous isolation

    this.isIsolated = true;
    this.isolatedObjectId = target.uuid;
    this.hiddenForIsolation = [];

    // Find all top-level or direct child objects in root that are NOT target
    rootObject.children.forEach((child) => {
      if (child !== target && !target.children.includes(child)) {
        if (child.visible) {
          child.visible = false;
          this.hiddenForIsolation.push(child);
        }
      }
    });
    target.visible = true;
  }

  /**
   * Restore visibility of all objects hidden during isolation
   */
  public exitIsolation(): void {
    if (!this.isIsolated) return;

    this.hiddenForIsolation.forEach((obj) => {
      obj.visible = true;
    });
    this.hiddenForIsolation = [];
    this.isIsolated = false;
    this.isolatedObjectId = null;
  }

  public getIsIsolated(): boolean {
    return this.isIsolated;
  }

  public dispose(): void {
    this.ghostMaterial.dispose();
    this.xrayMaterial.dispose();
    this.wireframeMaterial.dispose();
  }
}
