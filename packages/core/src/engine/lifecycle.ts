/**
 * Model lifecycle: load the model only when it is worth it, keep one shared
 * instance, and free it when the user walks away.
 *
 *   cold ─intent/use─▶ warming ─loaded─▶ warm ─tabs hidden / unfocused / no use─▶ cooling
 *    ▲                    │                ▲                                       │
 *    └──── load failed ───┘                └──────────── user returns ─────────────┤
 *    └──────────── grace expired, machine locked, unload now, mode off ────────────┘
 *
 * `reduce` is pure. `LifecycleManager` wraps it with a scheduler and callbacks.
 */

export type ModelState = 'cold' | 'warming' | 'warm' | 'cooling';
export type LifecycleMode = 'on-demand' | 'keep-warm' | 'off';

export interface LifecycleConfig {
  mode: LifecycleMode;
  /** Grace period before unloading, 1-10 minutes. */
  graceMinutes: number;
  /** Minutes without a generation before a warm model starts cooling. */
  noUseMinutes: number;
}

export const DEFAULT_LIFECYCLE: LifecycleConfig = {
  mode: 'on-demand',
  graceMinutes: 4,
  noUseMinutes: 10,
};

export interface Context {
  /** AI chat tabs currently visible to the user. */
  visibleAiTabs: number;
  windowFocused: boolean;
  /** From chrome.idle. `locked` unloads immediately. */
  idle: 'active' | 'idle' | 'locked';
}

export interface LifecycleSnapshot {
  state: ModelState;
  config: LifecycleConfig;
  ctx: Context;
  /** Set while a timer is pending. */
  timer?: { kind: 'grace' | 'no-use'; ms: number };
}

export type LifecycleEvent =
  | { type: 'intent' }
  | { type: 'use' }
  | { type: 'loaded' }
  | { type: 'load-failed' }
  | { type: 'host-lost' }
  | { type: 'unload-now' }
  | { type: 'timer' }
  | { type: 'context'; ctx: Partial<Context> }
  | { type: 'config'; config: Partial<LifecycleConfig> };

export type Effect =
  | { type: 'load' }
  | { type: 'unload' }
  | { type: 'set-timer'; kind: 'grace' | 'no-use'; ms: number }
  | { type: 'clear-timer' };

export function clampGrace(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_LIFECYCLE.graceMinutes;
  return Math.min(10, Math.max(1, Math.round(minutes)));
}

export function initialSnapshot(config: Partial<LifecycleConfig> = {}): LifecycleSnapshot {
  return {
    state: 'cold',
    config: {
      ...DEFAULT_LIFECYCLE,
      ...config,
      graceMinutes: clampGrace(config.graceMinutes ?? DEFAULT_LIFECYCLE.graceMinutes),
    },
    ctx: { visibleAiTabs: 0, windowFocused: true, idle: 'active' },
  };
}

const present = (ctx: Context) =>
  ctx.visibleAiTabs > 0 && ctx.windowFocused && ctx.idle === 'active';
const MIN = 60_000;

