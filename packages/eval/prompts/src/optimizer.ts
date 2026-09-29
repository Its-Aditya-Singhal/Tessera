// Optimizer plumbing. The real optimizer is built in M4 (packages/core); until
// then the harness runs against stubs. To benchmark any optimizer, point
// `optimizer.module` in the config at a file that exports a PromptOptimizer
// (or a factory returning one) - see README.

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import type { OptimizeResult, PromptOptimizer } from './types.ts';

export type OptimizerConfig =
  | { kind: 'identity' }
  | { kind: 'fake-suffix'; suffix?: string }
  | { kind: 'module'; module: string; export?: string; options?: Record<string, unknown> };

/** Says every prompt is fine as is. Useful as a sanity baseline: it must score all ties. */
export const identityOptimizer: PromptOptimizer = {
  id: 'identity',
  async optimize(prompt: string): Promise<OptimizeResult> {
    return { verdict: 'ok_as_is', optimized: prompt };
  },
};

/** Appends a fixed instruction. Only for exercising the pipeline in tests and `--fake` runs. */
export function fakeSuffixOptimizer(
  suffix = '\n\nAnswer precisely and state your final answer clearly.',
): PromptOptimizer {
  return {
    id: 'fake-suffix',
    async optimize(prompt: string): Promise<OptimizeResult> {
      return { verdict: 'improve', optimized: prompt + suffix };
    },
  };
}

function isOptimizer(x: unknown): x is PromptOptimizer {
  return (
    typeof x === 'object' && x !== null && typeof (x as PromptOptimizer).optimize === 'function'
  );
}

export async function loadOptimizer(
  cfg: OptimizerConfig,
  configDir: string,
): Promise<PromptOptimizer> {
  switch (cfg.kind) {
    case 'identity':
      return identityOptimizer;
    case 'fake-suffix':
      return fakeSuffixOptimizer(cfg.suffix);
    case 'module': {
      const file = path.resolve(configDir, cfg.module);
      const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
      const exp = mod[cfg.export ?? 'default'];
      const candidate =
        typeof exp === 'function' ? await (exp as (o?: unknown) => unknown)(cfg.options) : exp;
      if (!isOptimizer(candidate)) {
        throw new Error(
          `${file} export "${cfg.export ?? 'default'}" is not a PromptOptimizer (needs id and optimize())`,
        );
      }
      return candidate;
    }
  }
}

/** Normalizes optimizer output so the runner can rely on its shape. */
export function normalizeResult(original: string, res: OptimizeResult): OptimizeResult {
  const optimized = typeof res.optimized === 'string' ? res.optimized : original;
  if (res.verdict !== 'improve' || optimized.trim() === original.trim()) {
    return {
      verdict: res.verdict === 'improve' ? 'ok_as_is' : res.verdict,
      optimized: original,
      questions: res.questions,
    };
  }
  return { verdict: 'improve', optimized, questions: res.questions };
}
