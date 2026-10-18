import * as THREE from "three";
import type { TransformMode, TransformSpace, SnapSettings } from "../utils/3d/transformController.js";
import type { ProjectionMode } from "../utils/3d/cameraController.js";
import type { WorkspaceViewMode } from "../utils/3d/viewModeManager.js";

export type SignalListener<T = void> = (value: T) => void;

export class Signal<T = void> {
  private listeners: SignalListener<T>[] = [];

  public add(listener: SignalListener<T>): () => void {
    this.listeners.push(listener);
    return () => {
      this.remove(listener);
    };
  }

  public remove(listener: SignalListener<T>): void {
    const idx = this.listeners.indexOf(listener);
    if (idx !== -1) {
      this.listeners.splice(idx, 1);
    }
  }

  public dispatch(value: T): void {
    const copy = [...this.listeners];
    for (const listener of copy) {
      try {
        listener(value);
      } catch (err) {
        console.error("Signal listener execution error:", err);
      }
    }
  }

  public removeAll(): void {
    this.listeners = [];
  }
}

export class EditorSignals {
  public readonly editorCleared = new Signal<void>();
  public readonly sceneGraphChanged = new Signal<void>();
  public readonly objectSelected = new Signal<THREE.Object3D | null>();
  public readonly objectFocused = new Signal<THREE.Object3D>();
  public readonly objectAdded = new Signal<THREE.Object3D>();
  public readonly objectChanged = new Signal<THREE.Object3D>();
  public readonly objectRemoved = new Signal<THREE.Object3D>();

  public readonly transformModeChanged = new Signal<TransformMode>();
  public readonly transformSpaceChanged = new Signal<TransformSpace>();
  public readonly snapChanged = new Signal<SnapSettings>();

  public readonly viewModeChanged = new Signal<WorkspaceViewMode>();
  public readonly projectionModeChanged = new Signal<ProjectionMode>();
  public readonly cameraChanged = new Signal<THREE.Camera>();

  public readonly historyChanged = new Signal<void>();
  public readonly engineeringDataChanged = new Signal<void>();
  public readonly explodeChanged = new Signal<number>();
  public readonly selectionHelperChanged = new Signal<void>();
  public readonly rulerVisibilityChanged = new Signal<boolean>();
  public readonly sidebarTabChanged = new Signal<string>();

  public dispose(): void {
    this.editorCleared.removeAll();
    this.sceneGraphChanged.removeAll();
    this.objectSelected.removeAll();
    this.objectFocused.removeAll();
    this.objectAdded.removeAll();
    this.objectChanged.removeAll();
    this.objectRemoved.removeAll();
    this.transformModeChanged.removeAll();
    this.transformSpaceChanged.removeAll();
    this.snapChanged.removeAll();
    this.viewModeChanged.removeAll();
    this.projectionModeChanged.removeAll();
    this.cameraChanged.removeAll();
    this.historyChanged.removeAll();
    this.engineeringDataChanged.removeAll();
    this.explodeChanged.removeAll();
    this.selectionHelperChanged.removeAll();
    this.rulerVisibilityChanged.removeAll();
    this.sidebarTabChanged.removeAll();
  }
}
