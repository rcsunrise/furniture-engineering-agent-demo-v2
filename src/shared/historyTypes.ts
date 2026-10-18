/**
 * Command Pattern for Undo / Redo History System
 * Supports Transform, Visibility, Delete, Rename, Split, Extract, Explode commands.
 */

export interface Command {
  id: string;
  name: string;
  timestamp: number;
  execute(): void;
  undo(): void;
  redo(): void;
}

export class HistoryManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistory: number = 50;
  private listeners: Array<() => void> = [];

  constructor(maxHistory: number = 50) {
    this.maxHistory = maxHistory;
  }

  public execute(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo stack on new command
    this.notify();
  }

  public undo(): boolean {
    if (this.undoStack.length === 0) return false;
    const command = this.undoStack.pop()!;
    command.undo();
    this.redoStack.push(command);
    this.notify();
    return true;
  }

  public redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const command = this.redoStack.pop()!;
    command.redo();
    this.undoStack.push(command);
    this.notify();
    return true;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public getUndoStack(): ReadonlyArray<Command> {
    return this.undoStack;
  }

  public getRedoStack(): ReadonlyArray<Command> {
    return this.redoStack;
  }

  public getLastCommandName(): string | null {
    if (this.undoStack.length === 0) return null;
    return this.undoStack[this.undoStack.length - 1].name;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error("Error in HistoryManager listener:", e);
      }
    }
  }
}
