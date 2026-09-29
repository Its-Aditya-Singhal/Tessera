/**
 * In-memory resource metrics for the resource-cost benchmark. Never persisted,
 * never sent anywhere; they vanish when the model host closes.
 */
export interface MetricsSnapshot {
  loadCount: number;
  residentMinutes: number;
  lastLoadMs?: number;
  generations: number;
  /** Medians over recorded generations. */
  medianTtftMs?: number;
  medianTokensPerSecond?: number;
}

export class EngineMetrics {
  #loads = 0;
  #residentMs = 0;
  #loadedAt: number | undefined;
  #lastLoadMs: number | undefined;
  #ttft: number[] = [];
  #tps: number[] = [];
  readonly #now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.#now = now;
  }

  loaded(loadMs: number): void {
    this.#loads++;
    this.#lastLoadMs = loadMs;
    this.#loadedAt = this.#now();
  }

  unloaded(): void {
    if (this.#loadedAt !== undefined) this.#residentMs += this.#now() - this.#loadedAt;
    this.#loadedAt = undefined;
  }

  generation(ttftMs: number, tokens: number, totalMs: number): void {
    this.#ttft.push(ttftMs);
    const genMs = totalMs - ttftMs;
    if (tokens > 1 && genMs > 0) this.#tps.push((tokens - 1) / (genMs / 1000));
  }

  snapshot(): MetricsSnapshot {
    const resident =
      this.#residentMs + (this.#loadedAt !== undefined ? this.#now() - this.#loadedAt : 0);
    const out: MetricsSnapshot = {
      loadCount: this.#loads,
      residentMinutes: Math.round((resident / 60_000) * 10) / 10,
      generations: this.#ttft.length,
    };
    if (this.#lastLoadMs !== undefined) out.lastLoadMs = Math.round(this.#lastLoadMs);
    const t = median(this.#ttft);
    if (t !== undefined) out.medianTtftMs = Math.round(t);
    const p = median(this.#tps);
    if (p !== undefined) out.medianTokensPerSecond = Math.round(p * 10) / 10;
    return out;
  }
}

function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1]! + s[m]!) / 2;
}
