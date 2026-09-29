import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import type { WebLlmSpikeResult } from './types';

/** Smallest instruct model in WebLLM's prebuilt list that needs no shader-f16. */
export const SPIKE_MODEL_ID = 'SmolLM2-360M-Instruct-q4f32_1-MLC';

/**
 * Loads a small model in a dedicated worker, generates a few tokens, and tries
 * JSON mode. Weights are cached by WebLLM (Cache API) under the extension origin.
 */
export async function runWebLlmSpike(
  host: string,
  modelId: string,
  onProgress: (text: string, progress: number) => void,
): Promise<WebLlmSpikeResult> {
  const webllm = await import('@mlc-ai/web-llm');
  const worker = new Worker(new URL('./webllm.worker.ts', import.meta.url), { type: 'module' });
  const t0 = performance.now();
  const engine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
    initProgressCallback: (r) => onProgress(r.text, r.progress),
  });
  const loadMs = performance.now() - t0;
  try {
    const t1 = performance.now();
    let firstTokenMs = 0;
    let output = '';
    let tokens = 0;
    const stream = await engine.chat.completions.create({
      messages: [
        { role: 'user', content: 'Rewrite this prompt to be clearer: "make my code faster"' },
      ],
      max_tokens: 48,
      temperature: 0,
      stream: true,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta.content ?? '';
      if (delta && !firstTokenMs) firstTokenMs = performance.now() - t1;
      if (delta) tokens++;
      output += delta;
    }
    const genMs = performance.now() - t1 - firstTokenMs;
    const jsonMode = await tryJsonMode(engine);
    return {
      host,
      modelId,
      loadMs: Math.round(loadMs),
      firstTokenMs: Math.round(firstTokenMs),
      tokens,
      tokensPerSecond: genMs > 0 ? Math.round((tokens / genMs) * 1000 * 10) / 10 : 0,
      output,
      jsonMode,
    };
  } finally {
    await engine.unload();
    worker.terminate();
  }
}

async function tryJsonMode(engine: WebWorkerMLCEngine): Promise<WebLlmSpikeResult['jsonMode']> {
  try {
    const res = await engine.chat.completions.create({
      messages: [
        {
          role: 'user',
          content:
            'Return JSON with keys "verdict" (one of ok_as_is, improve, ask) and "optimized" for: "fix bug"',
        },
      ],
      max_tokens: 80,
      temperature: 0,
      response_format: {
        type: 'json_object',
        schema: JSON.stringify({
          type: 'object',
          properties: {
            verdict: { type: 'string', enum: ['ok_as_is', 'improve', 'ask'] },
            optimized: { type: 'string' },
          },
          required: ['verdict', 'optimized'],
        }),
      },
    });
    const output = res.choices[0]?.message.content ?? '';
    JSON.parse(output);
    return { ok: true, output };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
