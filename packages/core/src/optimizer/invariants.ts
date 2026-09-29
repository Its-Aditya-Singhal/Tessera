/**
 * Things an optimizer must never drop: numbers, URLs, code fences, quoted strings
 * and redaction placeholders. Small models often "tidy" these away.
 */

export interface InvariantIssue {
  kind: 'number' | 'url' | 'code' | 'quote' | 'placeholder';
  value: string;
}

const URL_RE = /\bhttps?:\/\/[^\s)>\]"']+/g;
const CODE_RE = /```[\s\S]*?```/g;
const QUOTE_RE = /"([^"\n]{1,200})"|“([^”\n]{1,200})”|`([^`\n]{1,200})`/g;
const PLACEHOLDER_RE = /\[[A-Z_]+_\d+\]/g;
const NUMBER_RE = /(?<![\w.])\d+(?:[.,]\d+)*(?![\w])/g;

function items(text: string): InvariantIssue[] {
  const out: InvariantIssue[] = [];
  const code = text.match(CODE_RE) ?? [];
  for (const c of code) out.push({ kind: 'code', value: c });
  const noCode = text.replace(CODE_RE, ' ');
  for (const u of noCode.match(URL_RE) ?? []) out.push({ kind: 'url', value: u });
  for (const p of noCode.match(PLACEHOLDER_RE) ?? []) out.push({ kind: 'placeholder', value: p });
  for (const m of noCode.matchAll(QUOTE_RE))
    out.push({ kind: 'quote', value: (m[1] ?? m[2] ?? m[3])! });
  const noUrls = noCode.replace(URL_RE, ' ').replace(PLACEHOLDER_RE, ' ');
  for (const n of noUrls.match(NUMBER_RE) ?? []) out.push({ kind: 'number', value: n });
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Everything protected in `original` that is missing from `candidate`. */
export function checkInvariants(original: string, candidate: string): InvariantIssue[] {
  const candNorm = norm(candidate);
  const seen = new Set<string>();
  const missing: InvariantIssue[] = [];
  for (const it of items(original)) {
    const key = `${it.kind}:${it.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const needle =
      it.kind === 'code'
        ? norm(it.value.replace(/^```[^\n]*\n?/, '').replace(/```$/, ''))
        : norm(it.value);
    if (!needle) continue;
    if (!candNorm.includes(needle)) missing.push(it);
  }
  return missing;
}

/** Issues that make a rewrite unusable rather than merely worth a warning. */
export function isBlocking(issue: InvariantIssue): boolean {
  return issue.kind === 'code' || issue.kind === 'placeholder' || issue.kind === 'url';
}
