// Percentile bootstrap over conversations (questions within a conversation are not independent).

import { createRng } from './rng.ts';

export interface Proportion {
  hits: number;
  total: number;
  rate: number | null;
  ci95: [number, number] | null;
}

/** `groups` holds one [hits, total] pair per conversation. */
export function bootstrapProportion(
  groups: readonly [number, number][],
  iterations = 1000,
  seed = 1,
): Proportion {
  const hits = groups.reduce((s, g) => s + g[0], 0);
  const total = groups.reduce((s, g) => s + g[1], 0);
  if (total === 0) return { hits, total, rate: null, ci95: null };
  const used = groups.filter((g) => g[1] > 0);
  const r = createRng(seed);
  const rates: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let h = 0;
    let t = 0;
    for (let j = 0; j < used.length; j++) {
      const g = used[r.int(0, used.length - 1)] as [number, number];
      h += g[0];
      t += g[1];
    }
    rates.push(h / t);
  }
  rates.sort((a, b) => a - b);
  const at = (p: number): number =>
    rates[Math.min(rates.length - 1, Math.floor(p * rates.length))] as number;
  return { hits, total, rate: hits / total, ci95: [at(0.025), at(0.975)] };
}

export const mean = (xs: readonly number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