export function reduce(
  snap: LifecycleSnapshot,
  ev: LifecycleEvent,
): { snap: LifecycleSnapshot; effects: Effect[] } {
  const effects: Effect[] = [];
  let s: LifecycleSnapshot = { ...snap, ctx: { ...snap.ctx }, config: { ...snap.config } };

  const toCold = () => {
    if (s.state !== 'cold') effects.push({ type: 'unload' });
    if (s.timer) effects.push({ type: 'clear-timer' });
    s = { ...s, state: 'cold' };
    delete s.timer;
  };
  const setTimer = (kind: 'grace' | 'no-use', ms: number) => {
    s.timer = { kind, ms };
    effects.push({ type: 'set-timer', kind, ms });
  };
  const clearTimer = () => {
    if (s.timer) effects.push({ type: 'clear-timer' });
    delete s.timer;
  };
  const startLoad = () => {
    s.state = 'warming';
    clearTimer();
    effects.push({ type: 'load' });
  };
  const warm = () => {
    s.state = 'warm';
    clearTimer();
    if (s.config.mode === 'on-demand') setTimer('no-use', s.config.noUseMinutes * MIN);
  };
  const cool = () => {
    s.state = 'cooling';
    clearTimer();
    setTimer('grace', s.config.graceMinutes * MIN);
  };
  /** Re-evaluate after the context or config changed. */
  const settle = () => {
    if (s.config.mode === 'off') return toCold();
    if (s.ctx.idle === 'locked') return toCold();
    const here = present(s.ctx);
    if (s.state === 'warm' && !here) return cool();
    if (s.state === 'cooling' && here) return warm();
    if (s.state === 'cold' && here && s.config.mode === 'keep-warm') return startLoad();
  };

  switch (ev.type) {
    case 'config':
      s.config = {
        ...s.config,
        ...ev.config,
        graceMinutes: clampGrace(ev.config.graceMinutes ?? s.config.graceMinutes),
      };
      // A new grace period applies to a running timer too.
      if (s.state === 'cooling') cool();
      else if (s.state === 'warm') warm();
      settle();
      break;
    case 'context':
      s.ctx = { ...s.ctx, ...ev.ctx };
      settle();
      break;
    case 'intent':
    case 'use':
      if (s.config.mode === 'off') break;
      if (s.state === 'cold') startLoad();
      else if (s.state === 'cooling' || (s.state === 'warm' && ev.type === 'use')) warm();
      break;
    case 'loaded':
      if (s.state !== 'warming') break;
      warm();
      settle();
      break;
    case 'load-failed':
    case 'host-lost':
      // The host already dropped the model; nothing to unload.
      clearTimer();
      s.state = 'cold';
      break;
    case 'unload-now':
      toCold();
      break;
    case 'timer':
      if (s.state === 'warm' && s.timer?.kind === 'no-use') cool();
      else if (s.state === 'cooling' && s.timer?.kind === 'grace') toCold();
      break;
  }
  return { snap: s, effects };
}

export interface Scheduler {
  set(ms: number, cb: () => void): void;
  clear(): void;
}

export const timeoutScheduler = (): Scheduler => {
  let handle: Parameters<typeof clearTimeout>[0];
  return {
    set(ms, cb) {
      if (handle) clearTimeout(handle);
      handle = setTimeout(() => {
        handle = undefined;
        cb();
      }, ms) as typeof handle;
    },
    clear() {
      if (handle) clearTimeout(handle);
      handle = undefined;
    },
  };
};

export interface LifecycleHooks {
  load(): Promise<void>;
  unload(): Promise<void>;
  onChange?(snap: LifecycleSnapshot): void;
}

/** Runs the reducer against real effects. One instance per model host. */
export class LifecycleManager {
  #snap: LifecycleSnapshot;
  readonly #hooks: LifecycleHooks;
  readonly #scheduler: Scheduler;

  constructor(
    hooks: LifecycleHooks,
    config: Partial<LifecycleConfig> = {},
    scheduler: Scheduler = timeoutScheduler(),
  ) {
    this.#hooks = hooks;
    this.#scheduler = scheduler;
    this.#snap = initialSnapshot(config);
  }

  get snapshot(): LifecycleSnapshot {
    return this.#snap;
  }

  dispatch(ev: LifecycleEvent): void {
    const { snap, effects } = reduce(this.#snap, ev);
    this.#snap = snap;
    for (const e of effects) {
      switch (e.type) {
        case 'load':
          this.#hooks.load().then(
            () => this.dispatch({ type: 'loaded' }),
            () => this.dispatch({ type: 'load-failed' }),
          );
          break;
        case 'unload':
          void this.#hooks.unload().catch(() => undefined);
          break;
        case 'set-timer':
          this.#scheduler.set(e.ms, () => this.dispatch({ type: 'timer' }));
          break;
        case 'clear-timer':
          this.#scheduler.clear();
          break;
      }
    }
    this.#hooks.onChange?.(this.#snap);
  }
}

/**
 * Picks a lighter mode on constrained devices. `deviceMemoryGB` is the browser's
 * coarse hint (capped at 8); battery info may not exist at all.
 */
export function effectiveMode(
  mode: LifecycleMode,
  device: { deviceMemoryGB?: number; batteryLow?: boolean },
): { mode: LifecycleMode; reason?: string } {
  if (mode === 'keep-warm' && device.deviceMemoryGB !== undefined && device.deviceMemoryGB <= 4) {
    return { mode: 'on-demand', reason: 'This device reports 4 GB of memory or less.' };
  }
  if (mode === 'keep-warm' && device.batteryLow) {
    return { mode: 'on-demand', reason: 'Battery is low.' };
  }
  return { mode };
}
