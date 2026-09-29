import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type EvalConfig } from '../src/config.ts';
import { FakeClient } from '../src/models.ts';
import { fakeSuffixOptimizer, identityOptimizer } from '../src/optimizer.ts';
import { renderMarkdown, summarize, type RunMeta } from '../src/report.ts';
import { runBenchmark, selectItems } from '../src/runner.ts';
import type { GenerateRequest, ModelClient, PromptItem, PromptOptimizer } from '../src/types.ts';

const config: EvalConfig = {
  ...DEFAULT_CONFIG,
  bootstrap: { resamples: 500, seed: 1, confidence: 0.95 },
};

const items: PromptItem[] = [
  {
    id: 'r1',
    category: 'reasoning',
    lang: 'en',
    style: 'vague',
    prompt: 'what is 6*7',
    check: { type: 'numeric', answer: 42 },
  },
  {
    id: 'r2',
    category: 'reasoning',
    lang: 'hi',
    style: 'typical',
    prompt: '10 का आधा',
    check: { type: 'numeric', answer: 5 },
  },
  { id: 'w1', category: 'writing', lang: 'en', style: 'well-specified', prompt: 'write a haiku' },
];

const SUFFIX = ' [OPT]';

/** Target whose answers depend on whether the prompt was optimized. */
function scriptedTarget(
  answers: Record<string, { orig: string; opt: string }>,
): ModelClient & { calls: number } {
  return {
    id: 'scripted',
    calls: 0,
    async generate(req: GenerateRequest) {
      this.calls++;
      const p = req.messages.at(-1)!.content;
      const optimized = p.endsWith(SUFFIX);
      const key = optimized ? p.slice(0, -SUFFIX.length) : p;
      const a = answers[key];
      if (!a) throw new Error(`unexpected prompt ${p}`);
      return { text: optimized ? a.opt : a.orig };
    },
  };
}

/** Judge that prefers the answer containing "GOOD", in either slot. */
const qualityJudge: ModelClient = {
  id: 'quality-judge',
  async generate(req: GenerateRequest) {
    const u = req.messages[1]!.content;
    const a = /\[Answer A\]\n([\s\S]*?)\n\[End of answer A\]/.exec(u)![1]!;
    const b = /\[Answer B\]\n([\s\S]*?)\n\[End of answer B\]/.exec(u)![1]!;
    const winner =
      a.includes('GOOD') === b.includes('GOOD') ? 'tie' : a.includes('GOOD') ? 'A' : 'B';
    return { text: JSON.stringify({ reason: 'test', winner }) };
  },
};

