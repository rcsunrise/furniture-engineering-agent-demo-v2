import * as THREE from "three";

export class FaceSelector {
  private targetMesh: THREE.Mesh | null = null;
  private selectedFaceIndices: Set<number> = new Set();
  private highlightMesh: THREE.Mesh | null = null;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private domElement?: HTMLElement;
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private highlightMaterial: THREE.MeshBasicMaterial;
  public onSelectionChange?: (count: number) => void;

  constructor(scene: THREE.Scene, camera: THREE.Camera, domElement?: HTMLElement) {
    this.scene = scene;
    this.camera = camera;
    this.domElement = domElement;
    this.highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }

  public setTargetMesh(mesh: THREE.Mesh | null): void {
    if (this.targetMesh === mesh) return;
    this.clearSelection();
    this.targetMesh = mesh;
  }

  public getTargetMesh(): THREE.Mesh | null {
    return this.targetMesh;
  }

  public getSelectedFaceIndices(): number[] {
    return Array.from(this.selectedFaceIndices);
  }

  public getSelectedCount(): number {
    return this.selectedFaceIndices.size;
  }

  public clearSelection(): void {
    this.selectedFaceIndices.clear();
    this.updateHighlightMesh();
  }

  public selectFaceAtScreenPoint(
    screenX: number, // Normalized -1 to +1
    screenY: number, // Normalized -1 to +1
    isShift: boolean,
    isCtrlOrCmd: boolean
  ): boolean {
    if (!this.targetMesh) return false;

    this.raycaster.setFromCamera(new THREE.Vector2(screenX, screenY), this.camera);
    const intersects = this.raycaster.intersectObject(this.targetMesh, false);

    if (intersects.length === 0 || intersects[0].faceIndex === undefined) {
      if (!isShift && !isCtrlOrCmd) {
        this.clearSelection();
      }
      return false;
    }

    const faceIndex = intersects[0].faceIndex;
    if (faceIndex == null) return false;

    if (isCtrlOrCmd) {
      // Remove from selection
      this.selectedFaceIndices.delete(faceIndex);
    } else if (isShift) {
      // Add to selection
      this.selectedFaceIndices.add(faceIndex);
    } else {
      // Single face replacement
      this.selectedFaceIndices.clear();
      this.selectedFaceIndices.add(faceIndex);
    }

    this.updateHighlightMesh();
    return true;
  }

  /**
   * Box Selection: select all faces whose center projects inside the 2D bounding box
   */
  public selectFacesInRect(
    minX: number, // screen coords -1 to 1
    maxX: number,
    minY: number,
    maxY: number,
    isShift: boolean,
    isCtrlOrCmd: boolean
  ): void {
    if (!this.targetMesh || !this.targetMesh.geometry) return;

    const geom = this.targetMesh.geometry;
    const posAttr = geom.attributes.position;
    const indexAttr = geom.index;
    const numTriangles = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;

    this.targetMesh.updateWorldMatrix(true, false);
    const worldMatrix = this.targetMesh.matrixWorld;

    const v0 = new THREE.Vector3();
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    const center = new THREE.Vector3();

    if (!isShift && !isCtrlOrCmd) {
      this.selectedFaceIndices.clear();
    }

    for (let t = 0; t < numTriangles; t++) {
      let i0: number, i1: number, i2: number;
      if (indexAttr) {
        i0 = indexAttr.getX(t * 3);
        i1 = indexAttr.getX(t * 3 + 1);
        i2 = indexAttr.getX(t * 3 + 2);
      } else {
        i0 = t * 3;
        i1 = t * 3 + 1;
        i2 = t * 3 + 2;
      }

      v0.set(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0)).applyMatrix4(worldMatrix);
      v1.set(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1)).applyMatrix4(worldMatrix);
      v2.set(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2)).applyMatrix4(worldMatrix);

      center.addVectors(v0, v1).add(v2).divideScalar(3);
      center.project(this.camera);

      // Check if inside normalized rectangle and in front of camera
      if (
        center.z < 1 &&
        center.x >= minX &&
        center.x <= maxX &&
        center.y >= minY &&
        center.y <= maxY
      ) {
        if (isCtrlOrCmd) {
          this.selectedFaceIndices.delete(t);
        } else {
          this.selectedFaceIndices.add(t);
        }
      }
    }

    this.updateHighlightMesh();
  }

  private updateHighlightMesh(): void {
    if (this.highlightMesh) {
      this.scene.remove(this.highlightMesh);
      this.highlightMesh.geometry.dispose();
      this.highlightMesh = null;
    }

    if (!this.targetMesh || this.selectedFaceIndices.size === 0) return;

    const geom = this.targetMesh.geometry;
    const posAttr = geom.attributes.position;
    const indexAttr = geom.index;

    const highlightGeom = new THREE.BufferGeometry();
    const positions: number[] = [];

    for (const t of this.selectedFaceIndices) {
      let i0: number, i1: number, i2: number;
      if (indexAttr) {
        i0 = indexAttr.getX(t * 3);
        i1 = indexAttr.getX(t * 3 + 1);
        i2 = indexAttr.getX(t * 3 + 2);
      } else {
        i0 = t * 3;
        i1 = t * 3 + 1;
        i2 = t * 3 + 2;
      }

      positions.push(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
      positions.push(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
      positions.push(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
    }

    highlightGeom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    highlightGeom.computeVertexNormals();

    this.highlightMesh = new THREE.Mesh(highlightGeom, this.highlightMaterial);
    this.highlightMesh.position.copy(this.targetMesh.position);
    this.highlightMesh.quaternion.copy(this.targetMesh.quaternion);
    this.highlightMesh.scale.copy(this.targetMesh.scale);
    this.highlightMesh.renderOrder = 999;

    this.scene.add(this.highlightMesh);
    this.onSelectionChange?.(this.selectedFaceIndices.size);
  }

  public updateCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  public dispose(): void {
    if (this.highlightMesh) {
      this.scene.remove(this.highlightMesh);
      this.highlightMesh.geometry.dispose();
      this.highlightMesh = null;
    }
    this.highlightMaterial.dispose();
  }
}
