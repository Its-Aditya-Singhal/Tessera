// Deterministic scoring for tasks with a checkable answer. The same check is
// applied to the answer for the original prompt and for the optimized prompt,
// so any parsing leniency affects both sides equally.

import type { Check } from './types.ts';

export interface CheckResult {
  pass: boolean;
  detail: string;
}

const NUMBER_RE = /-?\d[\d,]*(?:\.\d+)?/g;

function parseNumber(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}

/**
 * Pick the number the answer commits to: the one after an explicit
 * "answer"/"=" marker or inside \boxed{}/bold if present, else the last number.
 */
export function extractFinalNumber(text: string): number | null {
  const boxed = /\\boxed\{\s*(-?\d[\d,]*(?:\.\d+)?)\s*\}/.exec(text);
  if (boxed?.[1]) return parseNumber(boxed[1]);
  const marked = [
    ...text.matchAll(
      /(?:final answer|answer|उत्तर|जवाब|விடை|பதில்)\s*(?:is|:|=|है|-)?\s*\**\s*[$₹]?\s*(-?\d[\d,]*(?:\.\d+)?)/gi,
    ),
  ];
  const lastMarked = marked.at(-1)?.[1];
  if (lastMarked) return parseNumber(lastMarked);
  const bold = [...text.matchAll(/\*\*[^*\d-]*(-?\d[\d,]*(?:\.\d+)?)[^*]*\*\*/g)];
  const lastBold = bold.at(-1)?.[1];
  if (lastBold) return parseNumber(lastBold);
  const all = text.match(NUMBER_RE);
  const last = all?.at(-1);
  return last ? parseNumber(last) : null;
}

/** Strip a single surrounding ```json fence, which models add even when told not to. */
export function stripFence(text: string): string {
  const m = /^\s*```[a-zA-Z]*\s*\n([\s\S]*?)\n?```\s*$/.exec(text);
  return m?.[1] ?? text.trim();
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

export function countBullets(text: string): number {
  return text.split('\n').filter((l) => /^\s*(?:[-*•]|\d+[.)])\s+\S/.test(l)).length;
}

const SCRIPT_RE = {
  tamil: /\p{Script=Tamil}/u,
  devanagari: /\p{Script=Devanagari}/u,
  latin: /\p{Script=Latin}/u,
} as const;

/** Share of letters and combining marks (ignoring digits, punctuation, spaces) written in `script`. Marks count so Indic vowel signs are not dropped. */
export function scriptRatio(text: string, script: keyof typeof SCRIPT_RE): number {
  const letters = [...text].filter((ch) => /[\p{L}\p{M}]/u.test(ch));
  if (letters.length === 0) return 0;
  const re = SCRIPT_RE[script];
  return letters.filter((ch) => re.test(ch)).length / letters.length;
}

function includes(hay: string, needle: string, caseSensitive: boolean | undefined): boolean {
  return caseSensitive ? hay.includes(needle) : hay.toLowerCase().includes(needle.toLowerCase());
}

export function runCheck(check: Check, answer: string): CheckResult {
  switch (check.type) {
    case 'numeric': {
      const got = extractFinalNumber(answer);
      const tol = check.tolerance ?? 1e-6;
      const pass = got !== null && Math.abs(got - check.answer) <= tol;
      return { pass, detail: `expected ${check.answer}, got ${got ?? 'no number'}` };
    }
    case 'contains': {
      const hit = check.anyOf.find((s) => includes(answer, s, check.caseSensitive));
      return {
        pass: hit !== undefined,
        detail: hit ? `found "${hit}"` : `none of ${JSON.stringify(check.anyOf)}`,
      };
    }
    case 'notContains': {
      const hit = check.noneOf.find((s) => includes(answer, s, check.caseSensitive));
      return { pass: hit === undefined, detail: hit ? `found forbidden "${hit}"` : 'ok' };
    }
    case 'regex': {
      const pass = new RegExp(check.pattern, check.flags ?? '').test(answer);
      return {
        pass,
        detail: `${pass ? 'matched' : 'no match for'} /${check.pattern}/${check.flags ?? ''}`,
      };
    }
    case 'json': {
      let parsed: unknown;
      try {
        parsed = JSON.parse(stripFence(answer));
      } catch {
        return { pass: false, detail: 'not valid JSON' };
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { pass: !check.requiredKeys?.length, detail: 'JSON is not an object' };
      }
      const missing = (check.requiredKeys ?? []).filter((k) => !(k in parsed));
      return {
        pass: missing.length === 0,
        detail: missing.length ? `missing keys ${missing.join(', ')}` : 'ok',
      };
    }
    case 'wordCount': {
      const n = countWords(answer);
      const pass =
        (check.min === undefined || n >= check.min) && (check.max === undefined || n <= check.max);
      return { pass, detail: `${n} words` };
    }
    case 'bulletCount': {
      const n = countBullets(answer);
      const pass =
        (check.exact === undefined || n === check.exact) &&
        (check.min === undefined || n >= check.min) &&
        (check.max === undefined || n <= check.max);
      return { pass, detail: `${n} bullets` };
    }
    case 'script': {
      const r = scriptRatio(answer, check.script);
      return { pass: r >= check.minRatio, detail: `${(r * 100).toFixed(0)}% ${check.script}` };
    }
    case 'all': {
      const results = check.checks.map((c) => runCheck(c, answer));
      const failed = results.filter((r) => !r.pass);
      return {
        pass: failed.length === 0,
        detail: results.map((r) => `${r.pass ? 'ok' : 'FAIL'}: ${r.detail}`).join('; '),
      };
    }
  }
}
