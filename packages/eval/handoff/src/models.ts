// Model clients. Zero-budget by default: a local Ollama server or any OpenAI-compatible
// local server (llama.cpp, LM Studio, vLLM). Fake models exist only to test the harness;
// their output is never a benchmark result and reports built from them say so.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { ChatMessage, ChatModel, ChatResult } from './types.ts';

export type ModelSpec =
  | {
      provider: 'ollama';
      model: string;
      baseUrl?: string;
      temperature?: number;
      seed?: number;
      numCtx?: number;
    }
  | {
      provider: 'openai-compatible';
      model: string;
      baseUrl: string;
      /** Name of an environment variable holding an API key, for free-tier hosted endpoints. Never the key itself. */
      apiKeyEnv?: string;
      temperature?: number;
      seed?: number;
      maxTokens?: number;
    }
  | { provider: 'fake'; behaviour: FakeBehaviour };

export type FakeBehaviour = 'retriever' | 'lead-summarizer' | 'keyword-judge' | 'unknown';

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(`${url} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function ollama(spec: Extract<ModelSpec, { provider: 'ollama' }>): ChatModel {
  const base = spec.baseUrl ?? 'http://localhost:11434';
  return {
    id: `ollama:${spec.model}`,
    fake: false,
    async chat(messages) {
      const data = (await postJson(`${base}/api/chat`, {
        model: spec.model,
        messages,
        stream: false,
        options: {
          temperature: spec.temperature ?? 0,
          seed: spec.seed ?? 7,
          ...(spec.numCtx ? { num_ctx: spec.numCtx } : {}),
        },
      })) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
      return {
        text: data.message?.content ?? '',
        ...(data.prompt_eval_count !== undefined ? { promptTokens: data.prompt_eval_count } : {}),
        ...(data.eval_count !== undefined ? { completionTokens: data.eval_count } : {}),
      };
    },
  };
}

function openaiCompatible(spec: Extract<ModelSpec, { provider: 'openai-compatible' }>): ChatModel {
  const key = spec.apiKeyEnv ? process.env[spec.apiKeyEnv] : undefined;
  if (spec.apiKeyEnv && !key) throw new Error(`environment variable ${spec.apiKeyEnv} is not set`);
  return {
    id: `openai-compatible:${spec.model}`,
    fake: false,
    async chat(messages) {
      const data = (await postJson(
        `${spec.baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          model: spec.model,
          messages,
          temperature: spec.temperature ?? 0,
          ...(spec.seed !== undefined ? { seed: spec.seed } : {}),
          ...(spec.maxTokens ? { max_tokens: spec.maxTokens } : {}),
        },
        key ? { authorization: `Bearer ${key}` } : {},
      )) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        text: data.choices?.[0]?.message?.content ?? '',
        ...(data.usage?.prompt_tokens !== undefined
          ? { promptTokens: data.usage.prompt_tokens }
          : {}),
        ...(data.usage?.completion_tokens !== undefined
          ? { completionTokens: data.usage.completion_tokens }
          : {}),
      };
    },
  };
}

// ---- fake models (harness tests only) ------------------------------------

const CONTEXT_RE = /<handoff_context>\n([\s\S]*?)\n<\/handoff_context>/;
const lastUser = (messages: ChatMessage[]): string =>
  [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
const words = (s: string): Set<string> => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);

/** Answers by returning the context line (or code block) with the most word overlap with the question. */
function fakeRetrieve(messages: ChatMessage[]): string {
  const prompt = lastUser(messages);
  const context = CONTEXT_RE.exec(prompt)?.[1];
  const question = prompt.slice(prompt.lastIndexOf('Question:') + 'Question:'.length).trim();
  if (!context) return "I don't know; I have no record of that.";
  const named =
    /`([^`]+)`/.exec(question)?.[1] ??
    question.match(
      /\b[\w.:-]+\.(?:json|ya?ml|sh)\b|\btab:\w+|\b[a-z]+_[a-z]+\b|\b[a-z]+-api\b/,
    )?.[0];
  if (named && /exact|paste|show me/i.test(question)) {
    const block = [...context.matchAll(/```[^\n]*\n[\s\S]*?\n```/g)]
      .map((m) => m[0])
      .find((b) => b.includes(named));
    if (block) return block;
  }
  const q = words(question);
  let best = '';
  let bestScore = 0;
  for (const line of context.split('\n')) {
    const w = words(line);
    let s = 0;
    for (const t of q) if (w.has(t)) s++;
    if (s > bestScore) [best, bestScore] = [line, s];
  }
  return best || "I don't know.";
}

function fakeSummarize(messages: ChatMessage[]): string {
  const text = lastUser(messages).replace(/```[\s\S]*?```/g, ' ');
  const max = Number(/at most (\d+) words/.exec(messages[0]?.content ?? '')?.[1] ?? 150);
  return text.split(/\s+/).filter(Boolean).slice(0, max).join(' ');
}

function fakeJudge(messages: ChatMessage[]): string {
  const p = lastUser(messages);
  const expected = /Expected answer: (.*)/.exec(p)?.[1]?.toLowerCase() ?? '';
  const candidate = /Candidate answer:\n([\s\S]*)/.exec(p)?.[1]?.toLowerCase() ?? '';
  return expected && candidate.includes(expected) ? 'YES' : 'NO';
}

function fake(behaviour: FakeBehaviour): ChatModel {
  const fn = {
    retriever: fakeRetrieve,
    'lead-summarizer': fakeSummarize,
    'keyword-judge': fakeJudge,
    unknown: () => "I don't know.",
  }[behaviour];
  return { id: `fake:${behaviour}`, fake: true, chat: async (m) => ({ text: fn(m) }) };
}

export function createModel(spec: ModelSpec): ChatModel {
  switch (spec.provider) {
    case 'ollama':
      return ollama(spec);
    case 'openai-compatible':
      return openaiCompatible(spec);
    case 'fake':
      return fake(spec.behaviour);
  }
}

/**
 * Wraps a model with an append-only JSONL cache keyed on model id and messages, so an
 * interrupted run can resume without repeating calls. Fake models are never cached.
 */
export function withCache(model: ChatModel, file: string): ChatModel {
  if (model.fake) return model;
  const cache = new Map<string, ChatResult>();
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const { key, result } = JSON.parse(line) as { key: string; result: ChatResult };
      cache.set(key, result);
    }
  }
  return {
    id: model.id,
    fake: false,
    async chat(messages) {
      const key = createHash('sha256')
        .update(JSON.stringify([model.id, messages]))
        .digest('hex');
      const hit = cache.get(key);
      if (hit) return hit;
      const result = await model.chat(messages);
      cache.set(key, result);
      appendFileSync(file, JSON.stringify({ key, result }) + '\n');
      return result;
    },
  };
}
