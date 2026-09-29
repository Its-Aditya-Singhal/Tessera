import { describe, expect, it } from 'vitest';
import { containsTerm, mentionsPhrase, scoreAnswer, scoreCode } from '../src/scoring.ts';
import type { Question } from '../src/types.ts';

const q = (over: Partial<Question>): Question => ({
  id: 'x/y',
  kind: 'fact',
  question: '?',
  accept: [],
  plantedAt: 0,
  position: 'early',
  ...over,
});

describe('containsTerm', () => {
  it('respects word and number boundaries', () => {
    expect(containsTerm('The trial is 13 days.', '13')).toBe(true);
    expect(containsTerm('The trial is 130 days.', '13')).toBe(false);
    expect(containsTerm('port 4139', '413')).toBe(false);
    expect(containsTerm('Prefix: 9HK-000123', '9HK')).toBe(true);
  });

  it('ignores thousands separators and case', () => {
    expect(containsTerm('Budget is ₹48,500 per person', '48500')).toBe(true);
    expect(containsTerm('budget is 48500', '48,500')).toBe(true);
    expect(containsTerm('We use POSTGRESQL', 'PostgreSQL')).toBe(true);
  });

  it('handles values that start or end with punctuation', () => {
    expect(containsTerm('probe hits /harbor/ready now', '/harbor/ready')).toBe(true);
    expect(containsTerm('CPA of $7.40.', '$7.40')).toBe(true);
  });
});

describe('scoreAnswer', () => {
  it('scores facts by any accepted value', () => {
    expect(scoreAnswer('It is 4139.', q({ accept: ['4139'] })).correct).toBe(true);
    expect(scoreAnswer('Probably 3000.', q({ accept: ['4139'] })).correct).toBe(false);
  });

  it('marks stale decisions only when the superseded choice appears without the final one', () => {
    const d = q({
      kind: 'decision',
      accept: ['prorate to the hour'],
      stale: 'charge full price at next cycle',
    });
    expect(scoreAnswer('We prorate to the hour.', d)).toEqual({ correct: true, stale: false });
    expect(scoreAnswer('We charge full price at the next cycle.', d)).toEqual({
      correct: false,
      stale: true,
    });
    expect(
      scoreAnswer('We moved from charging full price at next cycle to prorating by the hour.', d)
        .correct,
    ).toBe(false);
    expect(
      scoreAnswer(
        'We switched from charge full price at next cycle; now we prorate to the hour.',
        d,
      ),
    ).toEqual({ correct: true, stale: false });
  });

  it('tells apart options that differ by one word', () => {
    expect(mentionsPhrase('Go with the new regime.', 'the old regime')).toBe(false);
    expect(mentionsPhrase('Go with the new regime.', 'the new regime')).toBe(true);
  });

  it('does not add a stale flag to decisions that were never revised', () => {
    expect(scoreAnswer('Kustomize', q({ kind: 'decision', accept: ['Kustomize'] }))).toEqual({
      correct: true,
    });
  });
});

describe('scoreCode', () => {
  const code = { language: 'ts', code: 'function f() {\n  return 1;\n}' };
  it('accepts an exact fenced block, ignoring CRLF and trailing spaces', () => {
    expect(scoreCode('Here:\n```ts\nfunction f() {  \r\n  return 1;\n}\n```', code)).toEqual({
      codeExact: true,
      codeLoose: true,
    });
  });
  it('accepts an unlabeled fence closed on the same line as the code', () => {
    expect(scoreCode('```\nfunction f() {\n  return 1;\n}```', code).codeExact).toBe(true);
  });
  it('counts re-indented code as loose but not exact', () => {
    expect(scoreCode('```ts\nfunction f() {\n    return 1;\n}\n```', code)).toEqual({
      codeExact: false,
      codeLoose: true,
    });
  });
  it('rejects changed code', () => {
    expect(scoreCode('```ts\nfunction f() {\n  return 2;\n}\n```', code)).toEqual({
      codeExact: false,
      codeLoose: false,
    });
  });
});
