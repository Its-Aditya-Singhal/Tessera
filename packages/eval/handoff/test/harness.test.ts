import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CapsuleBuilder } from '../src/capsule.ts';
import { main } from '../src/cli.ts';
import { buildContext, plainSummary } from '../src/conditions.ts';
import { createModel, withCache } from '../src/models.ts';
import { containsTerm } from '../src/scoring.ts';
import { answerMessages, runHandoffEval, type RunOptions } from '../src/runner.ts';
import type { ChatMessage, ChatModel, Dataset, Question } from '../src/types.ts';

const ds = JSON.parse(
  readFileSync(new URL('../data/conversations.json', import.meta.url), 'utf8'),
) as Dataset;
// Question texts repeat across a domain's variants; tag them so the oracle can look up the answer key.
const convs = ds.conversations.slice(0, 6).map((c) => ({
  ...c,
  questions: c.questions.map((q) => ({ ...q, question: `${q.question} [${c.id}]` })),
}));
const byText = new Map<string, Question>(
  convs.flatMap((c) => c.questions.map((q) => [q.question, q] as const)),
);

/** A fake that answers perfectly when the context holds the answer, and "I don't know" otherwise. */
const oracle: ChatModel = {
  id: 'test:oracle',
  fake: true,
  async chat(messages: ChatMessage[]) {
    const prompt = messages.at(-1)?.content ?? '';
    const question = prompt.slice(prompt.lastIndexOf('Question: ') + 10);
    if (!prompt.includes('<handoff_context>')) return { text: "I don't know." };
    const q = byText.get(question);
    if (q?.kind === 'code' && q.code && prompt.includes(q.code.code))
      return { text: '```\n' + q.code.code + '\n```' };
    const a = q?.accept[0];
    if (q?.kind !== 'code' && a && containsTerm(prompt, a))
      return { text: a, promptTokens: 100, completionTokens: 3 };
    return { text: "I don't know." };
  },
};

const countingSummarizer = (): ChatModel & { calls: number } => {
  const m = {
    id: 'test:summarizer',
    fake: true,
    calls: 0,
    async chat(messages: ChatMessage[]) {
      m.calls++;
      return {
        text: `summary of ${messages.at(-1)?.content.length ?? 0} chars`,
        promptTokens: 50,
        completionTokens: 5,
      };
    },
  };
  return m;
};

const lastTurnsCapsule: CapsuleBuilder = {
  id: 'test:last-turns',
  build: (messages, { lastTurns }) => ({
    text: messages
      .slice(-lastTurns * 2)
      .map((m) => m.text)
      .join('\n'),
  }),
};

const baseOpts = (over: Partial<RunOptions> = {}): RunOptions => ({
  conversations: convs,
  conditions: ['full', 'hybrid', 'summary', 'none'],
  target: oracle,
  deps: {
    summarizer: countingSummarizer(),
    capsule: lastTurnsCapsule,
    capsuleOptions: { lastTurns: 2 },
    summaryOptions: { maxWords: 50, chunkTokens: 3000 },
  },
  bootstrap: { iterations: 200, seed: 3 },
  ...over,
});

describe('conditions', () => {
  const msgs = convs[0]?.messages ?? [];
  it('full transcript keeps every message; no context is empty', async () => {
    const full = await buildContext('full', msgs, baseOpts().deps);
    for (const m of msgs) expect(full.text).toContain(m.text);
    expect(full.generationTokens).toBe(0);
    expect(await buildContext('none', msgs, baseOpts().deps)).toEqual({
      text: null,
      contextTokens: 0,
      generationTokens: 0,
    });
  });

  it('hybrid is unavailable without a capsule builder', async () => {
    const { capsule: _drop, ...deps } = baseOpts().deps;
    await expect(buildContext('hybrid', msgs, deps)).rejects.toThrow(/capsule builder/);
  });

  it('summarises long transcripts in chunks and counts generation tokens', async () => {
    const s = countingSummarizer();
    const res = await plainSummary(s, msgs, { maxWords: 50, chunkTokens: 60 });
    expect(s.calls).toBeGreaterThan(2);
    expect(res.generationTokens).toBe(s.calls * 55);
    const one = countingSummarizer();
    await plainSummary(one, msgs, { maxWords: 50, chunkTokens: 100000 });
    expect(one.calls).toBe(1);
  });
});

describe('runHandoffEval', () => {
  it('separates conditions: full is perfect, no context is zero, last-turns capsule is in between', async () => {
    const out = await runHandoffEval(baseOpts());
    const by = Object.fromEntries(out.summaries.map((s) => [s.condition, s]));
    expect(by.full?.factRetention?.rate).toBe(1);
    expect(by.full?.decisionRetention?.rate).toBe(1);
    expect(by.full?.codeExact?.rate).toBe(1);
    expect(by.full?.contextCoverage?.rate).toBe(1);
    expect(by.none?.factRetention?.rate).toBe(0);
    expect(by.none?.codeExact?.rate).toBe(0);
    const hybrid = by.hybrid?.contextCoverage?.rate ?? -1;
    expect(hybrid).toBeGreaterThan(0);
    expect(hybrid).toBeLessThan(1);
    expect(by.summary?.meanGenerationTokens).toBeGreaterThan(0);
    expect(by.full?.meanPromptTokensReported).toBe(100);
    expect(by.full?.meanCompression).toBeCloseTo(1, 0);
    expect(out.questions).toHaveLength(4 * convs.reduce((n, c) => n + c.questions.length, 0));
  });

  it('reports hybrid as not run, with the reason, when no capsule builder is configured', async () => {
    const { capsule: _drop, ...deps } = baseOpts().deps;
    const out = await runHandoffEval(baseOpts({ deps }));
    const hybrid = out.summaries.find((s) => s.condition === 'hybrid');
    expect(hybrid?.status).toBe('not-run');
    expect(hybrid?.reason).toMatch(/M7/);
    expect(out.questions.some((q) => q.condition === 'hybrid')).toBe(false);
  });

  it('uses the judge only to rescue failed fact and decision answers', async () => {
    let judgeCalls = 0;
    const judge: ChatModel = {
      id: 'j',
      fake: true,
      chat: async () => (judgeCalls++, { text: 'YES' }),
    };
    const out = await runHandoffEval(baseOpts({ conditions: ['none'], judge }));
    const recall = out.questions.filter((q) => q.kind !== 'code');
    expect(judgeCalls).toBe(recall.length);
    expect(out.summaries[0]?.judgedRetention?.rate).toBe(1);
    expect(out.summaries[0]?.factRetention?.rate).toBe(0);
  });

  it('never shows the model the answer key', () => {
    const q = convs[0]?.questions[0];
    const text = answerMessages(null, q?.question ?? '')
      .map((m) => m.content)
      .join('\n');
    for (const a of q?.accept ?? []) expect(text).not.toContain(a);
  });
});

