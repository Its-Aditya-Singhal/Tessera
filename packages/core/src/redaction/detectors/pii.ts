import { luhnValid } from '../checksums';
import type { Detection, Detector } from '../types';
import { consistentSeparators, digitsOnly, hasContext, scan } from './util';

const EMAIL_RE =
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,63})@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}(?![A-Za-z0-9-])/g;

// ---------------------------------------------------------------- phones

const PHONE_CONTEXT = /\b(?:phone|mobile|mob|cell|call|contact|whatsapp|tel|ph|sms|reach)\b/i;

// Indian mobile: optional +91 / 0091 / 0 prefix, 10 digits starting 6-9, grouped 10, 5+5 or 3+3+4.
const IN_MOBILE_RE =
  /(?<![\w+])(?:(?:\+|00)91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\w)|(?<![\w+])(?:(?:\+|00)91[\s-]?)?[6-9]\d{2}[\s-]\d{3}[\s-]\d{4}(?!\w)/g;

// International with an explicit + country code: 8 to 15 digits in groups.
const INTL_RE = /(?<![\w+])\+(?!91)[1-9]\d{0,2}(?:[\s.-]?\(?\d{1,4}\)?){2,5}(?![\d])/g;

// North American style with separators: (415) 555-0132, 415-555-0132, 415.555.0132.
const NANP_RE =
  /(?<![\d-])(?:\(\s?[2-9]\d{2}\s?\)\s?|[2-9]\d{2}[-.\s])[2-9]\d{2}[-.\s]\d{4}(?![\d-])/g;

// Indian landline with STD code: 022-2345 6789, 080 41234567.
const IN_LANDLINE_RE = /(?<![\d-])0[1-9]\d{1,3}[\s-]\d{3,4}[\s-]?\d{4}(?![\d-])/g;

function phoneDetector(text: string): Detection[] {
  const out: Detection[] = [];
  out.push(
    ...scan(text, IN_MOBILE_RE, 'PHONE', 'phone-in-mobile', (m, start) => {
      const v = m[0];
      const prefixed = /^(?:\+|00)91|^0/.test(v);
      if (prefixed) return 0.95;
      // Bare 10 digits: fine when grouped or with context, weaker otherwise.
      if (/[\s-]/.test(v)) return 0.85;
      return hasContext(text, start, PHONE_CONTEXT) ? 0.9 : 0.6;
    }),
  );
  out.push(
    ...scan(text, INTL_RE, 'PHONE', 'phone-intl', (m) => {
      const n = digitsOnly(m[0]).length;
      return n >= 8 && n <= 15 ? 0.85 : null;
    }),
  );
  out.push(
    ...scan(text, NANP_RE, 'PHONE', 'phone-nanp', (m, start) => {
      if (!consistentSeparators(m[0].replace(/^\(\s?(\d{3})\s?\)\s?/, '$1-'))) return null;
      return hasContext(text, start, PHONE_CONTEXT) ? 0.9 : 0.7;
    }),
  );
  out.push(
    ...scan(text, IN_LANDLINE_RE, 'PHONE', 'phone-in-landline', (m, start) => {
      const n = digitsOnly(m[0]).length;
      if (n < 10 || n > 11) return null;
      return hasContext(text, start, PHONE_CONTEXT) ? 0.85 : 0.6;
    }),
  );
  return out;
}

// ---------------------------------------------------------------- cards

const CARD_RE = /(?<![\w-])\d(?:[ -]?\d){12,18}(?![\w-])/g;

// Issuer prefixes (IIN ranges) for the networks common in India and elsewhere.
const CARD_PREFIX_RE =
  /^(?:4|5[1-5]|2(?:2[2-9]|[3-6]\d|7[01]|720)|3[47]|6011|64[4-9]|65|3(?:0[0-5]|[68])|35|60|81|82|508|6521|6522|62)/;

function cardDetector(text: string): Detection[] {
  return scan(text, CARD_RE, 'CARD', 'card-luhn', (m, start) => {
    const raw = m[0];
    const d = digitsOnly(raw);
    if (d.length < 13 || d.length > 19) return null;
    if (!consistentSeparators(raw)) return null;
    if (!luhnValid(d)) return null;
    if (/^(\d)\1+$/.test(d)) return null; // 0000..., 1111...
    const knownIssuer = CARD_PREFIX_RE.test(d);
    const context = hasContext(text, start, /\b(?:card|visa|master|amex|rupay|credit|debit|cc)\b/i);
    if (!knownIssuer) return context ? 0.7 : null;
    return 0.95;
  });
}

// ---------------------------------------------------------------- IP addresses

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_RE = new RegExp(`(?<![\\w.])${OCTET}(?:\\.${OCTET}){3}(?![\\w]|\\.\\d)`, 'g');
const IPV6_CANDIDATE_RE = /(?<![\w:])(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}(?![\w:])/g;

// Addresses that are not personal or sensitive: loopback, unspecified, broadcast.
const BORING_V4 = new Set(['0.0.0.0', '127.0.0.1', '255.255.255.255']);

function ipv4Detector(text: string): Detection[] {
  return scan(text, IPV4_RE, 'IP', 'ipv4', (m, start) => {
    if (BORING_V4.has(m[0])) return null;
    // `version 1.2.3.4`, `v1.2.3.4`: version numbers, not addresses.
    if (hasContext(text, start, /(?:\bversion|\bv|\bver\.?|==|@)\s*$/i, 12)) return null;
    return 0.9;
  });
}

function isIPv6(s: string): boolean {
  const parts = s.split('::');
  if (parts.length > 2) return false;
  const groups = (p: string) => (p === '' ? [] : p.split(':'));
  const head = groups(parts[0]!);
  const tail = parts.length === 2 ? groups(parts[1]!) : [];
  const all = [...head, ...tail];
  if (!all.every((g) => /^[0-9A-Fa-f]{1,4}$/.test(g))) return false;
  return parts.length === 2 ? all.length <= 7 : all.length === 8;
}

function ipv6Detector(text: string): Detection[] {
  return scan(text, IPV6_CANDIDATE_RE, 'IP', 'ipv6', (m) => {
    const s = m[0];
    if (!isIPv6(s)) return null;
    const groups = s.split(':').filter((g) => g !== '');
    // `::1`, `fe80::1` and short hex-with-colons (MAC-ish, times) are skipped.
    if (groups.length < 3) return null;
    if (!/\d/.test(s)) return null;
    return 0.85;
  });
}

export const piiDetectors: readonly Detector[] = [
  (text) =>
    scan(text, EMAIL_RE, 'EMAIL', 'email', (m, _start, end) =>
      // `git@github.com:org/repo.git` is an SSH remote, not a person's address.
      m[0].startsWith('git@') && text[end] === ':' ? null : 0.97,
    ),
  phoneDetector,
  cardDetector,
  ipv4Detector,
  ipv6Detector,
];
