import { describe, expect, it } from 'vitest';
import { buildJudgeUser, combine, judgePair, parseVote } from '../src/judge.ts';
import { FakeClient } from '../src/models.ts';
import type { GenerateRequest, ModelClient } from '../src/types.ts';

describe('parseVote', () => {
  it.each([
    ['{"reason": "x", "winner": "A"}', 'A'],
    ['Sure! ```json\n{"winner": "b", "reason": "shorter"}\n```', 'B'],
    ['{"winner": "Answer A"}', 'A'],
    ['winner: tie', 'tie'],
    ['[[B]]', 'B'],
    ['I think both are fine.', null],
  ])('%s -> %s', (text, expected) => {
    expect(parseVote(text)).toBe(expected);
  });
});

describe('combine', () => {
  const call = (vote: 'A' | 'B' | 'tie' | null) => ({ vote, raw: '', attempts: 1 });

  it('counts a consistent preference for the optimized answer as a win', () => {
    // forward: optimized is B; swapped: optimized is A.
    expect(combine(call('B'), call('A'))).toMatchObject({
      score: 2,
      outcome: 'win',
      consistent: true,
    });
  });
  it('cancels position bias to a tie', () => {
    expect(combine(call('A'), call('A'))).toMatchObject({
      score: 0,
      outcome: 'tie',
      consistent: false,
    });
  });
  it('lets one decisive vote beat a tie', () => {
    expect(combine(call('A'), call('tie'))).toMatchObject({
      score: -1,
      outcome: 'loss',
      consistent: false,
    });
  });
  it('treats unparseable votes as abstentions', () => {
    expect(combine(call(null), call('A'))).toMatchObject({
      score: 1,
      outcome: 'win',
      parseFailures: 1,
    });
  });
});

describe('judgePair', () => {
  it('asks twice with the answers swapped', async () => {
    const seen: string[] = [];
    const judge: ModelClient = {
      id: 'spy',
      async generate(req: GenerateRequest) {
        seen.push(req.messages[1]!.content);
        return { text: '{"winner": "tie"}' };
      },
    };
    await judgePair(judge, 'Q', 'orig answer', 'opt answer', { maxTokens: 64 });
    expect(seen).toEqual([
      buildJudgeUser('Q', 'orig answer', 'opt answer'),
      buildJudgeUser('Q', 'opt answer', 'orig answer'),
    ]);
  });

  it('a maximally position-biased judge produces ties, not wins', async () => {
    const r = await judgePair(new FakeClient('always-A'), 'Q', 'x', 'y', { maxTokens: 64 });
    expect(r.outcome).toBe('tie');
    expect(r.consistent).toBe(false);
  });

  it('retries once on an unparseable vote', async () => {
    let n = 0;
    const judge: ModelClient = {
      id: 'flaky',
      async generate() {
        n++;
        return { text: n % 2 === 1 ? 'hmm' : '{"winner": "B"}' };
      },
    };
    const r = await judgePair(judge, 'Q', 'x', 'y', { maxTokens: 64, retries: 1 });
    expect(r.forward).toMatchObject({ vote: 'B', attempts: 2 });
    expect(r.swapped).toMatchObject({ vote: 'B', attempts: 2 });
    // Always "B" is pure position bias, so it nets out to a tie.
    expect(r.outcome).toBe('tie');
  });
});
