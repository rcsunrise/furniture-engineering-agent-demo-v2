import * as THREE from "three";
import { Command } from "./Command.js";
import type { Engineering3DEditor } from "../Engineering3DEditor.js";

export class RenameObjectCommand extends Command {
  private object: THREE.Object3D;
  private newName: string;
  private oldName: string;

  constructor(editor: Engineering3DEditor, object: THREE.Object3D, newName: string) {
    super(editor, `Rename ${object.name || "Object"} to ${newName}`);
    this.object = object;
    this.newName = newName;
    this.oldName = object.name;
  }

  public execute(): void {
    this.object.name = this.newName;
    this.editor.signals.sceneGraphChanged.dispatch();
    this.editor.signals.objectChanged.dispatch(this.object);
  }

  public undo(): void {
    this.object.name = this.oldName;
    this.editor.signals.sceneGraphChanged.dispatch();
    this.editor.signals.objectChanged.dispatch(this.object);
  }

  public toJSON(): Record<string, any> {
    return {
      type: this.type,
      id: this.id,
      name: this.name,
      objectUuid: this.object.uuid,
      oldName: this.oldName,
      newName: this.newName,
    };
  }

  public fromJSON(json: Record<string, any>): void {
    this.oldName = json.oldName;
    this.newName = json.newName;
  }
}