describe('runBenchmark', () => {
  it('identity optimizer: nothing is rewritten, nothing is generated, everything is a tie end to end', async () => {
    const target = new FakeClient('echo');
    const judge = new FakeClient('hash-judge');
    const res = await runBenchmark(items, config, {
      target,
      judge,
      optimizer: identityOptimizer,
      cacheFile: null,
    });
    expect(res.every((r) => !r.rewritten && !r.judge)).toBe(true);
    expect(target.calls + judge.calls).toBe(0);
    const s = summarize(res, config);
    expect(s.overall.rewritten).toBe(0);
    expect(s.overall.judgeAllItems).toMatchObject({ n: 3, ties: 3 });
    expect(s.verdicts).toEqual({ ok_as_is: 3 });
  });

  it("scores judge and checks from the optimized prompt's side and lists where it hurt", async () => {
    const target = scriptedTarget({
      'what is 6*7': { orig: 'maybe 41', opt: 'GOOD Answer: 42' },
      '10 का आधा': { orig: 'GOOD उत्तर: 5', opt: 'उत्तर: 4' },
      'write a haiku': { orig: 'leaves fall', opt: 'leaves fall' },
    });
    const res = await runBenchmark(items, config, {
      target,
      judge: qualityJudge,
      optimizer: fakeSuffixOptimizer(SUFFIX),
      cacheFile: null,
    });
    const byId = Object.fromEntries(res.map((r) => [r.id, r]));
    expect(byId.r1).toMatchObject({
      rewritten: true,
      judge: { outcome: 'win', consistent: true },
      check: { outcome: 'win' },
    });
    expect(byId.r2).toMatchObject({ judge: { outcome: 'loss' }, check: { outcome: 'loss' } });
    expect(byId.w1).toMatchObject({ judge: { outcome: 'tie' } });
    expect(byId.w1!.check).toBeUndefined();
    // Original and optimized answers use identical generation settings.
    expect(target.calls).toBe(6);

    const s = summarize(res, config);
    expect(s.overall.judge).toMatchObject({ n: 3, wins: 1, ties: 1, losses: 1 });
    expect(s.overall.checks).toMatchObject({ n: 2, originalPassRate: 0.5, optimizedPassRate: 0.5 });
    expect(s.byLang.map((g) => g.group)).toEqual(['en', 'hi']);
    expect(s.byCategory.find((g) => g.group === 'writing')!.checks.n).toBe(0);
    expect(s.hurt.map((h) => h.id)).toEqual(['r2']);
    expect(s.judgeHealth).toMatchObject({
      comparisons: 3,
      positionConsistency: 1,
      parseFailures: 0,
    });
  });

  it('records per-item errors without aborting the run', async () => {
    const broken: PromptOptimizer = {
      id: 'broken',
      async optimize(p) {
        if (p.includes('haiku')) throw new Error('boom');
        return { verdict: 'ok_as_is', optimized: p };
      },
    };
    const res = await runBenchmark(items, config, {
      target: new FakeClient(),
      judge: new FakeClient('hash-judge'),
      optimizer: broken,
      cacheFile: null,
    });
    expect(res.find((r) => r.id === 'w1')!.error).toBe('boom');
    const s = summarize(res, config);
    expect(s.overall.errors).toBe(1);
    expect(s.verdicts).toEqual({ ok_as_is: 2, error: 1 });
  });

  it('treats an "improve" verdict with unchanged text as not rewritten', async () => {
    const lazy: PromptOptimizer = {
      id: 'lazy',
      optimize: async (p) => ({ verdict: 'improve', optimized: `  ${p}  ` }),
    };
    const res = await runBenchmark(items, config, {
      target: new FakeClient(),
      judge: new FakeClient(),
      optimizer: lazy,
      cacheFile: null,
    });
    expect(res.every((r) => !r.rewritten)).toBe(true);
  });

  describe('cache', () => {
    let dir: string | undefined;
    afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

    it('resumes from disk without calling the models again', async () => {
      dir = mkdtempSync(path.join(tmpdir(), 'tessera-eval-'));
      const cacheFile = path.join(dir, 'cache.jsonl');
      const run = async () => {
        const target = new FakeClient('echo');
        const judge = new FakeClient('hash-judge');
        const res = await runBenchmark(items, config, {
          target,
          judge,
          optimizer: fakeSuffixOptimizer(),
          cacheFile,
        });
        return { res, calls: target.calls + judge.calls };
      };
      const first = await run();
      const second = await run();
      expect(first.calls).toBe(3 * 2 + 3 * 2);
      expect(second.calls).toBe(0);
      expect(second.res).toEqual(first.res);
    });
  });
});

describe('selectItems', () => {
  it('filters by category, lang and limit', () => {
    expect(selectItems(items, { categories: ['reasoning'] }).map((i) => i.id)).toEqual([
      'r1',
      'r2',
    ]);
    expect(selectItems(items, { langs: ['hi'] }).map((i) => i.id)).toEqual(['r2']);
    expect(selectItems(items, { limit: 1 }).map((i) => i.id)).toEqual(['r1']);
  });
});

describe('renderMarkdown', () => {
  it('flags fake runs and prints the hurt table', async () => {
    const res = await runBenchmark(items, config, {
      target: scriptedTarget({
        'what is 6*7': { orig: 'GOOD 42', opt: '41' },
        '10 का आधा': { orig: '5', opt: '5' },
        'write a haiku': { orig: 'a', opt: 'b' },
      }),
      judge: qualityJudge,
      optimizer: fakeSuffixOptimizer(SUFFIX),
      cacheFile: null,
    });
    const meta: RunMeta = {
      runId: 'test',
      startedAt: '',
      finishedAt: '',
      fake: true,
      datasetSha256: '0'.repeat(64),
      targetId: 'scripted',
      judgeId: 'quality-judge',
      optimizerId: 'fake-suffix',
      judgePromptVersion: 'pairwise-v1',
    };
    const md = renderMarkdown(meta, summarize(res, config), config);
    expect(md).toContain('FAKE MODELS');
    expect(md).toContain('| r1 | reasoning | en | vague | loss | loss |');
    expect(md).toContain('### By language');
  });
});
