// Cheap, model-independent token estimate so token cost is comparable across conditions
// even when the model server does not report usage. Roughly matches BPE tokenisers on
// English prose and code (words split into ~4-character pieces, punctuation one token each).

const PIECE = /[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

export function approxTokens(text: string): number {
  let n = 0;
  for (const m of text.matchAll(PIECE)) {
    const s = m[0];
    n += /^[^\p{L}\p{N}_]$/u.test(s) ? 1 : Math.ceil(s.length / 4);
  }
  return n;
}
