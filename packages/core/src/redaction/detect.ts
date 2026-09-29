import { indiaDetectors } from './detectors/india';
import { piiDetectors } from './detectors/pii';
import { secretDetectors } from './detectors/secrets';
import { DEFAULT_MIN_CONFIDENCE, type DetectOptions, type Detection, type DetectionType, type Detector } from './types';

export const ALL_DETECTORS: readonly Detector[] = [...secretDetectors, ...piiDetectors, ...indiaDetectors];

// When two detections overlap, the one earlier in this list wins. Specific,
// checksum-validated or prefix-anchored types beat generic ones.
const PRIORITY: readonly DetectionType[] = [
  'PRIVATE_KEY',
  'API_KEY',
  'TOKEN',
  'CARD',
  'AADHAAR',
  'EMAIL',
  'UPI',
  'PASSWORD',
  'PAN',
  'IFSC',
  'PHONE',
  'IP',
  'SECRET',
];
const rank = (t: DetectionType): number => PRIORITY.indexOf(t);

/**
 * Pick a non-overlapping subset: higher-priority type first, then the longer
 * span (so `+1 (415) 555-0132` beats its `(415) 555-0132` tail), then higher confidence. Result is sorted by position.
 */
export function resolveOverlaps(detections: readonly Detection[]): Detection[] {
  const ordered = [...detections].sort(
    (a, b) =>
      rank(a.type) - rank(b.type) ||
      b.span.end - b.span.start - (a.span.end - a.span.start) ||
      b.confidence - a.confidence ||
      a.span.start - b.span.start,
  );
  const kept: Detection[] = [];
  for (const d of ordered) {
    if (kept.every((k) => d.span.end <= k.span.start || d.span.start >= k.span.end)) kept.push(d);
  }
  return kept.sort((a, b) => a.span.start - b.span.start);
}

/** Run every enabled detector over `text` and return non-overlapping detections in order. */
export function detect(text: string, options: DetectOptions = {}): Detection[] {
  const min = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const enabled = options.enabled ?? {};
  const raw = ALL_DETECTORS.flatMap((d) => d(text)).filter(
    (d) => d.confidence >= min && enabled[d.type] !== false,
  );
  return resolveOverlaps(raw);
}

const PASTE_WARNING_TYPES: ReadonlySet<DetectionType> = new Set(['PRIVATE_KEY', 'API_KEY', 'TOKEN', 'PASSWORD', 'SECRET', 'CARD', 'AADHAAR']);

/**
 * For the optional passive banner shown when the user pastes into a chatbox:
 * returns the high-confidence secret-like detections in the pasted text, or an
 * empty array when no warning is needed.
 */
export function pasteWarnings(pasted: string): Detection[] {
  return detect(pasted, { minConfidence: 0.8 }).filter((d) => PASTE_WARNING_TYPES.has(d.type));
}
