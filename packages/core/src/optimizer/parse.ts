import type { GateVerdict } from './gate';

export interface OptimizerOutput {
  verdict: GateVerdict;
  optimized: string;
  changes: string[];
  questions: string[];
}

const VERDICTS: GateVerdict[] = ['ok_as_is', 'improve', 'ask'];

function coerce(obj: unknown): OptimizerOutput | undefined {
  if (typeof obj !== 'object' || obj === null) return undefined;
  const o = obj as Record<string, unknown>;
  const verdict =
    typeof o.verdict === 'string'
      ? (o.verdict
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, '_') as GateVerdict)
      : undefined;
  if (!verdict || !VERDICTS.includes(verdict)) return undefined;
  const optimized =
    typeof o.optimized === 'string' ? o.optimized : typeof o.prompt === 'string' ? o.prompt : '';
  if (verdict === 'improve' && !optimized.trim()) return undefined;
  const strs = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
      : [];
  return {
    verdict,
    optimized,
    changes: strs(o.changes).slice(0, 6),
    questions: strs(o.questions).slice(0, 2),
  };
}

/** Finds the first balanced {...} object in text, respecting strings. */
function firstJsonObject(text: string): string | undefined {
  const start = text.indexOf('{');
  if (start < 0) return undefined;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return undefined;
}

/**
 * Tolerant parser for small-model output: strict JSON, JSON wrapped in prose or
 * code fences, or a delimiter format (VERDICT: / OPTIMIZED: / CHANGES:).
 */
export function parseOptimizerOutput(raw: string): OptimizerOutput | undefined {
  const text = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  for (const candidate of [text, firstJsonObject(text)]) {
    if (!candidate) continue;
    try {
      const parsed = coerce(JSON.parse(candidate));
      if (parsed) return parsed;
    } catch {
      /* try the next form */
    }
  }
  const verdict = /VERDICT:\s*(ok_as_is|improve|ask)/i.exec(raw)?.[1];
  const optimized = /OPTIMIZED:\s*([\s\S]*?)(?:\n(?:CHANGES|QUESTIONS):|$)/i.exec(raw)?.[1];
  if (verdict) {
    const list = (label: string) =>
      (new RegExp(`${label}:\\s*([\\s\\S]*?)(?:\\n[A-Z]+:|$)`, 'i').exec(raw)?.[1] ?? '')
        .split('\n')
        .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
        .filter(Boolean);
    return coerce({
      verdict,
      optimized: optimized?.trim() ?? '',
      changes: list('CHANGES'),
      questions: list('QUESTIONS'),
    });
  }
  return undefined;
}
