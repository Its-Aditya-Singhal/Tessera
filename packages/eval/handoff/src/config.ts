// Benchmark configuration: which models to use, which conditions to run, and options.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ModelSpec } from './models.ts';
import { ALL_CONDITIONS, type ConditionId } from './types.ts';

export interface HandoffConfig {
  /** Answers the follow-up questions in every condition. */
  target: ModelSpec;
  /** Writes the plain-summary baseline. Defaults to the target model. */
  summarizer?: ModelSpec;
  /** Optional: rescues paraphrased fact/decision answers. Strict scores are always reported too. */
  judge?: ModelSpec | null;
  conditions: ConditionId[];
  capsule: {
    /** Module exporting a CapsuleBuilder, relative to the config file. null until M7 lands. */
    module: string | null;
    lastTurns: number;
  };
  summary: { maxWords: number; chunkTokens: number };
  dataset: string;
  outDir: string;
  bootstrap: { iterations: number; seed: number };
  /** Directory of the config file; relative paths resolve against it. */
  baseDir: string;
}

const DEFAULTS: Omit<HandoffConfig, 'target' | 'baseDir'> = {
  conditions: [...ALL_CONDITIONS],
  capsule: { module: null, lastTurns: 4 },
  summary: { maxWords: 200, chunkTokens: 3000 },
  dataset: 'data/conversations.json',
  outDir: 'results',
  bootstrap: { iterations: 1000, seed: 1 },
};

export function parseConfig(raw: unknown, baseDir: string): HandoffConfig {
  if (!raw || typeof raw !== 'object') throw new Error('config must be a JSON object');
  const c = raw as Partial<HandoffConfig>;
  if (!c.target || typeof c.target !== 'object' || !('provider' in c.target))
    throw new Error('config.target must name a provider');
  const conditions = c.conditions ?? DEFAULTS.conditions;
  for (const x of conditions)
    if (!ALL_CONDITIONS.includes(x)) throw new Error(`unknown condition "${x}"`);
  return {
    ...DEFAULTS,
    ...c,
    target: c.target,
    conditions,
    capsule: { ...DEFAULTS.capsule, ...c.capsule },
    summary: { ...DEFAULTS.summary, ...c.summary },
    bootstrap: { ...DEFAULTS.bootstrap, ...c.bootstrap },
    baseDir,
  };
}

export function loadConfig(path: string): HandoffConfig {
  const abs = resolve(path);
  return parseConfig(JSON.parse(readFileSync(abs, 'utf8')), dirname(abs));
}
