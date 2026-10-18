import * as THREE from "three";
import { Command } from "./Command.js";
import type { Engineering3DEditor } from "../Engineering3DEditor.js";

export class SetPositionCommand extends Command {
  private object: THREE.Object3D;
  private newPosition: THREE.Vector3;
  private oldPosition: THREE.Vector3;

  constructor(
    editor: Engineering3DEditor,
    object: THREE.Object3D,
    newPosition: THREE.Vector3,
    optionalOldPosition?: THREE.Vector3
  ) {
    super(editor, `Set Position: ${object.name || "Object"}`);
    this.updatable = true;
    this.object = object;
    this.newPosition = newPosition.clone();
    this.oldPosition = optionalOldPosition ? optionalOldPosition.clone() : object.position.clone();
  }

  public execute(): void {
    this.object.position.copy(this.newPosition);
    this.object.updateMatrixWorld(true);
    this.editor.signals.objectChanged.dispatch(this.object);
  }

  public undo(): void {
    this.object.position.copy(this.oldPosition);
    this.object.updateMatrixWorld(true);
    this.editor.signals.objectChanged.dispatch(this.object);
  }

  public update(cmd: SetPositionCommand): void {
    this.newPosition.copy(cmd.newPosition);
  }

  public toJSON(): Record<string, any> {
    return {
      type: this.type,
      id: this.id,
      name: this.name,
      objectUuid: this.object.uuid,
      oldPosition: this.oldPosition.toArray(),
      newPosition: this.newPosition.toArray(),
    };
  }

  public fromJSON(json: Record<string, any>): void {
    this.oldPosition.fromArray(json.oldPosition);
    this.newPosition.fromArray(json.newPosition);
  }
}
