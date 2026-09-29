// Model backends. All are local or free by default: Ollama on localhost, any
// OpenAI-compatible server (llama.cpp, LM Studio, vLLM, or a free-tier API the
// user configures), and a deterministic fake used by tests and `--fake` runs.

import { createHash } from 'node:crypto';
import type { GenerateRequest, GenerateResult, ModelClient } from './types.ts';

export type ModelConfig =
  | { provider: 'ollama'; model: string; baseUrl?: string; timeoutMs?: number }
  | {
      provider: 'openai-compatible';
      model: string;
      baseUrl: string;
      /** Name of the env var holding the API key; never put the key itself in the config. */
      apiKeyEnv?: string;
      /** Send response_format json_object when a JSON answer is wanted. Not every server supports it. */
      jsonMode?: boolean;
      timeoutMs?: number;
    }
  | { provider: 'fake'; model?: string; behavior?: FakeBehavior };

export type FakeBehavior = 'echo' | 'hash-judge' | 'always-A';

const DEFAULT_TIMEOUT_MS = 180_000;

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`${url} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
        // 4xx other than rate limiting will not get better on retry.
        if (res.status < 500 && res.status !== 429) throw Object.assign(err, { fatal: true });
        throw err;
      }
      return await res.json();
    } catch (err) {
      if ((err as { fatal?: boolean }).fatal) throw err;
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastErr;
}

class OllamaClient implements ModelClient {
  readonly id: string;
  private readonly cfg: Extract<ModelConfig, { provider: 'ollama' }>;
  constructor(cfg: Extract<ModelConfig, { provider: 'ollama' }>) {
    this.cfg = cfg;
    this.id = `ollama:${cfg.model}`;
  }
  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const base = (this.cfg.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
    const data = (await postJson(
      `${base}/api/chat`,
      {
        model: this.cfg.model,
        messages: req.messages,
        stream: false,
        ...(req.json ? { format: 'json' } : {}),
        options: {
          temperature: req.temperature,
          num_predict: req.maxTokens,
          ...(req.seed !== undefined ? { seed: req.seed } : {}),
        },
      },
      {},
      this.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
    return {
      text: data.message?.content ?? '',
      promptTokens: data.prompt_eval_count,
      completionTokens: data.eval_count,
    };
  }
}

class OpenAICompatibleClient implements ModelClient {
  readonly id: string;
  private readonly cfg: Extract<ModelConfig, { provider: 'openai-compatible' }>;
  constructor(cfg: Extract<ModelConfig, { provider: 'openai-compatible' }>) {
    this.cfg = cfg;
    this.id = `openai-compatible:${cfg.model}`;
  }
  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const headers: Record<string, string> = {};
    if (this.cfg.apiKeyEnv) {
      const key = process.env[this.cfg.apiKeyEnv];
      if (!key) throw new Error(`Environment variable ${this.cfg.apiKeyEnv} is not set`);
      headers.authorization = `Bearer ${key}`;
    }
    const data = (await postJson(
      `${this.cfg.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        model: this.cfg.model,
        messages: req.messages,
        temperature: req.temperature,
        max_tokens: req.maxTokens,
        ...(req.seed !== undefined ? { seed: req.seed } : {}),
        ...(req.json && this.cfg.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      },
      headers,
      this.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    };
  }
}

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * Deterministic stand-in for a model. Never produces a publishable result:
 * - `echo`: answers with a fixed transformation of the last user message.
 * - `hash-judge`: votes for whichever answer has the smaller hash, so the
 *   preference is stable across position swaps.
 * - `always-A`: a maximally position-biased judge (both orderings say A).
 */
export class FakeClient implements ModelClient {
  readonly id: string;
  calls = 0;
  private readonly behavior: FakeBehavior;
  constructor(behavior: FakeBehavior = 'echo', name: string = behavior) {
    this.behavior = behavior;
    this.id = `fake:${name}`;
  }
  async generate(req: GenerateRequest): Promise<GenerateResult> {
    this.calls++;
    const user = req.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    if (this.behavior === 'always-A') return { text: '{"reason": "fake", "winner": "A"}' };
    if (this.behavior === 'hash-judge') {
      const a = /\[Answer A\]\n([\s\S]*?)\n\[End of answer A\]/.exec(user)?.[1] ?? '';
      const b = /\[Answer B\]\n([\s\S]*?)\n\[End of answer B\]/.exec(user)?.[1] ?? '';
      const winner = a === b ? 'tie' : hash(a) < hash(b) ? 'A' : 'B';
      return { text: JSON.stringify({ reason: 'fake', winner }) };
    }
    return { text: `FAKE ANSWER ${hash(user).slice(0, 8)}: ${user.slice(0, 200)}` };
  }
}

export function createModel(cfg: ModelConfig): ModelClient {
  switch (cfg.provider) {
    case 'ollama':
      return new OllamaClient(cfg);
    case 'openai-compatible':
      return new OpenAICompatibleClient(cfg);
    case 'fake':
      return new FakeClient(cfg.behavior ?? 'echo', cfg.model);
  }
}
