// Benchmark configuration. Defaults are local and free: Ollama for both the
// target and the judge, and the identity optimizer until M4 lands.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ModelConfig } from './models.ts';
import type { OptimizerConfig } from './optimizer.ts';
import type { Category, Lang, PromptStyle } from './types.ts';

export interface EvalConfig {
  /** Paths are resolved relative to the config file. */
  dataset: string;
  outDir: string;
  /** The fixed model that answers both the original and the optimized prompt. */
  target: ModelConfig;
  /** Should be stronger than the target; it never sees which answer came from which prompt. */
  judge: ModelConfig;
  optimizer: OptimizerConfig;
  generation: { temperature: number; maxTokens: number; seed?: number };
  judging: { maxTokens: number; retries: number; seed?: number };
  lengthControl: {
    /** Pairs whose answer lengths differ by at most this factor count as length-matched. */
    matchedRatio: number;
  };
  bootstrap: { resamples: number; seed: number; confidence: number };
  concurrency: number;
  filter?: {
    categories?: Category[];
    langs?: Lang[];
    styles?: PromptStyle[];
    ids?: string[];
    limit?: number;
  };
}

export const DEFAULT_CONFIG: EvalConfig = {
  dataset: 'data/prompts.jsonl',
  outDir: 'results',
  target: { provider: 'ollama', model: 'qwen2.5:1.5b-instruct' },
  judge: { provider: 'ollama', model: 'qwen2.5:7b-instruct' },
  optimizer: { kind: 'identity' },
  generation: { temperature: 0, maxTokens: 768, seed: 42 },
  judging: { maxTokens: 256, retries: 1, seed: 42 },
  lengthControl: { matchedRatio: 1.25 },
  bootstrap: { resamples: 10_000, seed: 1, confidence: 0.95 },
  concurrency: 1,
};

export interface LoadedConfig {
  config: EvalConfig;
  /** Directory relative paths in the config resolve against. */
  baseDir: string;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Shallow-per-section merge: a section in the file replaces keys of the default section. */
export function mergeConfig(base: EvalConfig, override: Record<string, unknown>): EvalConfig {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (k.startsWith('$') || k.startsWith('//')) continue;
    const cur = out[k];
    // Model and optimizer sections are replaced wholesale so a provider switch
    // does not inherit stale fields (e.g. baseUrl) from the default.
    const replace = k === 'target' || k === 'judge' || k === 'optimizer';
    out[k] = !replace && isPlainObject(cur) && isPlainObject(v) ? { ...cur, ...v } : v;
  }
  return out as unknown as EvalConfig;
}

export function loadConfig(file: string | undefined, packageDir: string): LoadedConfig {
  if (!file) return { config: DEFAULT_CONFIG, baseDir: packageDir };
  const abs = path.resolve(file);
  const parsed = JSON.parse(readFileSync(abs, 'utf8')) as unknown;
  if (!isPlainObject(parsed)) throw new Error(`${abs}: config must be a JSON object`);
  return { config: mergeConfig(DEFAULT_CONFIG, parsed), baseDir: path.dirname(abs) };
}
