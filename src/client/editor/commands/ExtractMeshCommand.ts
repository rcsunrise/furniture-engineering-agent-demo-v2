import * as THREE from "three";
import { Command } from "./Command.js";
import type { Engineering3DEditor } from "../Engineering3DEditor.js";

export class ExtractMeshCommand extends Command {
  private originalObject: THREE.Object3D;
  private extractedMesh: THREE.Mesh;
  private remainingMesh?: THREE.Mesh;
  private parent?: THREE.Object3D;

  constructor(
    editor: Engineering3DEditor,
    originalObject: THREE.Object3D,
    extractedMesh: THREE.Mesh,
    remainingMesh?: THREE.Mesh
  ) {
    super(editor, `Extract Mesh: ${originalObject.name || "Mesh"}`);
    this.originalObject = originalObject;
    this.extractedMesh = extractedMesh;
    this.remainingMesh = remainingMesh;
    this.parent = originalObject.parent || undefined;
  }

  public execute(): void {
    const targetParent = this.parent || this.editor.scene;

    if (this.remainingMesh) {
      this.originalObject.visible = false;
      this.editor.unregisterObject(this.originalObject);
      if (this.parent) {
        this.parent.remove(this.originalObject);
      }
      targetParent.add(this.remainingMesh);
      this.editor.registerObject(this.remainingMesh);
    }

    targetParent.add(this.extractedMesh);
    this.editor.registerObject(this.extractedMesh);
    this.editor.select(this.extractedMesh);

    this.editor.signals.sceneGraphChanged.dispatch();
  }

  public undo(): void {
    const targetParent = this.parent || this.editor.scene;

    this.editor.unregisterObject(this.extractedMesh);
    targetParent.remove(this.extractedMesh);

    if (this.remainingMesh) {
      this.editor.unregisterObject(this.remainingMesh);
      targetParent.remove(this.remainingMesh);

      this.originalObject.visible = true;
      targetParent.add(this.originalObject);
      this.editor.registerObject(this.originalObject);
      this.editor.select(this.originalObject);
    }

    this.editor.signals.sceneGraphChanged.dispatch();
  }

  public toJSON(): Record<string, any> {
    return {
      type: this.type,
      id: this.id,
      name: this.name,
      originalUuid: this.originalObject.uuid,
      extractedUuid: this.extractedMesh.uuid,
    };
  }

  public fromJSON(_json: Record<string, any>): void {}
}
