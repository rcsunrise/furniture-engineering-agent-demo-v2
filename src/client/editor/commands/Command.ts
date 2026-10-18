import type { Engineering3DEditor } from "../Engineering3DEditor.js";

export abstract class Command {
  public readonly id: string;
  public readonly name: string;
  public readonly type: string;
  public readonly timestamp: number;
  public inMemory: boolean = false;
  public updatable: boolean = false;
  protected editor: Engineering3DEditor;

  constructor(editor: Engineering3DEditor, name: string = "") {
    this.id = Math.random().toString(36).substring(2, 9);
    this.editor = editor;
    this.name = name || this.constructor.name;
    this.type = this.constructor.name;
    this.timestamp = Date.now();
  }

  abstract execute(): void;
  abstract undo(): void;
  abstract toJSON(): Record<string, any>;
  abstract fromJSON(json: Record<string, any>): void;
}
