import * as THREE from "three";
import type { ExplodeComponentData } from "./modelSplitService.js";

export interface ExplodeEntry {
  data: ExplodeComponentData;
  object: THREE.Object3D;
}

export class ExplodeEngine {
  private entries: Map<string, ExplodeEntry> = new Map();
  private currentProgress: number = 0; // 0.0 to 1.0

  public register(object: THREE.Object3D, data: ExplodeComponentData): void {
    this.entries.set(data.componentId, {
      data,
      object,
    });
    this.updateObjectPosition(object, data, this.currentProgress);
  }

  public registerBatch(items: Array<{ object: THREE.Object3D; data: ExplodeComponentData }>): void {
    items.forEach((item) => this.register(item.object, item.data));
  }

  public unregister(componentId: string): void {
    const entry = this.entries.get(componentId);
    if (entry) {
      // Reset position to origin
      entry.object.position.set(...entry.data.origin);
      this.entries.delete(componentId);
    }
  }

  public setProgress(ratio: number): void {
    this.currentProgress = Math.max(0, Math.min(1, ratio));
    this.entries.forEach(({ object, data }) => {
      this.updateObjectPosition(object, data, this.currentProgress);
    });
  }

  public getProgress(): number {
    return this.currentProgress;
  }

  public getInstanceCount(): number {
    return this.entries.size;
  }

  public computeExplodeVectors(objects: THREE.Object3D[]): void {
    const center = new THREE.Vector3();
    const box = new THREE.Box3();
    objects.forEach((obj) => {
      box.expandByObject(obj);
    });
    box.getCenter(center);

    objects.forEach((obj, idx) => {
      const objCenter = new THREE.Vector3();
      new THREE.Box3().setFromObject(obj).getCenter(objCenter);
      const dir = objCenter.clone().sub(center);
      if (dir.lengthSq() < 0.0001) {
        dir.set(idx % 2 === 0 ? 1 : -1, 0, 0);
      } else {
        dir.normalize();
      }
      this.register(obj, {
        componentId: obj.uuid,
        name: obj.name,
        origin: [obj.position.x, obj.position.y, obj.position.z],
        explodeDirection: [dir.x, dir.y, dir.z],
        explodeDistance: 150,
      });
    });
  }

  public applyExplodeProgress(ratio: number, _objects?: THREE.Object3D[]): void {
    this.setProgress(ratio);
  }

  public hasEntries(): boolean {
    return this.entries.size > 0;
  }

  public clear(): void {
    this.entries.forEach(({ object, data }) => {
      object.position.set(...data.origin);
    });
    this.entries.clear();
    this.currentProgress = 0;
  }

  private updateObjectPosition(
    object: THREE.Object3D,
    data: ExplodeComponentData,
    progress: number
  ): void {
    const [ox, oy, oz] = data.origin;
    const [dx, dy, dz] = data.explodeDirection;
    const dist = data.explodeDistance * progress;

    object.position.set(ox + dx * dist, oy + dy * dist, oz + dz * dist);
  }
}
