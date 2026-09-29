import { shannonEntropy } from '../checksums';
import type { Detection, Detector } from '../types';
import { scan } from './util';

// Known-prefix credentials. Prefixes checked against vendor docs in Sept 2026;
// see docs/benchmarks/redaction.md for sources and known gaps.
const KNOWN_KEYS: readonly { name: string; re: RegExp; confidence: number }[] = [
  // Anthropic before OpenAI so `sk-ant-` gets the more specific name (both are API_KEY).
  { name: 'anthropic-key', re: /(?<![\w-])sk-ant-[A-Za-z0-9_-]{20,}/g, confidence: 0.99 },
  {
    name: 'openai-key',
    re: /(?<![\w-])sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g,
    confidence: 0.95,
  },
  { name: 'stripe-key', re: /(?<!\w)(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g, confidence: 0.98 },
  { name: 'github-token', re: /(?<!\w)gh[pousr]_[A-Za-z0-9]{36,255}(?!\w)/g, confidence: 0.99 },
  { name: 'github-pat', re: /(?<!\w)github_pat_[A-Za-z0-9_]{40,255}/g, confidence: 0.99 },
  { name: 'aws-access-key', re: /(?<![A-Z0-9])(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}(?![A-Z0-9])/g, confidence: 0.95 },
  { name: 'google-api-key', re: /(?<![\w-])AIza[0-9A-Za-z_-]{35}(?![\w-])/g, confidence: 0.95 },
  { name: 'slack-token', re: /(?<!\w)xox[abposr]-[A-Za-z0-9-]{10,}/g, confidence: 0.97 },
  { name: 'slack-app-token', re: /(?<!\w)xapp-\d-[A-Za-z0-9]+-\d+-[A-Za-z0-9]+/g, confidence: 0.97 },
  {
    name: 'slack-webhook',
    re: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g,
    confidence: 0.97,
  },
  { name: 'huggingface-token', re: /(?<!\w)hf_[A-Za-z0-9]{30,}(?!\w)/g, confidence: 0.9 },
];

const JWT_RE = /(?<![\w-])eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}/g;

const PRIVATE_KEY_RE =
  /-----BEGIN ((?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?)-----[\s\S]*?(?:-----END \1-----|$)/g;

// `password = "..."`, `api_key: ...`, `DB_PASSWORD=...`, `?token=...`. Only the value is redacted.
// The keyword may follow `_` or `-` (DB_PASSWORD, client-secret) since those are not alphanumeric.
const ASSIGNMENT_RE =
  /(?<![A-Za-z0-9])((?:password|passwd|pwd|passphrase|pass|secret|api[_-]?key|apikey|access[_-]?key|auth[_-]?token|access[_-]?token|token|client[_-]?secret|private[_-]?key))(?![A-Za-z0-9])["']?\s*(:=|=|:)\s*(?:(["'`])([^"'`\n]{4,200})\3|([^\s"'`,;&)}\]]{4,200}))/gi;

const PASSWORD_KEY_RE = /pass|pwd/i;

// Values that are obviously templates or references, not secrets.
const PLACEHOLDER_VALUE_RE =
  /^(?:\$\{|\$[A-Z_][A-Z0-9_]*$|<[^>]*>?$|\{\{|\{[A-Za-z_]+\}$|%\(|%[A-Z_]+%$|\*+$|\[[A-Z_]+_\d+\]$|process\.env|os\.environ|env\(|getenv|null$|none$|nil$|undefined$|true$|false$|required$|optional$|string$|str$|your[_-]|xxx+|\.\.\.|example$|placeholder$|redacted$|changeme$)/i;

function assignmentDetector(text: string): Detection[] {
  const out: Detection[] = [];
  for (const m of text.matchAll(ASSIGNMENT_RE)) {
    const key = m[1]!;
    const sep = m[2]!;
    const quote = m[3] ?? '';
    const value = m[4] ?? m[5]!;
    if (PLACEHOLDER_VALUE_RE.test(value)) continue;
    // `password: required` in prose. With a colon and no quotes, insist on a non-letter
    // character so ordinary words after a colon are not flagged.
    if (sep === ':' && quote === '' && /^[A-Za-z]+$/.test(value)) continue;
    // Function calls and member access (`token = getToken()`, `key: self.key`).
    if (/[()]/.test(value) || /^[a-z_]+\.[a-z_.]+$/i.test(value)) continue;
    const start = m.index! + m[0].length - quote.length - value.length;
    out.push({
      type: PASSWORD_KEY_RE.test(key) ? 'PASSWORD' : 'SECRET',
      span: { start, end: start + value.length },
      confidence: 0.85,
      detector: 'assignment',
    });
  }
  return out;
}

// Generic high-entropy strings: base64/base62-ish runs of 24+ characters mixing
// upper, lower and digits. Pure hex (git SHAs, hashes) and UUIDs are left alone
// on purpose: they are everywhere in code chats and rarely secret on their own.
// Hex secrets are still caught when assigned to a secret-looking key.
const CANDIDATE_RE = /(?<![A-Za-z0-9+/_=-])[A-Za-z0-9+/_=-]{24,512}(?![A-Za-z0-9+/_=-])/g;

function entropyDetector(text: string): Detection[] {
  const out: Detection[] = [];
  for (const m of text.matchAll(CANDIDATE_RE)) {
    const s = m[0];
    const start = m.index!;
    const core = s.replace(/=+$/, '');
    if (/^[0-9a-f-]+$/i.test(core)) continue; // hex, UUIDs
    if (/^sha(?:256|384|512)-/.test(core)) continue; // Subresource Integrity / lockfile hashes
    if (!/[A-Z]/.test(core) || !/[a-z]/.test(core) || !/\d/.test(core)) continue;
    // Paths and URL segments: `src/components/UserProfile2/index`.
    if (core.includes('/') && /\/[a-z]{3,}/.test(core) && (core.match(/\//g)?.length ?? 0) >= 2) continue;
    // Identifiers: long camelCase / snake_case names have long lowercase runs.
    if (/[a-z]{6,}/.test(core) && shannonEntropy(core) < 4.3) continue;
    // Preceded by a URL-ish context (`?v=`, `/`): part of a link, not free-standing.
    const prev = text[start - 1];
    if (prev === '/' || prev === '.') continue;
    const h = shannonEntropy(core);
    const threshold = core.length >= 40 ? 4.2 : 4.0;
    if (h < threshold) continue;
    out.push({
      type: 'SECRET',
      span: { start, end: start + s.length },
      confidence: h >= 4.5 ? 0.7 : 0.6,
      detector: 'high-entropy',
    });
  }
  return out;
}

export const secretDetectors: readonly Detector[] = [
  (text) =>
    KNOWN_KEYS.flatMap((k) =>
      // AWS documents its sample key id with an EXAMPLE suffix; it is not a credential.
      scan(text, k.re, 'API_KEY', k.name, (m) => (m[0].endsWith('EXAMPLE') ? null : k.confidence)),
    ),
  (text) => scan(text, JWT_RE, 'TOKEN', 'jwt', 0.95),
  (text) => scan(text, PRIVATE_KEY_RE, 'PRIVATE_KEY', 'private-key-block', 0.99),
  assignmentDetector,
  entropyDetector,
];
