export interface DiffOp {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

/** Splits into words and the whitespace/punctuation between them, so a diff can be re-joined exactly. */
export function tokenize(text: string): string[] {
  return text.match(/[\p{L}\p{N}_'’-]+|\s+|[^\s\p{L}\p{N}_]/gu) ?? [];
}

/**
 * Word-level diff (LCS). Falls back to a single delete+insert for very large
 * inputs so the UI never stalls.
 */
export function wordDiff(a: string, b: string, maxCells = 4_000_000): DiffOp[] {
  const x = tokenize(a);
  const y = tokenize(b);
  if (x.length * y.length > maxCells) {
    return [
      ...(a ? [{ type: 'delete' as const, text: a }] : []),
      ...(b ? [{ type: 'insert' as const, text: b }] : []),
    ];
  }
  const n = x.length;
  const m = y.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = x[i] === y[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  const push = (type: DiffOp['type'], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.text += text;
    else ops.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      push('equal', x[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      push('delete', x[i++]!);
    } else {
      push('insert', y[j++]!);
    }
  }
  while (i < n) push('delete', x[i++]!);
  while (j < m) push('insert', y[j++]!);
  return ops;
}
