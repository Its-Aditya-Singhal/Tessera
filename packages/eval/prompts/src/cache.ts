// Append-only JSONL cache so an interrupted run resumes without re-querying
// models. Keyed by a hash of everything that affects the output.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export function cacheKey(parts: unknown): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export class JsonlCache<T> {
  private readonly map = new Map<string, T>();
  private readonly file: string | null;

  constructor(file: string | null) {
    this.file = file;
    if (file && existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const { k, v } = JSON.parse(line) as { k: string; v: T };
          this.map.set(k, v);
        } catch {
          // A torn last line from a killed run; skip it.
        }
      }
    }
  }

  get(key: string): T | undefined {
    return this.map.get(key);
  }

  set(key: string, value: T): void {
    this.map.set(key, value);
    if (this.file) {
      mkdirSync(path.dirname(this.file), { recursive: true });
      appendFileSync(this.file, JSON.stringify({ k: key, v: value }) + '\n');
    }
  }

  async getOrCompute(key: string, compute: () => Promise<T>): Promise<T> {
    const hit = this.map.get(key);
    if (hit !== undefined) return hit;
    const v = await compute();
    this.set(key, v);
    return v;
  }
}
