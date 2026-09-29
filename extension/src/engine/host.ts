import {
  EngineMetrics,
  LifecycleManager,
  TIER_LABELS,
  collect,
  effectiveMode,
  pickTier,
  type Availability,
  type Context,
  type Engine,
  type GenReq,
  type LifecycleSnapshot,
  type MetricsSnapshot,
  type ModelState,
  type Tier,
} from '@tessera/core';
import type { Settings } from '../settings';
import { OllamaEngine } from './ollama';
import { PromptApiEngine } from './prompt-api';
import { WebLlmEngine } from './webllm';

/** The subset of settings the model host needs; the service worker passes it in. */
export type HostConfig = Pick<
  Settings,
  'tier' | 'lifecycleMode' | 'graceMinutes' | 'webllmModel' | 'webllmConsent' | 'ollama'
> & {
  /** Whether the optional localhost permission is granted (only the service worker can check). */
  localhostGranted: boolean;
};

export interface EngineStatus {
  tier: Tier;
  tierLabel: string;
  availability: Partial<Record<1 | 2 | 3, Availability>>;
  state: ModelState;
  mode: Settings['lifecycleMode'];
  modeNote?: string;
  graceMinutes: number;
  progress?: { progress: number; text: string };
  lastError?: string;
  metrics: MetricsSnapshot;
  webllmModel: string;
}

export interface GenerateResult {
  text: string;
  tier: Tier;
  ms: number;
}

const GENERATE_TIMEOUT_MS = 120_000;

/**
 * Lives in the offscreen document: one shared model for every tab. Owns the
 * engines, the lifecycle manager and in-memory metrics.
 */
export class EngineHost {
  readonly #t1 = new PromptApiEngine();
  readonly #t2: WebLlmEngine;
  readonly #t3: OllamaEngine;
  readonly #metrics = new EngineMetrics();
  readonly #lifecycle: LifecycleManager;
  #config: HostConfig;
  #availability: EngineStatus['availability'] = {};
  #loadedTier: Tier = 0;
  #progress: EngineStatus['progress'];
  #lastError: string | undefined;
  #modeNote: string | undefined;
  #loading: Promise<void> | undefined;
  readonly #onChange: (s: EngineStatus) => void;

