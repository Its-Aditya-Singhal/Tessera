/**
 * Framework-free view model for the redaction review list. The extension UI
 * renders these rows (a checkbox per row, grouped or flat) and calls
 * `toggleItem` / `toggleType` from ./session on change. Nothing here touches
 * the DOM so it can be unit tested and reused by the popup, side panel and
 * handoff preview alike.
 */
import type { RedactionItem, RedactionResult } from './session';
import type { DetectionType } from './types';

export const TYPE_LABELS: Record<DetectionType, { singular: string; plural: string }> = {
  PRIVATE_KEY: { singular: 'private key', plural: 'private keys' },
  API_KEY: { singular: 'API key', plural: 'API keys' },
  TOKEN: { singular: 'access token', plural: 'access tokens' },
  PASSWORD: { singular: 'password', plural: 'passwords' },
  SECRET: { singular: 'secret', plural: 'secrets' },
  CARD: { singular: 'card number', plural: 'card numbers' },
  AADHAAR: { singular: 'Aadhaar number', plural: 'Aadhaar numbers' },
  EMAIL: { singular: 'email address', plural: 'email addresses' },
  UPI: { singular: 'UPI ID', plural: 'UPI IDs' },
  PHONE: { singular: 'phone number', plural: 'phone numbers' },
  PAN: { singular: 'PAN', plural: 'PANs' },
  IFSC: { singular: 'IFSC code', plural: 'IFSC codes' },
  IP: { singular: 'IP address', plural: 'IP addresses' },
};

// Secret-like values are masked even in the review list so a shoulder-surfer or
// a screenshot does not capture them.
const MASKED_TYPES: ReadonlySet<DetectionType> = new Set(['PRIVATE_KEY', 'API_KEY', 'TOKEN', 'PASSWORD', 'SECRET', 'CARD', 'AADHAAR']);

export interface ReviewRow {
  id: string;
  type: DetectionType;
  label: string;
  placeholder: string;
  /** What the user sees for the original value (masked for secret-like types). */
  preview: string;
  enabled: boolean;
  /** Rows below 0.8 confidence are marked so the UI can say "possible". */
  uncertain: boolean;
  /** Accessible name for the checkbox. */
  ariaLabel: string;
}

export function maskValue(type: DetectionType, value: string): string {
  const flat = value.replace(/\s+/g, ' ');
  if (type === 'PRIVATE_KEY') return '-----BEGIN … PRIVATE KEY-----';
  if (!MASKED_TYPES.has(type)) return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
  if (type === 'CARD' || type === 'AADHAAR') {
    const digits = flat.replace(/\D/g, '');
    return `•••• ${digits.slice(-4)}`;
  }
  if (flat.length <= 8) return '•'.repeat(flat.length);
  return `${flat.slice(0, 4)}…${flat.slice(-2)}`;
}

export function reviewRows(result: RedactionResult): ReviewRow[] {
  return result.items.map((it: RedactionItem) => {
    const label = TYPE_LABELS[it.type].singular;
    const preview = maskValue(it.type, it.original);
    return {
      id: it.id,
      type: it.type,
      label,
      placeholder: it.placeholder,
      preview,
      enabled: it.enabled,
      uncertain: it.confidence < 0.8,
      ariaLabel: `${it.enabled ? 'Redacting' : 'Not redacting'} ${label} ${preview} as ${it.placeholder}`,
    };
  });
}

/** One-line summary for the handoff preview, e.g. "Redacted 2 email addresses and 1 API key". */
export function redactionSummary(result: RedactionResult): string {
  const counts = new Map<DetectionType, number>();
  for (const it of result.items) if (it.enabled) counts.set(it.type, (counts.get(it.type) ?? 0) + 1);
  if (counts.size === 0) return 'Nothing redacted';
  const parts = [...counts].map(([t, n]) => `${n} ${n === 1 ? TYPE_LABELS[t].singular : TYPE_LABELS[t].plural}`);
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Redacted ${joined}`;
}
