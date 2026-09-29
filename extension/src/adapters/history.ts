/**
 * Session-only undo stack for imports. Lives in the content script's memory and
 * disappears with the tab, which is the point: nothing about the prompt is persisted.
 */
export class ImportHistory {
  private stack: { before: string; after: string }[] = [];

  record(before: string, after: string): void {
    this.stack.push({ before, after });
    if (this.stack.length > 20) this.stack.shift();
  }

  canUndo(): boolean {
    return this.stack.length > 0;
  }

  /** Returns the text to restore, or undefined when there is nothing to undo. */
  pop(): string | undefined {
    return this.stack.pop()?.before;
  }

  clear(): void {
    this.stack = [];
  }
}
