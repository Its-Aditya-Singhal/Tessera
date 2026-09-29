import { optimizePrompt, type Generate, type OptimizeOutcome } from '@tessera/core';
import type { EngineStatus, GenerateResult } from './engine/host';
import type { Settings } from './settings';

export interface EngineLike {
  status(): Promise<EngineStatus>;
  generate(req: Parameters<Generate>[0]): Promise<GenerateResult>;
}

export interface RunOptions {
  answers?: { question: string; answer: string }[];
  force?: boolean;
}

export interface RunResult {
  outcome: OptimizeOutcome;
  /** Label of the tier that produced the result, e.g. "Rules only" or "Built-in model". */
  tierLabel: string;
}

/**
 * One optimize run from the panel: picks the model tier, redacts, asks the
 * model, and falls back to rule-based hints if the model is missing or fails.
 * Everything stays in this tab's memory.
 */
export async function runOptimize(
  prompt: string,
  settings: Settings,
  engine: EngineLike,
  opts: RunOptions = {},
): Promise<RunResult> {
  const base = {
    englishOutput: settings.englishOutput,
    redaction: { enabled: settings.redaction },
    ...(opts.answers ? { answers: opts.answers } : {}),
    ...(opts.force ? { force: true } : {}),
  };
  let status: EngineStatus | undefined;
  try {
    status = await engine.status();
  } catch {
    status = undefined;
  }
  if (!status || status.tier === 0) {
    return { outcome: await optimizePrompt(prompt, base), tierLabel: 'Rules only' };
  }
  const generate: Generate = async (req) => (await engine.generate(req)).text;
  try {
    return {
      outcome: await optimizePrompt(prompt, { ...base, generate }),
      tierLabel: status.tierLabel,
    };
  } catch (err) {
    const outcome = await optimizePrompt(prompt, base);
    outcome.notes = [
      `The on-device model failed (${err instanceof Error ? err.message : String(err)}), so here are rule-based suggestions.`,
      ...outcome.notes.filter((n) => !n.startsWith('No on-device model')),
    ];
    return { outcome, tierLabel: 'Rules only' };
  }
}