  constructor(config: HostConfig, onChange: (s: EngineStatus) => void = () => undefined) {
    this.#config = config;
    this.#onChange = onChange;
    this.#t2 = new WebLlmEngine(config.webllmModel, config.webllmConsent);
    this.#t3 = new OllamaEngine({
      ...config.ollama,
      enabled: config.ollama.enabled && config.localhostGranted,
    });
    this.#lifecycle = new LifecycleManager(
      {
        load: () => this.#load(),
        unload: () => this.#unload(),
        onChange: () => this.#emit(),
      },
      { mode: this.#mode(), graceMinutes: config.graceMinutes },
    );
  }

  #mode(): Settings['lifecycleMode'] {
    const nav = navigator as { deviceMemory?: number };
    const eff = effectiveMode(this.#config.lifecycleMode, {
      ...(nav.deviceMemory !== undefined ? { deviceMemoryGB: nav.deviceMemory } : {}),
    });
    this.#modeNote = eff.reason
      ? `Using "on demand" instead of "keep warm": ${eff.reason}`
      : undefined;
    return eff.mode;
  }

  #engine(tier: Tier): Engine | undefined {
    return tier === 1 ? this.#t1 : tier === 2 ? this.#t2 : tier === 3 ? this.#t3 : undefined;
  }

  async refreshAvailability(): Promise<void> {
    const [a1, a2, a3] = await Promise.all([
      this.#t1.availability(),
      this.#t2.availability(),
      this.#t3.availability(),
    ]);
    this.#availability = { 1: a1, 2: a2, 3: a3 };
  }

  get tier(): Tier {
    return pickTier(this.#availability, this.#config.tier);
  }

  configure(config: HostConfig): void {
    this.#config = config;
    this.#t2.configure(config.webllmModel, config.webllmConsent);
    this.#t3.configure({
      ...config.ollama,
      enabled: config.ollama.enabled && config.localhostGranted,
    });
    this.#lifecycle.dispatch({
      type: 'config',
      config: { mode: this.#mode(), graceMinutes: config.graceMinutes },
    });
  }

  context(ctx: Partial<Context>): void {
    this.#lifecycle.dispatch({ type: 'context', ctx });
  }

  /** The rules gate thinks the user is writing something worth optimizing: warm up in the background. */
  intent(): void {
    if (this.tier !== 0) this.#lifecycle.dispatch({ type: 'intent' });
  }

  unloadNow(): void {
    this.#lifecycle.dispatch({ type: 'unload-now' });
  }

  async status(refresh = true): Promise<EngineStatus> {
    if (refresh) await this.refreshAvailability();
    return this.#snapshot();
  }

  #snapshot(): EngineStatus {
    const snap: LifecycleSnapshot = this.#lifecycle.snapshot;
    const tier = this.tier;
    return {
      tier,
      tierLabel: TIER_LABELS[tier],
      availability: this.#availability,
      state: snap.state,
      mode: snap.config.mode,
      ...(this.#modeNote ? { modeNote: this.#modeNote } : {}),
      graceMinutes: snap.config.graceMinutes,
      ...(this.#progress ? { progress: this.#progress } : {}),
      ...(this.#lastError ? { lastError: this.#lastError } : {}),
      metrics: this.#metrics.snapshot(),
      webllmModel: this.#t2.modelId,
    };
  }

  #emit(): void {
    this.#onChange(this.#snapshot());
  }

  async #load(): Promise<void> {
    const tier = this.tier;
    const engine = this.#engine(tier);
    if (!engine) throw new Error('No model tier is available.');
    const t0 = performance.now();
    this.#lastError = undefined;
    this.#loading = engine.load((p) => {
      this.#progress = p;
      this.#emit();
    });
    try {
      await this.#loading;
      this.#loadedTier = tier;
      this.#metrics.loaded(performance.now() - t0);
    } catch (err) {
      this.#lastError = String(err instanceof Error ? err.message : err);
      throw err;
    } finally {
      this.#loading = undefined;
      this.#progress = undefined;
    }
  }

  async #unload(): Promise<void> {
    const engine = this.#engine(this.#loadedTier);
    this.#loadedTier = 0;
    this.#metrics.unloaded();
    await engine?.unload();
  }

  /** Explicit download (consented from Settings). Loads the model, which caches it. */
  async download(): Promise<void> {
    await this.refreshAvailability();
    this.#lifecycle.dispatch({ type: 'use' });
    await this.#waitWarm();
  }

  async #waitWarm(): Promise<void> {
    for (let i = 0; i < 2400 && this.#lifecycle.snapshot.state === 'warming'; i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    if (this.#lifecycle.snapshot.state === 'cold')
      throw new Error(this.#lastError ?? 'The model could not be loaded.');
  }

  async generate(req: GenReq): Promise<GenerateResult> {
    if (!Object.keys(this.#availability).length) await this.refreshAvailability();
    const tier = this.tier;
    const engine = this.#engine(tier);
    if (!engine)
      throw new Error('No on-device model is available. Tessera is running on rules only.');
    this.#lifecycle.dispatch({ type: 'use' });
    await this.#waitWarm();
    const t0 = performance.now();
    let first = 0;
    let chunks = 0;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
    try {
      async function* timed(src: AsyncIterable<string>) {
        for await (const c of src) {
          if (!first) first = performance.now() - t0;
          chunks++;
          yield c;
        }
      }
      const text = await collect(timed(engine.generate({ ...req, signal: controller.signal })));
      const ms = performance.now() - t0;
      this.#metrics.generation(first || ms, Math.max(chunks, Math.round(text.length / 4)), ms);
      this.#lifecycle.dispatch({ type: 'use' });
      return { text, tier, ms: Math.round(ms) };
    } catch (err) {
      this.#lastError = String(err instanceof Error ? err.message : err);
      this.#emit();
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
