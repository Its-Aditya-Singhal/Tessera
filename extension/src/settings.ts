import {
  DETECTION_TYPES,
  clampGrace,
  type DetectionType,
  type LifecycleMode,
  type TierPreference,
} from '@tessera/core';
import { browser } from 'wxt/browser';

export type CapsuleMode = 'full' | 'capsule' | 'hybrid';
export type TargetSite = 'chatgpt' | 'claude' | 'gemini';

/**
 * Everything Tessera stores. Settings only: no prompts, chats or redaction
 * mappings are ever persisted.
 */
export interface Settings {
  onboarded: boolean;
  tier: TierPreference;
  lifecycleMode: LifecycleMode;
  graceMinutes: number;
  /** Per-category redaction switches. */
  redaction: Record<DetectionType, boolean>;
  /** Warn when something that looks like a secret is pasted into a chatbox. */
  pasteWarning: boolean;
  /** Ask the optimizer to answer in English whatever the input language. */
  englishOutput: boolean;
  capsuleMode: CapsuleMode;
  /** Turns kept verbatim in the hybrid capsule. */
  capsuleTurns: number;
  /** Approximate token budget per target site. */
  tokenBudgets: Record<TargetSite, number>;
  /** The user agreed to download WebLLM weights. */
  webllmConsent: boolean;
  webllmModel: string;
  ollama: { enabled: boolean; url: string; model: string };
}

export const WEBLLM_MODELS = [
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5 0.5B (about 280 MB, needs shader-f16)',
    f16: true,
  },
  { id: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC', label: 'Qwen2.5 0.5B (about 280 MB)', f16: false },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5 1.5B (about 880 MB, better quality)',
    f16: true,
  },
  {
    id: 'SmolLM2-360M-Instruct-q4f32_1-MLC',
    label: 'SmolLM2 360M (about 270 MB, English only)',
    f16: false,
  },
] as const;

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  tier: 'auto',
  lifecycleMode: 'on-demand',
  graceMinutes: 4,
  redaction: Object.fromEntries(DETECTION_TYPES.map((t) => [t, true])) as Record<
    DetectionType,
    boolean
  >,
  pasteWarning: true,
  englishOutput: false,
  capsuleMode: 'hybrid',
  capsuleTurns: 6,
  // Conservative defaults, well below each site's real limit, so the capsule leaves room to answer.
  tokenBudgets: { chatgpt: 24_000, claude: 60_000, gemini: 60_000 },
  webllmConsent: false,
  webllmModel: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
  ollama: { enabled: false, url: 'http://localhost:11434', model: 'qwen2.5:1.5b-instruct' },
};

const oneOf = <T extends string | number>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : fallback;

/** Accepts anything (old versions, hand-edited storage) and returns valid settings. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const redactionRaw = (r.redaction ?? {}) as Record<string, unknown>;
  const budgetsRaw = (r.tokenBudgets ?? {}) as Record<string, unknown>;
  const ollamaRaw = (r.ollama ?? {}) as Record<string, unknown>;
  const url =
    typeof ollamaRaw.url === 'string' &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(ollamaRaw.url)
      ? ollamaRaw.url.replace(/\/$/, '')
      : d.ollama.url;
  return {
    onboarded: bool(r.onboarded, d.onboarded),
    tier: oneOf<TierPreference>(r.tier, ['auto', 0, 1, 2, 3], d.tier),
    lifecycleMode: oneOf<LifecycleMode>(
      r.lifecycleMode,
      ['on-demand', 'keep-warm', 'off'],
      d.lifecycleMode,
    ),
    graceMinutes: clampGrace(typeof r.graceMinutes === 'number' ? r.graceMinutes : d.graceMinutes),
    redaction: Object.fromEntries(
      DETECTION_TYPES.map((t) => [t, bool(redactionRaw[t], true)]),
    ) as Record<DetectionType, boolean>,
    pasteWarning: bool(r.pasteWarning, d.pasteWarning),
    englishOutput: bool(r.englishOutput, d.englishOutput),
    capsuleMode: oneOf<CapsuleMode>(r.capsuleMode, ['full', 'capsule', 'hybrid'], d.capsuleMode),
    capsuleTurns: int(r.capsuleTurns, 0, 50, d.capsuleTurns),
    tokenBudgets: {
      chatgpt: int(budgetsRaw.chatgpt, 1_000, 1_000_000, d.tokenBudgets.chatgpt),
      claude: int(budgetsRaw.claude, 1_000, 1_000_000, d.tokenBudgets.claude),
      gemini: int(budgetsRaw.gemini, 1_000, 1_000_000, d.tokenBudgets.gemini),
    },
    webllmConsent: bool(r.webllmConsent, d.webllmConsent),
    webllmModel: oneOf(
      r.webllmModel as string,
      WEBLLM_MODELS.map((m) => m.id),
      d.webllmModel,
    ),
    ollama: {
      enabled: bool(ollamaRaw.enabled, d.ollama.enabled),
      url,
      model:
        typeof ollamaRaw.model === 'string' && /^[\w.:/-]{1,100}$/.test(ollamaRaw.model)
          ? ollamaRaw.model
          : d.ollama.model,
    },
  };
}

const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const got = await browser.storage.local.get(KEY);
  return sanitizeSettings(got[KEY]);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = sanitizeSettings({ ...(await loadSettings()), ...patch });
  await browser.storage.local.set({ [KEY]: next });
  return next;
}

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && KEY in changes) cb(sanitizeSettings(changes[KEY]?.newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

/** "Clear all data": settings go back to defaults and session state is wiped. */
export async function clearAllData(): Promise<void> {
  await browser.storage.local.clear();
  await browser.storage.session?.clear();
}
