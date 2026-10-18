import * as THREE from "three";
import { Command } from "./Command.js";
import type { Engineering3DEditor } from "../Engineering3DEditor.js";

export class SplitMeshCommand extends Command {
  private originalObject: THREE.Object3D;
  private newObjects: THREE.Object3D[];
  private parent?: THREE.Object3D;

  constructor(
    editor: Engineering3DEditor,
    originalObject: THREE.Object3D,
    newObjects: THREE.Object3D[]
  ) {
    super(editor, `Split Mesh: ${originalObject.name || "Mesh"}`);
    this.originalObject = originalObject;
    this.newObjects = newObjects;
    this.parent = originalObject.parent || undefined;
  }

  public execute(): void {
    const targetParent = this.parent || this.editor.scene;

    // Remove or hide original object
    this.originalObject.visible = false;
    this.editor.unregisterObject(this.originalObject);
    if (this.parent) {
      this.parent.remove(this.originalObject);
    }

    // Add new objects
    for (const obj of this.newObjects) {
      targetParent.add(obj);
      this.editor.registerObject(obj);
    }

    if (this.newObjects.length > 0) {
      this.editor.select(this.newObjects[0]);
    } else {
      this.editor.deselect();
    }

    this.editor.signals.sceneGraphChanged.dispatch();
  }

  public undo(): void {
    const targetParent = this.parent || this.editor.scene;

    // Remove new objects
    for (const obj of this.newObjects) {
      this.editor.unregisterObject(obj);
      targetParent.remove(obj);
    }

    // Restore original object
    this.originalObject.visible = true;
    targetParent.add(this.originalObject);
    this.editor.registerObject(this.originalObject);
    this.editor.select(this.originalObject);

    this.editor.signals.sceneGraphChanged.dispatch();
  }

  public toJSON(): Record<string, any> {
    return {
      type: this.type,
      id: this.id,
      name: this.name,
      originalUuid: this.originalObject.uuid,
      newUuids: this.newObjects.map((o) => o.uuid),
    };
  }

  public fromJSON(_json: Record<string, any>): void {}
}
