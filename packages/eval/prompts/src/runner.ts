// Orchestrates one benchmark run: optimize each prompt, answer both versions
// with the fixed target model, judge the pair twice (swapped), and score
// checkable tasks.

import { runCheck, countWords, type CheckResult } from './checks.ts';
import { JsonlCache, cacheKey } from './cache.ts';
import { judgePair, type PairwiseResult } from './judge.ts';
import { normalizeResult } from './optimizer.ts';
import type { EvalConfig } from './config.ts';
import type {
  GenerateResult,
  ModelClient,
  OptimizeResult,
  Outcome,
  PromptItem,
  PromptOptimizer,
} from './types.ts';

export interface AnswerRecord {
  text: string;
  chars: number;
  words: number;
  completionTokens?: number;
}

export interface ItemResult {
  id: string;
  category: PromptItem['category'];
  lang: PromptItem['lang'];
  style: PromptItem['style'];
  original: string;
  optimizer: OptimizeResult;
  /** False when the optimizer left the prompt alone (ok_as_is / ask) - no answers are generated. */
  rewritten: boolean;
  answers?: { original: AnswerRecord; optimized: AnswerRecord };
  judge?: PairwiseResult;
  /** ln(optimized answer chars / original answer chars). */
  lengthLogRatio?: number;
  check?: { original: CheckResult; optimized: CheckResult; outcome: Outcome };
  error?: string;
}

export interface RunDeps {
  target: ModelClient;
  judge: ModelClient;
  optimizer: PromptOptimizer;
  /** Null disables on-disk caching (tests). */
  cacheFile: string | null;
  onProgress?: (done: number, total: number, item: ItemResult) => void;
}

function answerRecord(r: GenerateResult): AnswerRecord {
  return {
    text: r.text,
    chars: r.text.length,
    words: countWords(r.text),
    completionTokens: r.completionTokens,
  };
}

export function checkOutcome(orig: boolean, opt: boolean): Outcome {
  if (opt && !orig) return 'win';
  if (orig && !opt) return 'loss';
  return 'tie';
}

export function selectItems(items: PromptItem[], filter: EvalConfig['filter']): PromptItem[] {
  if (!filter) return items;
  let out = items.filter(
    (it) =>
      (!filter.categories?.length || filter.categories.includes(it.category)) &&
      (!filter.langs?.length || filter.langs.includes(it.lang)) &&
      (!filter.styles?.length || filter.styles.includes(it.style)) &&
      (!filter.ids?.length || filter.ids.includes(it.id)),
  );
  if (filter.limit !== undefined) out = out.slice(0, filter.limit);
  return out;
}

async function pool<T, R>(
  inputs: T[],
  limit: number,
  fn: (x: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(inputs.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, inputs.length)) }, async () => {
    while (next < inputs.length) {
      const i = next++;
      out[i] = await fn(inputs[i] as T, i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** One tiny call per model so an unreachable server fails the run up front, not item by item. */
export async function preflight(models: ModelClient[]): Promise<void> {
  for (const m of models) {
    try {
      await m.generate({
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        temperature: 0,
        maxTokens: 4,
      });
    } catch (e) {
      const hint = m.id.startsWith('ollama:')
        ? ` Is Ollama running (\`ollama serve\`) and is the model pulled (\`ollama pull ${m.id.slice('ollama:'.length)}\`)?`
        : '';
      throw new Error(`Model ${m.id} is not reachable: ${(e as Error).message}.${hint}`, {
        cause: e,
      });
    }
  }
}

export async function runBenchmark(
  items: PromptItem[],
  config: EvalConfig,
  deps: RunDeps,
): Promise<ItemResult[]> {
  const cache = new JsonlCache<unknown>(deps.cacheFile);
  const { target, judge, optimizer } = deps;
  const gen = config.generation;
  let done = 0;

  const generate = (prompt: string) =>
    cache.getOrCompute(cacheKey(['gen', target.id, prompt, gen]), () =>
      target.generate({
        messages: [{ role: 'user', content: prompt }],
        temperature: gen.temperature,
        maxTokens: gen.maxTokens,
        seed: gen.seed,
      }),
    ) as Promise<GenerateResult>;

  return pool(items, config.concurrency, async (item) => {
    const base = {
      id: item.id,
      category: item.category,
      lang: item.lang,
      style: item.style,
      original: item.prompt,
    };
    let result: ItemResult;
    try {
      const raw = (await cache.getOrCompute(
        cacheKey(['opt', optimizer.id, item.prompt, item.lang]),
        () => optimizer.optimize(item.prompt, { lang: item.lang }),
      )) as OptimizeResult;
      const opt = normalizeResult(item.prompt, raw);
      if (opt.verdict !== 'improve') {
        result = { ...base, optimizer: opt, rewritten: false };
      } else {
        const [a0, a1] = await Promise.all([generate(item.prompt), generate(opt.optimized)]);
        const original = answerRecord(a0);
        const optimized = answerRecord(a1);
        const judged = (await cache.getOrCompute(
          cacheKey(['judge', judge.id, item.prompt, original.text, optimized.text, config.judging]),
          () =>
            judgePair(judge, item.prompt, original.text, optimized.text, {
              maxTokens: config.judging.maxTokens,
              seed: config.judging.seed,
              retries: config.judging.retries,
            }),
        )) as PairwiseResult;
        result = {
          ...base,
          optimizer: opt,
          rewritten: true,
          answers: { original, optimized },
          judge: judged,
          lengthLogRatio: Math.log((optimized.chars + 1) / (original.chars + 1)),
        };
        if (item.check) {
          const c0 = runCheck(item.check, original.text);
          const c1 = runCheck(item.check, optimized.text);
          result.check = { original: c0, optimized: c1, outcome: checkOutcome(c0.pass, c1.pass) };
        }
      }
    } catch (e) {
      result = {
        ...base,
        optimizer: { verdict: 'ok_as_is', optimized: item.prompt },
        rewritten: false,
        error: (e as Error).message,
      };
    }
    done++;
    deps.onProgress?.(done, items.length, result);
    return result;
  });
}
