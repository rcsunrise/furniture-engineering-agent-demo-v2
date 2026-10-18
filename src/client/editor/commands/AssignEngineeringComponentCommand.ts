import * as THREE from "three";
import { Command } from "./Command.js";
import type { Engineering3DEditor } from "../Engineering3DEditor.js";

export class AssignEngineeringComponentCommand extends Command {
  private object: THREE.Object3D;
  private newComponentId: string | null;
  private prevComponentId: string | null;

  constructor(
    editor: Engineering3DEditor,
    object: THREE.Object3D,
    newComponentId: string | null,
    prevComponentId: string | null
  ) {
    super(
      editor,
      newComponentId
        ? `Assign Engineering Component: ${newComponentId}`
        : `Unbind Engineering Component`
    );
    this.object = object;
    this.newComponentId = newComponentId;
    this.prevComponentId = prevComponentId;
  }

  public execute(): void {
    if (!this.object.userData) this.object.userData = {};
    if (this.newComponentId) {
      this.object.userData.canonicalComponentId = this.newComponentId;
    } else {
      delete this.object.userData.canonicalComponentId;
    }
    this.editor.signals.engineeringDataChanged.dispatch();
    this.editor.signals.objectChanged.dispatch(this.object);
  }

  public undo(): void {
    if (!this.object.userData) this.object.userData = {};
    if (this.prevComponentId) {
      this.object.userData.canonicalComponentId = this.prevComponentId;
    } else {
      delete this.object.userData.canonicalComponentId;
    }
    this.editor.signals.engineeringDataChanged.dispatch();
    this.editor.signals.objectChanged.dispatch(this.object);
  }

  public toJSON(): Record<string, any> {
    return {
      type: this.type,
      id: this.id,
      name: this.name,
      objectUuid: this.object.uuid,
      newComponentId: this.newComponentId,
      prevComponentId: this.prevComponentId,
    };
  }

  public fromJSON(json: Record<string, any>): void {
    this.newComponentId = json.newComponentId;
    this.prevComponentId = json.prevComponentId;
  }
}
