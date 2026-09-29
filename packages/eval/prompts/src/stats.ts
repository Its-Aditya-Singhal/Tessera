// Win/tie/loss summaries with percentile bootstrap confidence intervals.
// Uses a seeded PRNG so the same results file always yields the same CIs.

import type { Outcome } from './types.ts';

/** mulberry32: small, fast, good enough for resampling. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Interval {
  point: number;
  lo: number;
  hi: number;
}

export interface OutcomeSummary {
  n: number;
  wins: number;
  ties: number;
  losses: number;
  winRate: Interval;
  tieRate: Interval;
  lossRate: Interval;
  /** winRate - lossRate; > 0 means optimizing helped on balance. */
  net: Interval;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (pos - lo);
}

/**
 * Percentile bootstrap over items: resample the per-item outcomes with
 * replacement and read the 2.5/97.5 percentiles of each rate.
 */
export function summarizeOutcomes(
  outcomes: Outcome[],
  opts: { resamples?: number; seed?: number; confidence?: number } = {},
): OutcomeSummary {
  const n = outcomes.length;
  const resamples = opts.resamples ?? 10_000;
  const alpha = (1 - (opts.confidence ?? 0.95)) / 2;
  const code = outcomes.map((o) => (o === 'win' ? 1 : o === 'loss' ? -1 : 0));
  const wins = code.filter((c) => c === 1).length;
  const losses = code.filter((c) => c === -1).length;
  const ties = n - wins - losses;
  const empty: Interval = { point: Number.NaN, lo: Number.NaN, hi: Number.NaN };
  if (n === 0) {
    return { n, wins, ties, losses, winRate: empty, tieRate: empty, lossRate: empty, net: empty };
  }

  const rand = seededRandom(opts.seed ?? 1);
  const w: number[] = new Array(resamples);
  const t: number[] = new Array(resamples);
  const l: number[] = new Array(resamples);
  const d: number[] = new Array(resamples);
  for (let r = 0; r < resamples; r++) {
    let cw = 0;
    let cl = 0;
    for (let i = 0; i < n; i++) {
      const c = code[Math.floor(rand() * n)];
      if (c === 1) cw++;
      else if (c === -1) cl++;
    }
    w[r] = cw / n;
    l[r] = cl / n;
    t[r] = (n - cw - cl) / n;
    d[r] = (cw - cl) / n;
  }
  const iv = (samples: number[], point: number): Interval => {
    samples.sort((x, y) => x - y);
    return { point, lo: quantile(samples, alpha), hi: quantile(samples, 1 - alpha) };
  };
  return {
    n,
    wins,
    ties,
    losses,
    winRate: iv(w, wins / n),
    tieRate: iv(t, ties / n),
    lossRate: iv(l, losses / n),
    net: iv(d, (wins - losses) / n),
  };
}

/** Pearson correlation; NaN when either side has no variance. */
export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return Number.NaN;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i] as number;
    my += ys[i] as number;
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] as number) - mx;
    const dy = (ys[i] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx === 0 || syy === 0 ? Number.NaN : sxy / Math.sqrt(sxx * syy);
}

/** Ordinary least squares y = a + b*x. With no variance in x the intercept is the mean of y. */
export function ols(xs: number[], ys: number[]): { intercept: number; slope: number } {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return { intercept: Number.NaN, slope: Number.NaN };
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i] as number;
    my += ys[i] as number;
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] as number) - mx;
    sxy += dx * ((ys[i] as number) - my);
    sxx += dx * dx;
  }
  if (sxx === 0) return { intercept: my, slope: 0 };
  const slope = sxy / sxx;
  return { intercept: my - slope * mx, slope };
}

/**
 * Length-controlled preference: regress the per-item judge score (scaled to
 * [-1, 1]) on the log length ratio of the two answers and report the
 * intercept, i.e. the expected preference if both answers had equal length.
 * CI by bootstrapping items.
 */
export function lengthControlledNet(
  logRatios: number[],
  scores: number[],
  opts: { resamples?: number; seed?: number; confidence?: number } = {},
): Interval & { slope: number } {
  const n = Math.min(logRatios.length, scores.length);
  const fit = ols(logRatios, scores);
  if (n < 3) return { point: fit.intercept, lo: Number.NaN, hi: Number.NaN, slope: fit.slope };
  const resamples = opts.resamples ?? 10_000;
  const alpha = (1 - (opts.confidence ?? 0.95)) / 2;
  const rand = seededRandom(opts.seed ?? 1);
  const samples: number[] = [];
  const bx: number[] = new Array(n);
  const by: number[] = new Array(n);
  for (let r = 0; r < resamples; r++) {
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rand() * n);
      bx[i] = logRatios[j] as number;
      by[i] = scores[j] as number;
    }
    const v = ols(bx, by).intercept;
    if (Number.isFinite(v)) samples.push(v);
  }
  samples.sort((a, b) => a - b);
  return {
    point: fit.intercept,
    lo: quantile(samples, alpha),
    hi: quantile(samples, 1 - alpha),
    slope: fit.slope,
  };
}
