import { describe, expect, it } from 'vitest';
import { EngineMetrics } from '../../src/engine/metrics';
import { collect, pickTier } from '../../src/engine/types';

describe('pickTier', () => {
  it('prefers ready tiers in order 1, 3, 2 and falls back to rules', () => {
    expect(pickTier({ 1: 'ready', 2: 'ready', 3: 'ready' })).toBe(1);
    expect(pickTier({ 1: 'needs-download', 2: 'ready', 3: 'ready' })).toBe(3);
    expect(pickTier({ 1: 'unavailable', 2: 'ready' })).toBe(2);
    expect(pickTier({ 2: 'needs-download' })).toBe(0);
  });

  it('honours an explicit preference only when that tier is ready', () => {
    expect(pickTier({ 1: 'ready', 2: 'ready' }, 2)).toBe(2);
    expect(pickTier({ 1: 'ready', 2: 'needs-download' }, 2)).toBe(0);
    expect(pickTier({ 1: 'ready' }, 0)).toBe(0);
  });
});

describe('collect', () => {
  it('joins streamed chunks', async () => {
    async function* gen() {
      yield 'a';
      yield 'b';
    }
    expect(await collect(gen())).toBe('ab');
  });
});

describe('EngineMetrics', () => {
  it('tracks loads, residency and generation speed', () => {
    let now = 0;
    const m = new EngineMetrics(() => now);
    m.loaded(1500);
    now = 3 * 60_000;
    m.generation(200, 51, 1200); // 50 tokens in 1 s after the first
    m.unloaded();
    now = 10 * 60_000;
    expect(m.snapshot()).toEqual({
      loadCount: 1,
      residentMinutes: 3,
      lastLoadMs: 1500,
      generations: 1,
      medianTtftMs: 200,
      medianTokensPerSecond: 50,
    });
  });
});
