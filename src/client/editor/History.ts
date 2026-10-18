import type { Command } from "./commands/Command.js";
import type { Engineering3DEditor } from "./Engineering3DEditor.js";

export class History {
  public undos: Command[] = [];
  public redos: Command[] = [];
  public maxHistory: number = 60;
  private editor: Engineering3DEditor;

  constructor(editor: Engineering3DEditor, maxHistory: number = 60) {
    this.editor = editor;
    this.maxHistory = maxHistory;
  }

  public execute(command: Command): void {
    // Check if the last command is updatable and of same type & object (e.g. rapid drag)
    const lastCmd = this.undos[this.undos.length - 1];
    if (
      command.updatable &&
      lastCmd &&
      lastCmd.updatable &&
      lastCmd.constructor === command.constructor &&
      (lastCmd as any).object === (command as any).object
    ) {
      (lastCmd as any).update(command);
      command.execute();
      this.editor.signals.historyChanged.dispatch();
      return;
    }

    command.execute();
    this.undos.push(command);
    if (this.undos.length > this.maxHistory) {
      this.undos.shift();
    }
    this.redos = [];
    this.editor.signals.historyChanged.dispatch();
  }

  public undo(): boolean {
    if (this.undos.length === 0) return false;
    const command = this.undos.pop()!;
    command.undo();
    this.redos.push(command);
    this.editor.signals.historyChanged.dispatch();
    return true;
  }

  public redo(): boolean {
    if (this.redos.length === 0) return false;
    const command = this.redos.pop()!;
    command.execute();
    this.undos.push(command);
    this.editor.signals.historyChanged.dispatch();
    return true;
  }

  public canUndo(): boolean {
    return this.undos.length > 0;
  }

  public canRedo(): boolean {
    return this.redos.length > 0;
  }

  public getLastCommandName(): string | null {
    if (this.undos.length === 0) return null;
    return this.undos[this.undos.length - 1].name;
  }

  public clear(): void {
    this.undos = [];
    this.redos = [];
    this.editor.signals.historyChanged.dispatch();
  }
}
