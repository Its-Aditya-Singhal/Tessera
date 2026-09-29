/**
 * Categories the privacy layer can detect. Each one maps to a placeholder
 * prefix, e.g. `EMAIL` becomes `[EMAIL_1]`.
 */
export const DETECTION_TYPES = [
  'PRIVATE_KEY',
  'API_KEY',
  'TOKEN',
  'PASSWORD',
  'SECRET',
  'CARD',
  'AADHAAR',
  'EMAIL',
  'UPI',
  'PHONE',
  'PAN',
  'IFSC',
  'IP',
] as const;

export type DetectionType = (typeof DETECTION_TYPES)[number];

/** Half-open character range `[start, end)` into the scanned text. */
export interface Span {
  start: number;
  end: number;
}

/** What every detector returns. */
export interface Detection {
  type: DetectionType;
  span: Span;
  /** 0..1, how sure the detector is that this is sensitive. */
  confidence: number;
  /** Which rule fired, e.g. `github-token` or `aadhaar`. Useful for debugging and benchmarks. */
  detector: string;
}

export type Detector = (text: string) => Detection[];

export interface DetectOptions {
  /** Per-category switches. Categories not listed are enabled. */
  enabled?: Partial<Record<DetectionType, boolean>>;
  /** Detections below this confidence are dropped. Defaults to {@link DEFAULT_MIN_CONFIDENCE}. */
  minConfidence?: number;
}

export const DEFAULT_MIN_CONFIDENCE = 0.5;
