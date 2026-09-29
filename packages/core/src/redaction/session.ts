import { detect } from './detect';
import type { DetectOptions, Detection, DetectionType } from './types';

/** One detected value in one piece of text, as shown in the review list. */
export interface RedactionItem {
  /** Unique within one {@link RedactionResult}; used to toggle the item. */
  id: string;
  type: DetectionType;
  span: { start: number; end: number };
  confidence: number;
  detector: string;
  /** e.g. `[EMAIL_1]`. The same original value always gets the same placeholder within a session. */
  placeholder: string;
  original: string;
  /** Whether the value is replaced. Users can switch individual items off in the review list. */
  enabled: boolean;
}

export interface RedactionResult {
  /** The original text, kept so toggles can be re-applied. Lives only as long as the caller keeps it. */
  source: string;
  items: RedactionItem[];
  /** `source` with every enabled item replaced by its placeholder. */
  text: string;
}

const PLACEHOLDER_RE = /\[([A-Z]+)_(\d+)\]/g;

/**
 * Holds the placeholder mapping for one redaction session (for example one
 * optimize or one handoff). The mapping lives only in this object's memory: it
 * is never serialized, persisted or sent anywhere, and {@link clear} wipes it.
 */
export class RedactionSession {
  #byValue = new Map<string, string>();
  #byPlaceholder = new Map<string, string>();
  #counters = new Map<DetectionType, number>();
  readonly #options: DetectOptions;

  constructor(options: DetectOptions = {}) {
    this.#options = options;
  }

  /** Detect and redact `text`. All detected items start enabled. */
  redact(text: string): RedactionResult {
    return this.redactDetections(text, detect(text, this.#options));
  }

  /** Redact with detections produced elsewhere (useful for tests and custom detectors). */
  redactDetections(text: string, detections: readonly Detection[]): RedactionResult {
    const items = detections.map((d, i): RedactionItem => {
      const original = text.slice(d.span.start, d.span.end);
      return {
        id: `r${i}`,
        type: d.type,
        span: { ...d.span },
        confidence: d.confidence,
        detector: d.detector,
        placeholder: this.#placeholderFor(d.type, original, text),
        original,
        enabled: true,
      };
    });
    return { source: text, items, text: applyItems(text, items) };
  }

  /** Put original values back into text that contains this session's placeholders (e.g. a model's answer). */
  restore(text: string): string {
    return text.replace(PLACEHOLDER_RE, (ph) => this.#byPlaceholder.get(ph) ?? ph);
  }

  /** Number of distinct values currently mapped. */
  get size(): number {
    return this.#byValue.size;
  }

  /** Forget every mapping. Call when the flow that needed restore() is done. */
  clear(): void {
    this.#byValue.clear();
    this.#byPlaceholder.clear();
    this.#counters.clear();
  }

  /** Never leak the mapping through JSON.stringify or structured logging. */
  toJSON(): { size: number } {
    return { size: this.size };
  }

  #placeholderFor(type: DetectionType, original: string, source: string): string {
    const key = `${type}\u0000${original}`;
    const existing = this.#byValue.get(key);
    if (existing) return existing;
    let n = this.#counters.get(type) ?? 0;
    let ph: string;
    // Skip numbers whose placeholder text already appears in the source, so restore()
    // cannot confuse a literal "[EMAIL_1]" typed by the user with ours.
    do {
      n += 1;
      ph = `[${type}_${n}]`;
    } while (source.includes(ph));
    this.#counters.set(type, n);
    this.#byValue.set(key, ph);
    this.#byPlaceholder.set(ph, original);
    return ph;
  }
}

/** Rebuild redacted text from the source and the currently enabled items. */
export function applyItems(source: string, items: readonly RedactionItem[]): string {
  let out = '';
  let pos = 0;
  for (const it of [...items].sort((a, b) => a.span.start - b.span.start)) {
    if (!it.enabled || it.span.start < pos) continue;
    out += source.slice(pos, it.span.start) + it.placeholder;
    pos = it.span.end;
  }
  return out + source.slice(pos);
}

/** Return a new result with one item switched on or off. Pure: the input is not modified. */
export function toggleItem(result: RedactionResult, id: string, enabled?: boolean): RedactionResult {
  const items = result.items.map((it) => (it.id === id ? { ...it, enabled: enabled ?? !it.enabled } : it));
  return { ...result, items, text: applyItems(result.source, items) };
}

/** Switch a whole category on or off in one go (e.g. "don't redact IP addresses"). */
export function toggleType(result: RedactionResult, type: DetectionType, enabled: boolean): RedactionResult {
  const items = result.items.map((it) => (it.type === type ? { ...it, enabled } : it));
  return { ...result, items, text: applyItems(result.source, items) };
}
