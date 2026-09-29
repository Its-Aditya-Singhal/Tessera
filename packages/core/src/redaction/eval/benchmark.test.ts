import { describe, expect, it } from 'vitest';
import { luhnValid, verhoeffValid } from '../checksums';
import { evaluate } from './evaluate';
import { buildDataset, DEFAULT_SEED } from './synthetic';

// Floors, not targets: they catch regressions. Current numbers live in docs/benchmarks/redaction.md.
const FLOORS: Record<string, { precision: number; recall: number }> = {
  AADHAAR: { precision: 0.95, recall: 0.7 }, // unseparated, context-free numbers are skipped on purpose
  SECRET: { precision: 0.9, recall: 0.75 }, // free-standing pure hex is skipped on purpose
};
const DEFAULT_FLOOR = { precision: 0.95, recall: 0.95 };

describe('synthetic redaction benchmark', () => {
  const dataset = buildDataset({ seed: DEFAULT_SEED });

  it('is deterministic for a seed', () => {
    expect(buildDataset({ seed: DEFAULT_SEED })).toEqual(dataset);
    expect(buildDataset({ seed: 1 })).not.toEqual(dataset);
  });

  it('has labels that point at the value they claim', () => {
    for (const s of dataset) {
      for (const l of s.labels) {
        const v = s.text.slice(l.start, l.end);
        expect(v.length).toBeGreaterThan(0);
        if (l.type === 'CARD') expect(luhnValid(v.replace(/\D/g, ''))).toBe(true);
        if (l.type === 'AADHAAR') expect(verhoeffValid(v.replace(/\D/g, ''))).toBe(true);
        if (l.type === 'EMAIL') expect(v).toMatch(/@(?:[a-z.]+\.)?example\.[a-z.]+$/);
      }
    }
  });

  it.each([DEFAULT_SEED, 7])('meets per-category floors (seed %i)', (seed) => {
    const report = evaluate(buildDataset({ seed }));
    for (const c of report.categories) {
      const floor = FLOORS[c.type] ?? DEFAULT_FLOOR;
      expect.soft(c.precision ?? 1, `${c.type} precision`).toBeGreaterThanOrEqual(floor.precision);
      expect.soft(c.recall ?? 1, `${c.type} recall`).toBeGreaterThanOrEqual(floor.recall);
    }
    expect(report.negativeSamplesFlagged / report.negatives).toBeLessThan(0.01);
  });
});
