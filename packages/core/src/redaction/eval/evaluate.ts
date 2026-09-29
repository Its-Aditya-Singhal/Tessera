import { detect } from '../detect';
import { DETECTION_TYPES, type DetectOptions, type Detection, type DetectionType } from '../types';
import type { GoldLabel, Sample } from './synthetic';

export interface CategoryScore {
  type: DetectionType | 'ANY';
  support: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface ErrorExample {
  sampleId: string;
  group: string;
  kind: 'fp' | 'fn';
  type: DetectionType;
  text: string;
  value: string;
  detector?: string;
}

export interface EvalReport {
  samples: number;
  positives: number;
  negatives: number;
  categories: CategoryScore[];
  /** Type-agnostic: was every sensitive span redacted by something, and was every redaction over something sensitive? */
  any: CategoryScore;
  /** Samples with no labels that got at least one redaction. */
  negativeSamplesFlagged: number;
  errors: ErrorExample[];
  recallByGroup: { group: string; support: number; recall: number }[];
}

/** Spans match when they overlap by at least half of their union. */
function matches(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  const inter = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  if (inter <= 0) return false;
  const union = Math.max(a.end, b.end) - Math.min(a.start, b.start);
  return inter / union >= 0.5;
}

function score(type: CategoryScore['type'], tp: number, fp: number, fn: number): CategoryScore {
  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn);
  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;
  return { type, support: tp + fn, tp, fp, fn, precision, recall, f1 };
}

export function evaluate(samples: readonly Sample[], options: DetectOptions = {}): EvalReport {
  const counts = new Map<DetectionType, { tp: number; fp: number; fn: number }>(
    DETECTION_TYPES.map((t) => [t, { tp: 0, fp: 0, fn: 0 }]),
  );
  const any = { tp: 0, fp: 0, fn: 0 };
  const errors: ErrorExample[] = [];
  const groups = new Map<string, { support: number; hit: number }>();
  let negativeSamplesFlagged = 0;

  for (const s of samples) {
    const preds: Detection[] = detect(s.text, options);
    if (s.labels.length === 0 && preds.length > 0) negativeSamplesFlagged++;

    // Strict: same type, one-to-one.
    const usedPred = new Set<number>();
    const goldHit = new Set<GoldLabel>();
    for (const g of s.labels) {
      const i = preds.findIndex(
        (p, j) => !usedPred.has(j) && p.type === g.type && matches(p.span, g),
      );
      if (i >= 0) {
        usedPred.add(i);
        goldHit.add(g);
        counts.get(g.type)!.tp++;
      } else {
        counts.get(g.type)!.fn++;
        errors.push({
          sampleId: s.id,
          group: s.group,
          kind: 'fn',
          type: g.type,
          text: s.text,
          value: s.text.slice(g.start, g.end),
        });
      }
      const grp = `${g.type} ${s.group.includes('/') ? s.group.slice(s.group.indexOf('/') + 1) : s.group === g.type ? 'all' : s.group}`;
      const e = groups.get(grp) ?? { support: 0, hit: 0 };
      e.support++;
      if (goldHit.has(g)) e.hit++;
      groups.set(grp, e);
    }
    preds.forEach((p, j) => {
      if (usedPred.has(j)) return;
      counts.get(p.type)!.fp++;
      errors.push({
        sampleId: s.id,
        group: s.group,
        kind: 'fp',
        type: p.type,
        text: s.text,
        value: s.text.slice(p.span.start, p.span.end),
        detector: p.detector,
      });
    });

    // Type-agnostic.
    for (const g of s.labels) {
      if (preds.some((p) => matches(p.span, g))) any.tp++;
      else any.fn++;
    }
    for (const p of preds) if (!s.labels.some((g) => matches(p.span, g))) any.fp++;
  }

  const positives = samples.filter((s) => s.labels.length > 0).length;
  return {
    samples: samples.length,
    positives,
    negatives: samples.length - positives,
    categories: DETECTION_TYPES.map((t) => {
      const c = counts.get(t)!;
      return score(t, c.tp, c.fp, c.fn);
    }),
    any: score('ANY', any.tp, any.fp, any.fn),
    negativeSamplesFlagged,
    errors,
    recallByGroup: [...groups]
      .map(([group, e]) => ({ group, support: e.support, recall: e.hit / e.support }))
      .sort((a, b) => a.group.localeCompare(b.group)),
  };
}
