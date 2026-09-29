// Adapts Tessera's real optimizer (packages/core) to the benchmark's
// PromptOptimizer contract, with any ModelClient standing in for the on-device model.

import { loadCore } from './core.ts';
import type { ModelClient, OptimizeResult, PromptOptimizer } from './types.ts';

export interface TesseraOptimizerOptions {
  /** Only run the rules gate; never rewrite. Measures what the gate alone decides. */
  gateOnly?: boolean;
}

export async function tesseraOptimizer(
  model: ModelClient | undefined,
  options: TesseraOptimizerOptions = {},
): Promise<PromptOptimizer> {
  const core = await loadCore();
  const id = options.gateOnly
    ? `tessera-gate-${core.OPTIMIZER_TEMPLATE_VERSION}`
    : `tessera-${core.OPTIMIZER_TEMPLATE_VERSION}@${model?.id ?? 'rules'}`;
  return {
    id,
    async optimize(prompt: string): Promise<OptimizeResult> {
      if (options.gateOnly || !model) {
        const gate = core.gatePrompt(prompt);
        return { verdict: gate.verdict, optimized: prompt, questions: gate.questions };
      }
      const outcome = await core.optimizePrompt(prompt, {
        generate: async (req) => {
          const res = await model.generate({
            messages: [
              ...(req.system ? [{ role: 'system' as const, content: req.system }] : []),
              { role: 'user' as const, content: req.prompt },
            ],
            temperature: req.temperature ?? 0.2,
            maxTokens: req.maxTokens ?? 800,
            seed: 7,
            json: true,
          });
          return res.text;
        },
      });
      try {
        if (outcome.verdict !== 'improve' || !outcome.optimizedRedacted)
          return { verdict: outcome.verdict, optimized: prompt, questions: outcome.questions };
        // The benchmark target sees the real values, as the user's chatbot would if they unchecked them.
        return {
          verdict: 'improve',
          optimized: outcome.session.restore(outcome.optimizedRedacted),
        };
      } finally {
        outcome.session.clear();
      }
    },
  };
}
