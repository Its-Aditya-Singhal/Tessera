import type { Availability, Engine, GenReq, LoadProgress } from '@tessera/core';

/* The Prompt API is not in TypeScript's DOM lib yet; this is the subset Tessera uses. */
interface LMSession {
  prompt(
    input: string,
    opts?: { responseConstraint?: unknown; signal?: AbortSignal },
  ): Promise<string>;
  destroy(): void;
}
interface LMStatic {
  availability(opts?: unknown): Promise<string>;
  create(opts?: {
    initialPrompts?: { role: 'system' | 'user' | 'assistant'; content: string }[];
    expectedInputs?: unknown;
    expectedOutputs?: unknown;
    monitor?: (m: EventTarget) => void;
    signal?: AbortSignal;
  }): Promise<LMSession>;
}

const LANGS = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

const lm = (): LMStatic | undefined => (globalThis as { LanguageModel?: LMStatic }).LanguageModel;

/** Tier 1: Chrome's built-in model. Chrome owns the weights; "loading" keeps a session open. */
export class PromptApiEngine implements Engine {
  readonly tier = 1 as const;
  readonly label = 'Chrome built-in model';
  #warm: LMSession | undefined;

  async availability(): Promise<Availability> {
    const api = lm();
    if (!api) return 'unavailable';
    try {
      const a = await api.availability(LANGS);
      if (a === 'available') return 'ready';
      if (a === 'downloadable' || a === 'downloading') return 'needs-download';
      return 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  async load(onProgress?: (p: LoadProgress) => void): Promise<void> {
    const api = lm();
    if (!api) throw new Error('The built-in model is not available in this browser.');
    this.#warm ??= await api.create({
      ...LANGS,
      monitor: (m) =>
        m.addEventListener('downloadprogress', (e) =>
          onProgress?.({
            progress: (e as unknown as { loaded: number }).loaded,
            text: 'Downloading the built-in model',
          }),
        ),
    });
  }

  async unload(): Promise<void> {
    this.#warm?.destroy();
    this.#warm = undefined;
  }

  async *generate(req: GenReq): AsyncIterable<string> {
    const api = lm();
    if (!api) throw new Error('The built-in model is not available in this browser.');
    // A fresh session per request keeps requests independent; the warm session keeps the model resident.
    const session = await api.create({
      ...LANGS,
      ...(req.system ? { initialPrompts: [{ role: 'system' as const, content: req.system }] } : {}),
      ...(req.signal ? { signal: req.signal } : {}),
    });
    try {
      yield await session.prompt(req.prompt, {
        ...(req.jsonSchema ? { responseConstraint: req.jsonSchema } : {}),
        ...(req.signal ? { signal: req.signal } : {}),
      });
    } finally {
      session.destroy();
    }
  }
}
