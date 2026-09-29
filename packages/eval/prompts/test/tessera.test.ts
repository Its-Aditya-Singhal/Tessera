import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCore } from '../src/core.ts';
import { loadDataset } from '../src/dataset.ts';
import { countVerdicts, headline } from '../src/gate-report.ts';
import type { GenerateRequest, ModelClient } from '../src/types.ts';
import { tesseraOptimizer } from '../src/tessera.ts';

const { items } = loadDataset(path.resolve(__dirname, '../data/prompts.jsonl'));

describe('prompt gate on the dataset', () => {
  // Regression guard for docs/benchmarks/gate.md; rerun `pnpm eval:gate` when these move.
  it('flags vague prompts and leaves well-specified ones alone', async () => {
    const core = await loadCore();
    const h = headline(countVerdicts(items, (t) => core.gatePrompt(t)));
    expect(h.vagueFlagged).toBeGreaterThanOrEqual(0.9);
    expect(h.wellLeftAlone).toBeGreaterThanOrEqual(0.95);
  });
});

class ScriptedModel implements ModelClient {
  readonly id = 'scripted';
  seen: GenerateRequest[] = [];
  private readonly answer: string;
  constructor(answer: string) {
    this.answer = answer;
  }
  async generate(req: GenerateRequest) {
    this.seen.push(req);
    return { text: this.answer };
  }
}

describe('tessera optimizer adapter', () => {
  it('sends only the redacted prompt and restores values for the target', async () => {
    const model = new ScriptedModel(
      JSON.stringify({
        verdict: 'improve',
        optimized: 'Write a three-sentence project update for my team and send it to [EMAIL_1].',
        changes: ['added length'],
        questions: [],
      }),
    );
    const opt = await tesseraOptimizer(model);
    const res = await opt.optimize(
      'write something about my project, email me at a.b@example.com',
      {
        lang: 'en',
      },
    );
    expect(JSON.stringify(model.seen)).not.toContain('a.b@example.com');
    expect(res.verdict).toBe('improve');
    expect(res.optimized).toContain('a.b@example.com');
    expect(opt.id).toMatch(/^tessera-v\d+@scripted$/);
  });

  it('gate-only mode never calls a model', async () => {
    const opt = await tesseraOptimizer(undefined, { gateOnly: true });
    const res = await opt.optimize('fix it', { lang: 'en' });
    expect(res.verdict).toBe('ask');
    expect(res.optimized).toBe('fix it');
  });
});
