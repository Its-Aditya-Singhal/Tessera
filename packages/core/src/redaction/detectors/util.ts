import type { Detection, DetectionType } from '../types';

/** Run a global regex over `text` and turn each match (or one capture group) into a detection. */
export function scan(
  text: string,
  re: RegExp,
  type: DetectionType,
  detector: string,
  confidence: number | ((match: RegExpMatchArray, start: number, end: number) => number | null),
  group = 0,
): Detection[] {
  const out: Detection[] = [];
  for (const m of text.matchAll(re)) {
    const value = m[group];
    if (value === undefined || value.length === 0 || m.index === undefined) continue;
    const start = group === 0 ? m.index : m.index + m[0].indexOf(value);
    const end = start + value.length;
    const c = typeof confidence === 'number' ? confidence : confidence(m, start, end);
    if (c === null) continue;
    out.push({ type, span: { start, end }, confidence: c, detector });
  }
  return out;
}

/** True when any of `words` appears (case-insensitive) within `window` characters before the span. */
export function hasContext(text: string, start: number, words: RegExp, window = 40): boolean {
  return words.test(text.slice(Math.max(0, start - window), start));
}

export const digitsOnly = (s: string): string => s.replace(/\D/g, '');

/** True when all separators between digit groups are the same (or there are none). */
export function consistentSeparators(s: string): boolean {
  const seps = new Set(s.match(/[^\d]+/g) ?? []);
  return seps.size <= 1;
}
