import * as THREE from "three";
import { Command } from "./Command.js";
import type { Engineering3DEditor } from "../Engineering3DEditor.js";

export class SetScaleCommand extends Command {
  private object: THREE.Object3D;
  private newScale: THREE.Vector3;
  private oldScale: THREE.Vector3;

  constructor(
    editor: Engineering3DEditor,
    object: THREE.Object3D,
    newScale: THREE.Vector3,
    optionalOldScale?: THREE.Vector3
  ) {
    super(editor, `Set Scale: ${object.name || "Object"}`);
    this.updatable = true;
    this.object = object;
    this.newScale = newScale.clone();
    this.oldScale = optionalOldScale ? optionalOldScale.clone() : object.scale.clone();
  }

  public execute(): void {
    this.object.scale.copy(this.newScale);
    this.object.updateMatrixWorld(true);
    this.editor.signals.objectChanged.dispatch(this.object);
  }

  public undo(): void {
    this.object.scale.copy(this.oldScale);
    this.object.updateMatrixWorld(true);
    this.editor.signals.objectChanged.dispatch(this.object);
  }

  public update(cmd: SetScaleCommand): void {
    this.newScale.copy(cmd.newScale);
  }

  public toJSON(): Record<string, any> {
    return {
      type: this.type,
      id: this.id,
      name: this.name,
      objectUuid: this.object.uuid,
      oldScale: this.oldScale.toArray(),
      newScale: this.newScale.toArray(),
    };
  }

  public fromJSON(json: Record<string, any>): void {
    this.oldScale.fromArray(json.oldScale);
    this.newScale.fromArray(json.newScale);
  }
}
