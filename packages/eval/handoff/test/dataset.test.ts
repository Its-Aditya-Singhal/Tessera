import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateDataset, serializeDataset } from '../src/dataset/generate.ts';
import { renderTranscript } from '../src/render.ts';
import { contextCarries, mentionsPhrase } from '../src/scoring.ts';
import type { Dataset } from '../src/types.ts';

const committed = readFileSync(new URL('../data/conversations.json', import.meta.url), 'utf8');
const ds = JSON.parse(committed) as Dataset;

describe('dataset', () => {
  it('matches the generator output (run `pnpm --filter @tessera/eval-handoff dataset` after changing templates)', () => {
    expect(serializeDataset(generateDataset())).toBe(committed);
  });

  it('has 30-50 conversations with unique ids', () => {
    expect(ds.conversations.length).toBeGreaterThanOrEqual(30);
    expect(ds.conversations.length).toBeLessThanOrEqual(50);
    expect(new Set(ds.conversations.map((c) => c.id)).size).toBe(ds.conversations.length);
    const qids = ds.conversations.flatMap((c) => c.questions.map((q) => q.id));
    expect(new Set(qids).size).toBe(qids.length);
  });

  it('plants facts, decisions and code in every conversation', () => {
    for (const c of ds.conversations) {
      const kinds = new Set(c.questions.map((q) => q.kind));
      expect([...kinds].sort(), c.id).toEqual(['code', 'decision', 'fact']);
    }
  });

  it('includes superseded decisions and answers from every part of the conversation', () => {
    const qs = ds.conversations.flatMap((c) => c.questions);
    expect(qs.filter((q) => q.stale).length).toBeGreaterThanOrEqual(ds.conversations.length);
    for (const p of ['early', 'middle', 'late'])
      expect(qs.filter((q) => q.position === p).length).toBeGreaterThan(40);
  });

  it('every answer is present in the full transcript, and at the recorded message', () => {
    for (const c of ds.conversations) {
      const transcript = renderTranscript(c.messages);
      for (const q of c.questions) {
        expect(contextCarries(transcript, q), q.id).toBe(true);
        const planted = c.messages
          .slice(q.plantedAt, q.plantedAt + 2)
          .map((m) => m.text)
          .join('\n');
        expect(contextCarries(planted, q), `${q.id} at ${q.plantedAt}`).toBe(true);
      }
    }
  });

  it('mentions a revised decision after the original choice', () => {
    for (const c of ds.conversations) {
      for (const q of c.questions.filter((x) => x.stale)) {
        const first = c.messages.findIndex((m) => mentionsPhrase(m.text, q.stale ?? ''));
        expect(first, q.id).toBeGreaterThanOrEqual(0);
        expect(first, q.id).toBeLessThan(q.plantedAt);
      }
    }
  });

  it('never leaks the answer into the question', () => {
    for (const q of ds.conversations.flatMap((c) => c.questions)) {
      if (q.kind === 'code') expect(q.question).not.toContain(q.code?.code.split('\n')[1] ?? '');
      else
        for (const a of q.accept)
          expect(contextCarries(q.question, { ...q, accept: [a] }), q.id).toBe(false);
    }
  });

  it('extracts code blocks into the adapter Message shape', () => {
    const withCode = ds.conversations
      .flatMap((c) => c.messages)
      .filter((m) => m.text.includes('```'));
    expect(withCode.length).toBeGreaterThan(0);
    for (const m of withCode) expect(m.codeBlocks.length).toBeGreaterThan(0);
  });
});
