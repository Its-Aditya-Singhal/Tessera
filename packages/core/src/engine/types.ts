/**
 * The tiered engine. Tier 0 is rules only and always available; tiers 1-3 are
 * optional models. Every tier implements the same interface so callers never
 * care which one answered.
 */
export type Tier = 0 | 1 | 2 | 3;

export type Availability = 'ready' | 'needs-download' | 'unavailable';

export interface LoadProgress {
  /** 0..1 */
  progress: number;
  text: string;
}

export interface GenReq {
  system?: string;
  prompt: string;
  /** JSON Schema the output must follow, when the engine supports constrained output. */
  jsonSchema?: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface Engine {
  tier: Tier;
  /** Human-readable name, e.g. "Chrome built-in model". */
  label: string;
  availability(): Promise<Availability>;
  load(onProgress?: (p: LoadProgress) => void): Promise<void>;
  unload(): Promise<void>;
  generate(req: GenReq): AsyncIterable<string>;
}

export type TierPreference = 'auto' | Tier;

export const TIER_LABELS: Record<Tier, string> = {
  0: 'Rules only',
  1: 'Chrome built-in model',
  2: 'WebLLM on-device model',
  3: 'Local server (Ollama)',
};

/**
 * Picks the tier to use. `auto` prefers what is already usable without a download,
 * in the order built-in model, local server, WebLLM, and falls back to rules.
 * An explicit preference is honoured only when that tier is ready.
 */
export function pickTier(
  availability: Partial<Record<Exclude<Tier, 0>, Availability>>,
  preference: TierPreference = 'auto',
): Tier {
  if (preference !== 'auto') {
    if (preference === 0) return 0;
    return availability[preference] === 'ready' ? preference : 0;
  }
  for (const t of [1, 3, 2] as const) {
    if (availability[t] === 'ready') return t;
  }
  return 0;
}

/** Collects every chunk of a generation into one string. */
export async function collect(stream: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const chunk of stream) out += chunk;
  return out;
}
