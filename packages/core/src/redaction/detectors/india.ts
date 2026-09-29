import { verhoeffValid } from '../checksums';
import type { Detector } from '../types';
import { consistentSeparators, digitsOnly, hasContext, scan } from './util';

// 12 digits, first digit 2-9, optionally grouped 4-4-4. Not part of a longer digit run
// (so the middle of a spaced card number does not match).
const AADHAAR_RE = /(?<!\d[\s-]?|[A-Za-z_])[2-9]\d{3}([\s-]?)\d{4}\1\d{4}(?![\s-]?\d|[A-Za-z_])/g;
const AADHAAR_CONTEXT = /aadhaa?r|uidai|\buid\b|आधार/i;

// PAN: 5 letters, 4 digits, 1 letter. The 4th letter is the holder type.
const PAN_RE = /(?<![A-Za-z0-9])[A-Z]{3}[ABCFGHJLPT][A-Z]\d{4}[A-Z](?![A-Za-z0-9])/g;

const PAN_LOWER_RE = /(?<![A-Za-z0-9])[a-z]{3}[abcfghjlpt][a-z]\d{4}[a-z](?![A-Za-z0-9])/g;

// IFSC: 4-letter bank code, a literal 0, 6-character branch code.
const IFSC_RE = /(?<![A-Za-z0-9])[A-Z]{4}0[A-Z0-9]{6}(?![A-Za-z0-9])/g;

// UPI VPA: handle@psp. The PSP part has no dot, which is what separates it from an email.
const UPI_RE =
  /(?<![A-Za-z0-9._-])[A-Za-z0-9][A-Za-z0-9._-]{1,255}@([A-Za-z][A-Za-z0-9]{1,63})(?![A-Za-z0-9.@-])/g;

// Common UPI PSP handles (NPCI publishes the full list; this covers the large apps and banks).
const UPI_HANDLES = new Set(
  (
    'upi ybl ibl axl okaxis okhdfcbank okicici oksbi paytm ptyes ptaxis pthdfc ptsbi apl yapl rapl ' +
    'abfspay axisbank axisb icici hdfcbank sbi kotak kbl pnb boi barodampay cnrb unionbank uboi idbi ' +
    'indus federal fbl idfcbank idfcfirst yesbank yesbankltd rbl dbs hsbc sc citi citigold aubank ' +
    'freecharge airtel jio jupiteraxis slice fam naviaxis mbk ikwik timecosmos waaxis wahdfcbank ' +
    'wasbi waicici superyes tapicici pingpay dlb equitas jkb kvb tjsb'
  ).split(' '),
);
const UPI_CONTEXT = /\b(?:upi|vpa|gpay|phonepe|paytm|bhim|pay(?:ment)?)\b/i;

export const indiaDetectors: readonly Detector[] = [
  (text) =>
    scan(text, AADHAAR_RE, 'AADHAAR', 'aadhaar', (m, start) => {
      const d = digitsOnly(m[0]);
      if (!consistentSeparators(m[0]) || !verhoeffValid(d)) return null;
      if (/^(\d)\1+$/.test(d)) return null;
      const context = hasContext(text, start, AADHAAR_CONTEXT, 60);
      if (context) return 0.99;
      // Unseparated and without context, a Verhoeff-valid 12-digit number is still
      // one in ten random numbers (order IDs, references). Keep it below the default threshold.
      return m[1] ? 0.85 : 0.45;
    }),
  (text) =>
    scan(text, PAN_RE, 'PAN', 'pan', (_m, start) =>
      hasContext(text, start, /\bpan\b/i) ? 0.99 : 0.9,
    ),
  // People often type PANs in lowercase in chat. Only trust that with "pan" nearby.
  (text) =>
    scan(text, PAN_LOWER_RE, 'PAN', 'pan-lowercase', (_m, start) =>
      hasContext(text, start, /\bpan\b/i) ? 0.8 : null,
    ),
  (text) =>
    scan(text, IFSC_RE, 'IFSC', 'ifsc', (_m, start) =>
      hasContext(text, start, /\bifsc\b/i) ? 0.99 : 0.85,
    ),
  (text) =>
    scan(text, UPI_RE, 'UPI', 'upi', (m, start) => {
      const psp = m[1]!.toLowerCase();
      if (UPI_HANDLES.has(psp)) return 0.95;
      return hasContext(text, start, UPI_CONTEXT, 50) ? 0.75 : null;
    }),
];
