import { Command } from "./Command.js";
import type { Engineering3DEditor } from "../Engineering3DEditor.js";

export class ExplodeCommand extends Command {
  private targetProgress: number;
  private prevProgress: number;

  constructor(editor: Engineering3DEditor, targetProgress: number, prevProgress: number) {
    super(editor, `Explode Scene to ${Math.round(targetProgress)}%`);
    this.targetProgress = targetProgress;
    this.prevProgress = prevProgress;
  }

  public execute(): void {
    this.editor.setExplode(this.targetProgress, false);
  }

  public undo(): void {
    this.editor.setExplode(this.prevProgress, false);
  }

  public toJSON(): Record<string, any> {
    return {
      type: this.type,
      id: this.id,
      name: this.name,
      targetProgress: this.targetProgress,
      prevProgress: this.prevProgress,
    };
  }

  public fromJSON(json: Record<string, any>): void {
    this.targetProgress = json.targetProgress;
    this.prevProgress = json.prevProgress;
  }
}
