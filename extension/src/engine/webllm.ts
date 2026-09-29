import type { Availability, Engine, GenReq, LoadProgress } from '@tessera/core';
import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm';

/**
 * Tier 2: a small quantized model run by WebLLM on WebGPU, inside a dedicated
 * worker of the offscreen document. Weights download only after consent and
 * are cached by WebLLM (Cache API) under the extension's origin.
 */
export class WebLlmEngine implements Engine {
  readonly tier = 2 as const;
  readonly label = 'WebLLM on-device model';
  #engine: WebWorkerMLCEngine | undefined;
  #worker: Worker | undefined;
  #modelId: string;
  #consent: boolean;

  constructor(modelId: string, consent: boolean) {
    this.#modelId = modelId;
    this.#consent = consent;
  }

  configure(modelId: string, consent: boolean): void {
    if (modelId !== this.#modelId) void this.unload();
    this.#modelId = modelId;
    this.#consent = consent;
  }

  get modelId(): string {
    return this.#modelId;
  }

  async availability(): Promise<Availability> {
    const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return 'unavailable';
    try {
      if (!(await gpu.requestAdapter())) return 'unavailable';
      const { hasModelInCache } = await import('@mlc-ai/web-llm');
      return this.#consent && (await hasModelInCache(this.#modelId)) ? 'ready' : 'needs-download';
    } catch {
      return 'unavailable';
    }
  }

  async load(onProgress?: (p: LoadProgress) => void): Promise<void> {
    if (this.#engine) return;
    if (!this.#consent)
      throw new Error('Downloading the on-device model needs your consent first (Settings).');
    const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
    this.#worker = new Worker(new URL('../spike/webllm.worker.ts', import.meta.url), {
      type: 'module',
    });
    try {
      this.#engine = await CreateWebWorkerMLCEngine(this.#worker, this.#modelId, {
        initProgressCallback: (r) => onProgress?.({ progress: r.progress, text: r.text }),
      });
    } catch (err) {
      this.#worker.terminate();
      this.#worker = undefined;
      throw err;
    }
  }

  async unload(): Promise<void> {
    const engine = this.#engine;
    this.#engine = undefined;
    try {
      await engine?.unload();
    } finally {
      this.#worker?.terminate();
      this.#worker = undefined;
    }
  }

  async *generate(req: GenReq): AsyncIterable<string> {
    if (!this.#engine) await this.load();
    const engine = this.#engine!;
    const stream = await engine.chat.completions.create({
      messages: [
        ...(req.system ? [{ role: 'system' as const, content: req.system }] : []),
        { role: 'user' as const, content: req.prompt },
      ],
      max_tokens: req.maxTokens ?? 512,
      temperature: req.temperature ?? 0.2,
      stream: true,
      ...(req.jsonSchema
        ? {
            response_format: {
              type: 'json_object' as const,
              schema: JSON.stringify(req.jsonSchema),
            },
          }
        : {}),
    });
    for await (const chunk of stream) {
      if (req.signal?.aborted) {
        await engine.interruptGenerate();
        throw new Error('aborted');
      }
      const delta = chunk.choices[0]?.delta.content;
      if (delta) yield delta;
    }
  }
}
