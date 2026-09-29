import { describe, expect, it } from 'vitest';
import { wordDiff } from '../../src/optimizer/diff';
import { checkInvariants, isBlocking } from '../../src/optimizer/invariants';
import { parseOptimizerOutput } from '../../src/optimizer/parse';

describe('checkInvariants', () => {
  const original =
    'Compare "fast mode" with plan 42 at https://example.com/a?b=1 for [EMAIL_1]\n```js\nx = 1;\n```';

  it('passes when everything is kept, even reflowed', () => {
    const kept =
      'Please compare "fast mode" against plan 42 (https://example.com/a?b=1) for [EMAIL_1]:\n```js\nx = 1;\n```';
    expect(checkInvariants(original, kept)).toEqual([]);
  });

  it('reports each dropped value with its kind', () => {
    const issues = checkInvariants(original, 'Compare the modes with the plan.');
    expect(issues.map((i) => i.kind).sort()).toEqual([
      'code',
      'number',
      'placeholder',
      'quote',
      'url',
    ]);
    expect(
      issues
        .filter(isBlocking)
        .map((i) => i.kind)
        .sort(),
    ).toEqual(['code', 'placeholder', 'url']);
  });
});

describe('wordDiff', () => {
  it('rebuilds both texts exactly', () => {
    const a = 'Write a poem about rain.';
    const b = 'Write a short poem about spring rain, in 4 lines.';
    const ops = wordDiff(a, b);
    expect(
      ops
        .filter((o) => o.type !== 'insert')
        .map((o) => o.text)
        .join(''),
    ).toBe(a);
    expect(
      ops
        .filter((o) => o.type !== 'delete')
        .map((o) => o.text)
        .join(''),
    ).toBe(b);
    expect(ops.some((o) => o.type === 'insert' && o.text.includes('short'))).toBe(true);
  });

  it('degrades to one replace for huge inputs', () => {
    expect(wordDiff('a b', 'c d', 1)).toEqual([
      { type: 'delete', text: 'a b' },
      { type: 'insert', text: 'c d' },
    ]);
  });
});

describe('parseOptimizerOutput', () => {
  it('reads strict JSON', () => {
    expect(
      parseOptimizerOutput('{"verdict":"improve","optimized":"x","changes":["a"],"questions":[]}'),
    ).toEqual({
      verdict: 'improve',
      optimized: 'x',
      changes: ['a'],
      questions: [],
    });
  });

  it('reads JSON wrapped in prose and fences, with braces inside strings', () => {
    const raw =
      'Sure! ```json\n{"verdict": "Improve", "optimized": "use {x} here", "changes": "not a list"}\n``` Hope that helps';
    expect(parseOptimizerOutput(raw)).toMatchObject({
      verdict: 'improve',
      optimized: 'use {x} here',
      changes: [],
    });
  });

  it('reads the delimiter format', () => {
    const raw =
      'VERDICT: improve\nOPTIMIZED: Explain X to a beginner.\nCHANGES:\n- added audience\n- clarified task';
    expect(parseOptimizerOutput(raw)).toEqual({
      verdict: 'improve',
      optimized: 'Explain X to a beginner.',
      changes: ['added audience', 'clarified task'],
      questions: [],
    });
  });

  it('rejects garbage and an "improve" with no text', () => {
    expect(parseOptimizerOutput('I cannot help with that.')).toBeUndefined();
    expect(parseOptimizerOutput('{"verdict":"improve","optimized":""}')).toBeUndefined();
    expect(parseOptimizerOutput('{"verdict":"maybe"}')).toBeUndefined();
  });
});
