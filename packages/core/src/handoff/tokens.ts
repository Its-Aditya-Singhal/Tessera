// Cheap, model-independent token estimate. Roughly matches BPE tokenisers on English prose and
// code: words split into ~4-character pieces, punctuation one token each. Scripts such as Tamil
// and Devanagari tokenise worse in most models, so they count one token per 2 characters.
// Based on packages/eval/handoff/src/tokens.ts (identical for Latin-script text).

const PIECE = /[\p{L}\p{M}\p{N}_]+|[^\s\p{L}\p{M}\p{N}_]/gu;
const DENSE_SCRIPT = /[ऀ-෿]/u;

export function approxTokens(text: string): number {
  let n = 0;
  for (const m of text.matchAll(PIECE)) {
    const s = m[0];
    if (/^[^\p{L}\p{M}\p{N}_]$/u.test(s)) n += 1;
    else n += Math.ceil(s.length / (DENSE_SCRIPT.test(s) ? 2 : 4));
  }
  return n;
}
