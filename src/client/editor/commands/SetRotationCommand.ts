import * as THREE from "three";
import { Command } from "./Command.js";
import type { Engineering3DEditor } from "../Engineering3DEditor.js";

export class SetRotationCommand extends Command {
  private object: THREE.Object3D;
  private newRotation: THREE.Euler;
  private oldRotation: THREE.Euler;

  constructor(
    editor: Engineering3DEditor,
    object: THREE.Object3D,
    newRotation: THREE.Euler,
    optionalOldRotation?: THREE.Euler
  ) {
    super(editor, `Set Rotation: ${object.name || "Object"}`);
    this.updatable = true;
    this.object = object;
    this.newRotation = newRotation.clone();
    this.oldRotation = optionalOldRotation ? optionalOldRotation.clone() : object.rotation.clone();
  }

  public execute(): void {
    this.object.rotation.copy(this.newRotation);
    this.object.updateMatrixWorld(true);
    this.editor.signals.objectChanged.dispatch(this.object);
  }

  public undo(): void {
    this.object.rotation.copy(this.oldRotation);
    this.object.updateMatrixWorld(true);
    this.editor.signals.objectChanged.dispatch(this.object);
  }

  public update(cmd: SetRotationCommand): void {
    this.newRotation.copy(cmd.newRotation);
  }

  public toJSON(): Record<string, any> {
    return {
      type: this.type,
      id: this.id,
      name: this.name,
      objectUuid: this.object.uuid,
      oldRotation: [this.oldRotation.x, this.oldRotation.y, this.oldRotation.z, this.oldRotation.order],
      newRotation: [this.newRotation.x, this.newRotation.y, this.newRotation.z, this.newRotation.order],
    };
  }

  public fromJSON(json: Record<string, any>): void {
    this.oldRotation.set(json.oldRotation[0], json.oldRotation[1], json.oldRotation[2], json.oldRotation[3]);
    this.newRotation.set(json.newRotation[0], json.newRotation[1], json.newRotation[2], json.newRotation[3]);
  }
}
