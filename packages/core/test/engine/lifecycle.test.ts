import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LifecycleManager,
  clampGrace,
  effectiveMode,
  initialSnapshot,
  reduce,
  type LifecycleConfig,
} from '../../src/engine/lifecycle';

const MIN = 60_000;

function setup(config: Partial<LifecycleConfig> = {}) {
  const calls: string[] = [];
  let resolveLoad: () => void = () => undefined;
  let rejectLoad: () => void = () => undefined;
  const m = new LifecycleManager(
    {
      load: () =>
        new Promise<void>((res, rej) => {
          calls.push('load');
          resolveLoad = res;
          rejectLoad = rej;
        }),
      unload: async () => {
        calls.push('unload');
      },
    },
    config,
  );
  const finishLoad = async () => {
    resolveLoad();
    await vi.advanceTimersByTimeAsync(0);
  };
  const failLoad = async () => {
    rejectLoad();
    await vi.advanceTimersByTimeAsync(0);
  };
  return { m, calls, finishLoad, failLoad, state: () => m.snapshot.state };
}

describe('LifecycleManager (on-demand)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts cold and does not load when an AI site opens', () => {
    const { m, calls, state } = setup();
    m.dispatch({ type: 'context', ctx: { visibleAiTabs: 1 } });
    expect(state()).toBe('cold');
    expect(calls).toEqual([]);
  });

  it('warms on intent and becomes warm when loaded', async () => {
    const { m, calls, finishLoad, state } = setup();
    m.dispatch({ type: 'context', ctx: { visibleAiTabs: 1 } });
    m.dispatch({ type: 'intent' });
    expect(state()).toBe('warming');
    await finishLoad();
    expect(state()).toBe('warm');
    expect(calls).toEqual(['load']);
  });

  it('cools when AI tabs are hidden and unloads after the 4 minute grace period', async () => {
    const { m, calls, finishLoad, state } = setup();
    m.dispatch({ type: 'context', ctx: { visibleAiTabs: 1 } });
    m.dispatch({ type: 'use' });
    await finishLoad();
    m.dispatch({ type: 'context', ctx: { visibleAiTabs: 0 } });
    expect(state()).toBe('cooling');
    await vi.advanceTimersByTimeAsync(4 * MIN - 1);
    expect(state()).toBe('cooling');
    await vi.advanceTimersByTimeAsync(1);
    expect(state()).toBe('cold');
    expect(calls).toEqual(['load', 'unload']);
  });

  it('resets the grace timer if the user returns', async () => {
    const { m, finishLoad, state } = setup();
    m.dispatch({ type: 'context', ctx: { visibleAiTabs: 1 } });
    m.dispatch({ type: 'use' });
    await finishLoad();
    m.dispatch({ type: 'context', ctx: { windowFocused: false } });
    await vi.advanceTimersByTimeAsync(3 * MIN);
    m.dispatch({ type: 'context', ctx: { windowFocused: true } });
    expect(state()).toBe('warm');
    m.dispatch({ type: 'context', ctx: { windowFocused: false } });
    await vi.advanceTimersByTimeAsync(3 * MIN);
    expect(state()).toBe('cooling'); // a fresh 4 minutes, not the remaining 1
    await vi.advanceTimersByTimeAsync(1 * MIN);
    expect(state()).toBe('cold');
  });

  it('starts cooling after a while with no use even while the tab stays visible', async () => {
    const { m, finishLoad, state } = setup({ noUseMinutes: 10 });
    m.dispatch({ type: 'context', ctx: { visibleAiTabs: 1 } });
    m.dispatch({ type: 'use' });
    await finishLoad();
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(state()).toBe('cooling');
    m.dispatch({ type: 'use' });
    expect(state()).toBe('warm');
  });

  it('unloads immediately when the machine locks', async () => {
    const { m, calls, finishLoad, state } = setup();
    m.dispatch({ type: 'context', ctx: { visibleAiTabs: 1 } });
    m.dispatch({ type: 'use' });
    await finishLoad();
    m.dispatch({ type: 'context', ctx: { idle: 'locked' } });
    expect(state()).toBe('cold');
    expect(calls).toEqual(['load', 'unload']);
  });

  it('honours "unload now" and a new grace period', async () => {
    const { m, finishLoad, state } = setup();
    m.dispatch({ type: 'context', ctx: { visibleAiTabs: 1 } });
    m.dispatch({ type: 'use' });
    await finishLoad();
    m.dispatch({ type: 'context', ctx: { visibleAiTabs: 0 } });
    m.dispatch({ type: 'config', config: { graceMinutes: 1 } });
    await vi.advanceTimersByTimeAsync(1 * MIN);
    expect(state()).toBe('cold');
    m.dispatch({ type: 'use' });
    await finishLoad();
    m.dispatch({ type: 'unload-now' });
    expect(state()).toBe('cold');
  });

  it('goes back to cold if loading fails, without calling unload', async () => {
    const { m, calls, failLoad, state } = setup();
    m.dispatch({ type: 'intent' });
    await failLoad();
    expect(state()).toBe('cold');
    expect(calls).toEqual(['load']);
  });

  it('treats a lost model host as cold', async () => {
    const { m, finishLoad, state } = setup();
    m.dispatch({ type: 'use' });
    await finishLoad();
    m.dispatch({ type: 'host-lost' });
    expect(state()).toBe('cold');
  });
});

describe('modes', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keep-warm loads as soon as an AI tab is visible', async () => {
    const { m, finishLoad, state } = setup({ mode: 'keep-warm' });
    m.dispatch({ type: 'context', ctx: { visibleAiTabs: 1 } });
    expect(state()).toBe('warming');
    await finishLoad();
    await vi.advanceTimersByTimeAsync(60 * MIN);
    expect(state()).toBe('warm'); // no "no use" timer in keep-warm
  });

  it('off never loads and unloads a resident model', async () => {
    const { m, calls, finishLoad, state } = setup();
    m.dispatch({ type: 'use' });
    await finishLoad();
    m.dispatch({ type: 'config', config: { mode: 'off' } });
    expect(state()).toBe('cold');
    m.dispatch({ type: 'intent' });
    expect(state()).toBe('cold');
    expect(calls).toEqual(['load', 'unload']);
  });
});

describe('helpers', () => {
  it('clamps the grace period to 1-10 minutes', () => {
    expect(clampGrace(0)).toBe(1);
    expect(clampGrace(42)).toBe(10);
    expect(clampGrace(Number.NaN)).toBe(4);
    expect(initialSnapshot({ graceMinutes: 20 }).config.graceMinutes).toBe(10);
  });

  it('reduce is pure', () => {
    const s = initialSnapshot();
    const before = JSON.stringify(s);
    reduce(s, { type: 'intent' });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('downgrades keep-warm on low-memory or low-battery devices', () => {
    expect(effectiveMode('keep-warm', { deviceMemoryGB: 4 }).mode).toBe('on-demand');
    expect(effectiveMode('keep-warm', { batteryLow: true }).mode).toBe('on-demand');
    expect(effectiveMode('keep-warm', { deviceMemoryGB: 8 }).mode).toBe('keep-warm');
    expect(effectiveMode('on-demand', { deviceMemoryGB: 2 }).mode).toBe('on-demand');
  });
});
