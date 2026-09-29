import { describe, expect, it } from 'vitest';
import { lengthControlledNet, pearson, seededRandom, summarizeOutcomes } from '../src/stats.ts';
import type { Outcome } from '../src/types.ts';

describe('summarizeOutcomes', () => {
  it('counts and gives degenerate CIs when every item agrees', () => {
    const s = summarizeOutcomes(['win', 'win', 'win'], { resamples: 500 });
    expect(s).toMatchObject({ n: 3, wins: 3, ties: 0, losses: 0 });
    expect(s.winRate).toEqual({ point: 1, lo: 1, hi: 1 });
    expect(s.net.point).toBe(1);
  });

  it('brackets the point estimate and is reproducible for a seed', () => {
    const outcomes: Outcome[] = [
      ...Array(30).fill('win'),
      ...Array(50).fill('tie'),
      ...Array(20).fill('loss'),
    ];
    const a = summarizeOutcomes(outcomes, { resamples: 2000, seed: 7 });
    const b = summarizeOutcomes(outcomes, { resamples: 2000, seed: 7 });
    expect(a).toEqual(b);
    expect(a.winRate.point).toBeCloseTo(0.3);
    expect(a.winRate.lo).toBeLessThan(0.3);
    expect(a.winRate.hi).toBeGreaterThan(0.3);
    // Rough normal-approximation check on the CI width for p=0.3, n=100.
    expect(a.winRate.hi - a.winRate.lo).toBeGreaterThan(0.12);
    expect(a.winRate.hi - a.winRate.lo).toBeLessThan(0.24);
    expect(a.net.point).toBeCloseTo(0.1);
  });

  it('returns NaN intervals for an empty group', () => {
    const s = summarizeOutcomes([]);
    expect(s.n).toBe(0);
    expect(Number.isNaN(s.winRate.point)).toBe(true);
  });
});

describe('lengthControlledNet', () => {
  it('removes a pure length effect', () => {
    // The judge prefers whichever answer is longer, and quality is otherwise equal:
    // score = 0.8 * logRatio. The intercept (equal-length preference) should be ~0.
    const rand = seededRandom(3);
    const x = Array.from({ length: 200 }, () => rand() * 2 - 0.5);
    const y = x.map((v) => Math.max(-1, Math.min(1, 0.8 * v)));
    const lc = lengthControlledNet(x, y, { resamples: 1000 });
    expect(Math.abs(lc.point)).toBeLessThan(0.05);
    expect(lc.slope).toBeGreaterThan(0.5);
    // ...while the raw mean looks like a win because optimized answers are longer on average.
    expect(y.reduce((s, v) => s + v, 0) / y.length).toBeGreaterThan(0.1);
  });

  it('keeps a genuine quality effect', () => {
    const x = Array.from({ length: 50 }, (_, i) => (i % 5) * 0.1 - 0.2);
    const y = x.map(() => 0.5);
    const lc = lengthControlledNet(x, y, { resamples: 500 });
    expect(lc.point).toBeCloseTo(0.5);
    expect(lc.lo).toBeCloseTo(0.5);
  });
});

describe('pearson', () => {
  it('is 1 for a perfect linear relation and NaN without variance', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(Number.isNaN(pearson([1, 1, 1], [1, 2, 3]))).toBe(true);
  });
});