describe('model clients', () => {
  let server: Server;
  let base = '';
  const seen: { url: string; body: Record<string, unknown>; auth?: string }[] = [];
  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        seen.push({
          url: req.url ?? '',
          body: JSON.parse(data) as Record<string, unknown>,
          ...(req.headers.authorization ? { auth: req.headers.authorization } : {}),
        });
        res.setHeader('content-type', 'application/json');
        if (req.url === '/api/chat')
          res.end(
            JSON.stringify({
              message: { content: 'ollama says hi' },
              prompt_eval_count: 12,
              eval_count: 4,
            }),
          );
        else
          res.end(
            JSON.stringify({
              choices: [{ message: { content: 'oai says hi' } }],
              usage: { prompt_tokens: 9, completion_tokens: 2 },
            }),
          );
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  });
  afterAll(() => server.close());

  it('talks to Ollama with temperature 0 and reads token counts', async () => {
    const m = createModel({ provider: 'ollama', model: 'qwen', baseUrl: base });
    expect(await m.chat([{ role: 'user', content: 'hi' }])).toEqual({
      text: 'ollama says hi',
      promptTokens: 12,
      completionTokens: 4,
    });
    expect(seen.at(-1)?.body).toMatchObject({
      model: 'qwen',
      stream: false,
      options: { temperature: 0 },
    });
  });

  it('talks to OpenAI-compatible servers and reads the key from the named env var', async () => {
    process.env.TEST_HANDOFF_KEY = 'k-123';
    const m = createModel({
      provider: 'openai-compatible',
      model: 'm',
      baseUrl: `${base}/v1`,
      apiKeyEnv: 'TEST_HANDOFF_KEY',
    });
    expect(await m.chat([{ role: 'user', content: 'hi' }])).toEqual({
      text: 'oai says hi',
      promptTokens: 9,
      completionTokens: 2,
    });
    expect(seen.at(-1)?.url).toBe('/v1/chat/completions');
    expect(seen.at(-1)?.auth).toBe('Bearer k-123');
    expect(() =>
      createModel({
        provider: 'openai-compatible',
        model: 'm',
        baseUrl: base,
        apiKeyEnv: 'UNSET_VAR_XYZ',
      }),
    ).toThrow(/UNSET_VAR_XYZ/);
  });

  it('caches responses so interrupted runs resume without repeating calls', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'handoff-')), 'cache.jsonl');
    const before = seen.length;
    const a = withCache(createModel({ provider: 'ollama', model: 'qwen', baseUrl: base }), file);
    await a.chat([{ role: 'user', content: 'same' }]);
    await a.chat([{ role: 'user', content: 'same' }]);
    const b = withCache(createModel({ provider: 'ollama', model: 'qwen', baseUrl: base }), file);
    expect((await b.chat([{ role: 'user', content: 'same' }])).text).toBe('ollama says hi');
    expect(seen.length - before).toBe(1);
  });
});

describe('cli', () => {
  it('--fake writes JSON and Markdown clearly marked as a harness test', async () => {
    const out = mkdtempSync(join(tmpdir(), 'handoff-out-'));
    expect(await main(['--fake', '--limit', '3', '--out', out, '--quiet'])).toBe(0);
    const json = JSON.parse(readFileSync(join(out, 'handoff-results.json'), 'utf8')) as {
      meta: { fake: boolean };
      summaries: unknown[];
    };
    expect(json.meta.fake).toBe(true);
    expect(json.summaries).toHaveLength(4);
    expect(readFileSync(join(out, 'handoff-results.md'), 'utf8')).toContain('FAKE MODELS');
  });

  it('runs a real-provider config with hybrid reported as not run until M7 exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'handoff-cfg-'));
    const cfg = join(dir, 'c.json');
    const dataset = join(dir, 'd.json');
    writeFileSync(dataset, JSON.stringify({ ...ds, conversations: ds.conversations.slice(0, 1) }));
    writeFileSync(
      cfg,
      JSON.stringify({
        target: { provider: 'fake', behaviour: 'unknown' },
        dataset: 'd.json',
        outDir: 'out',
      }),
    );
    expect(await main(['--config', cfg, '--quiet', '--no-cache'])).toBe(0);
    const md = readFileSync(join(dir, 'out', 'handoff-results.md'), 'utf8');
    expect(md).toMatch(/Hybrid capsule \| not run: no capsule builder configured/);
  });
});
