// Shared types for the prompt-quality benchmark.

export const CATEGORIES = ['coding', 'writing', 'summarizing', 'reasoning', 'format'] as const;
export type Category = (typeof CATEGORIES)[number];

export const LANGS = ['en', 'ta', 'hi', 'hinglish'] as const;
export type Lang = (typeof LANGS)[number];

/**
 * How well-specified the original prompt already is. Lets the report show where
 * optimizing helps (vague prompts) and where it hurts (already-good prompts),
 * which is what the gate (M6) is tuned on.
 */
export const STYLES = ['vague', 'typical', 'well-specified'] as const;
export type PromptStyle = (typeof STYLES)[number];

/** Deterministic checks for tasks with a verifiable answer. */
export type Check =
  | { type: 'numeric'; answer: number; tolerance?: number }
  | { type: 'contains'; anyOf: string[]; caseSensitive?: boolean }
  | { type: 'notContains'; noneOf: string[]; caseSensitive?: boolean }
  | { type: 'regex'; pattern: string; flags?: string }
  | { type: 'json'; requiredKeys?: string[] }
  | { type: 'wordCount'; min?: number; max?: number }
  | { type: 'bulletCount'; exact?: number; min?: number; max?: number }
  | { type: 'script'; script: 'tamil' | 'devanagari' | 'latin'; minRatio: number }
  | { type: 'all'; checks: Check[] };

export interface PromptItem {
  id: string;
  category: Category;
  lang: Lang;
  style: PromptStyle;
  prompt: string;
  /** Present only for tasks with a checkable answer. */
  check?: Check;
  notes?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateRequest {
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  seed?: number;
  /** Ask the backend for JSON output when it supports it. */
  json?: boolean;
}

export interface GenerateResult {
  text: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface ModelClient {
  /** Stable identifier recorded in results, e.g. `ollama:qwen2.5:1.5b-instruct`. */
  readonly id: string;
  generate(req: GenerateRequest): Promise<GenerateResult>;
}

export type OptimizerVerdict = 'ok_as_is' | 'improve' | 'ask';

export interface OptimizeResult {
  verdict: OptimizerVerdict;
  /** Equal to the original when verdict is not `improve`. */
  optimized: string;
  questions?: string[];
}

/**
 * The contract the M4 optimizer must satisfy to be benchmarked. Kept small on
 * purpose so the real implementation in packages/core can be adapted with a
 * few lines (see `optimizer.module` in the config).
 */
export interface PromptOptimizer {
  readonly id: string;
  optimize(prompt: string, opts: { lang: Lang }): Promise<OptimizeResult>;
}

/** Judge preference for a single ordering. */
export type JudgeVote = 'A' | 'B' | 'tie';
/** Outcome from the optimized prompt's point of view. */
export type Outcome = 'win' | 'tie' | 'loss';
