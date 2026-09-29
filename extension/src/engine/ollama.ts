import type { Availability, Engine, GenReq } from '@tessera/core';

/**
 * Tier 3: a model server the user runs on localhost (Ollama's API). Needs the
 * optional localhost host permission and OLLAMA_ORIGINS allowing the extension.
 */
export class OllamaEngine implements Engine {
  readonly tier = 3 as const;
  readonly label = 'Local server (Ollama)';
  #url: string;
  #model: string;
  #enabled: boolean;

  constructor(opts: { url: string; model: string; enabled: boolean }) {
    this.#url = opts.url;
    this.#model = opts.model;
    this.#enabled = opts.enabled;
  }

  configure(opts: { url: string; model: string; enabled: boolean }): void {
    this.#url = opts.url;
    this.#model = opts.model;
    this.#enabled = opts.enabled;
  }

  async availability(): Promise<Availability> {
    if (!this.#enabled) return 'unavailable';
    try {
      const res = await fetch(`${this.#url}/api/tags`, { signal: AbortSignal.timeout(1500) });
      if (!res.ok) return 'unavailable';
      const body = (await res.json()) as { models?: { name: string }[] };
      return body.models?.some((m) => m.name === this.#model || m.name === `${this.#model}:latest`)
        ? 'ready'
        : 'needs-download';
    } catch {
      return 'unavailable';
    }
  }

  // The server owns the model's memory; nothing to load or free here.
  async load(): Promise<void> {}
  async unload(): Promise<void> {}

  async *generate(req: GenReq): AsyncIterable<string> {
    const res = await fetch(`${this.#url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      ...(req.signal ? { signal: req.signal } : {}),
      body: JSON.stringify({
        model: this.#model,
        stream: false,
        messages: [
          ...(req.system ? [{ role: 'system', content: req.system }] : []),
          { role: 'user', content: req.prompt },
        ],
        ...(req.jsonSchema ? { format: req.jsonSchema } : {}),
        options: { temperature: req.temperature ?? 0.2, num_predict: req.maxTokens ?? 512 },
      }),
    });
    if (!res.ok)
      throw new Error(`Local server answered ${res.status}. Check OLLAMA_ORIGINS (see Settings).`);
    const body = (await res.json()) as { message?: { content?: string } };
    yield body.message?.content ?? '';
  }
}
