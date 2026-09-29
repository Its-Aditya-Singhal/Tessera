// Deterministic scoring. An optional judge model (see runner.ts) can rescue paraphrased
// fact/decision answers, but the strict scores below are always reported.

import { extractCodeBlocks } from './dataset/generate.ts';
import type { CodeBlock, Question } from './types.ts';

export function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** True if `needle` occurs in `hay` without being glued to other letters or digits (so "13" is not found in "130"). */
export function containsTerm(hay: string, needle: string): boolean {
  const h = normalize(hay);
  const n = normalize(needle);
  if (!n) return false;
  for (let i = h.indexOf(n); i !== -1; i = h.indexOf(n, i + 1)) {
    const before = h[i - 1];
    const after = h[i + n.length];
    const startsWord = WORD_CHAR.test(n[0] ?? '');
    const endsWord = WORD_CHAR.test(n[n.length - 1] ?? '');
    if (
      (!startsWord || !before || !WORD_CHAR.test(before)) &&
      (!endsWord || !after || !WORD_CHAR.test(after))
    ) {
      return true;
    }
  }
  return false;
}

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'at',
  'of',
  'for',
  'on',
  'in',
  'with',
  'by',
  'and',
  'or',
  'it',
  'we',
  'our',
]);

function contentWords(s: string): string[] {
  return normalize(s)
    .split(/[^\p{L}\p{N}.-]+/u)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((w) => w && !STOPWORDS.has(w));
}

/** Every content word of `phrase` appears in `text`, in any order. Tolerates light paraphrase of option names. */
export function mentionsPhrase(text: string, phrase: string): boolean {
  const words = contentWords(phrase);
  return words.length > 0 && words.every((w) => containsTerm(text, w));
}

export interface AnswerScore {
  correct: boolean;
  /** Decisions only: the answer gives the superseded choice and not the final one. */
  stale?: boolean;
  /** Code only: an answer code block equals the planted block (line endings and trailing whitespace ignored). */
  codeExact?: boolean;
  /** Code only: equal after removing all whitespace. */
  codeLoose?: boolean;
}

export function canonicalCode(code: string): string {
  return code
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
}

const squash = (s: string): string => s.replace(/\s+/g, '');

export function scoreCode(
  answer: string,
  expected: CodeBlock,
): { codeExact: boolean; codeLoose: boolean } {
  const want = canonicalCode(expected.code);
  const blocks = extractCodeBlocks(answer.replace(/\r\n?/g, '\n')).map((b) =>
    canonicalCode(b.code),
  );
  const codeExact = blocks.some((b) => b === want) || canonicalCode(answer).includes(want);
  const codeLoose =
    codeExact ||
    blocks.some((b) => squash(b) === squash(want)) ||
    squash(answer).includes(squash(want));
  return { codeExact, codeLoose };
}

export function scoreAnswer(answer: string, q: Question): AnswerScore {
  switch (q.kind) {
    case 'fact':
      return { correct: q.accept.some((a) => containsTerm(answer, a)) };
    case 'decision': {
      const correct = q.accept.some((a) => mentionsPhrase(answer, a));
      return q.stale === undefined
        ? { correct }
        : { correct, stale: !correct && mentionsPhrase(answer, q.stale) };
    }
    case 'code': {
      if (!q.code) throw new Error(`code question ${q.id} has no code`);
      const s = scoreCode(answer, q.code);
      return { correct: s.codeExact, ...s };
    }
  }
}

/** Model-free check: does the handoff context itself still carry what the question needs? */
export function contextCarries(context: string, q: Question): boolean {
  if (q.kind === 'code')
    return q.code !== undefined && canonicalCode(context).includes(canonicalCode(q.code.code));
  if (q.kind === 'decision') return q.accept.some((a) => mentionsPhrase(context, a));
  return q.accept.some((a) => containsTerm(context, a));
}
