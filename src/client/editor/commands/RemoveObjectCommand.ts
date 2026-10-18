import * as THREE from "three";
import { Command } from "./Command.js";
import type { Engineering3DEditor } from "../Engineering3DEditor.js";

export class RemoveObjectCommand extends Command {
  private object: THREE.Object3D;
  private parent?: THREE.Object3D;
  private index?: number;

  constructor(editor: Engineering3DEditor, object: THREE.Object3D) {
    super(editor, `Remove ${object.name || "Object"}`);
    this.object = object;
    this.parent = object.parent || undefined;
    if (this.parent) {
      this.index = this.parent.children.indexOf(object);
    }
  }

  public execute(): void {
    if (this.editor.selected === this.object) {
      this.editor.deselect();
    }
    this.editor.unregisterObject(this.object);
    if (this.parent) {
      this.parent.remove(this.object);
    } else if (this.object.parent) {
      this.object.parent.remove(this.object);
    }
    this.editor.signals.objectRemoved.dispatch(this.object);
    this.editor.signals.sceneGraphChanged.dispatch();
  }

  public undo(): void {
    const targetParent = this.parent || this.editor.scene;
    if (this.index !== undefined && this.index >= 0 && this.index <= targetParent.children.length) {
      targetParent.children.splice(this.index, 0, this.object);
      this.object.parent = targetParent;
    } else {
      targetParent.add(this.object);
    }

    this.editor.registerObject(this.object);
    this.editor.select(this.object);
    this.editor.signals.objectAdded.dispatch(this.object);
    this.editor.signals.sceneGraphChanged.dispatch();
  }

  public toJSON(): Record<string, any> {
    return {
      type: this.type,
      id: this.id,
      name: this.name,
      objectUuid: this.object.uuid,
      parentUuid: this.parent?.uuid,
      index: this.index,
    };
  }

  public fromJSON(json: Record<string, any>): void {
    this.index = json.index;
  }
}
