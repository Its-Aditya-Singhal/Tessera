// Turns per-item results into summary statistics and a Markdown table.

import {
  lengthControlledNet,
  pearson,
  summarizeOutcomes,
  type Interval,
  type OutcomeSummary,
} from './stats.ts';
import type { EvalConfig } from './config.ts';
import type { ItemResult } from './runner.ts';
import type { Outcome } from './types.ts';

export interface GroupSummary {
  group: string;
  items: number;
  rewritten: number;
  errors: number;
  /** Judge outcomes on rewritten items only. */
  judge: OutcomeSummary;
  /** Judge outcomes over all items, counting left-alone prompts as ties (end-to-end view). */
  judgeAllItems: OutcomeSummary;
  checks: {
    n: number;
    originalPassRate: number;
    optimizedPassRate: number;
    outcomes: OutcomeSummary;
  };
}

export interface Summary {
  overall: GroupSummary;
  byCategory: GroupSummary[];
  byLang: GroupSummary[];
  byStyle: GroupSummary[];
  verdicts: Record<string, number>;
  judgeHealth: { comparisons: number; positionConsistency: number; parseFailures: number };
  length: {
    medianLogRatio: number;
    /** Correlation between answer length ratio and judge score; high values mean the judge may be rewarding length. */
    scoreLengthCorrelation: number;
    matchedRatio: number;
    matched: OutcomeSummary;
    /** Regression-adjusted net preference at equal answer length, scaled to [-1, 1]. */
    controlledNet: Interval & { slope: number };
  };
  /** Items where optimizing hurt, by the judge or by a check. Published on purpose. */
  hurt: {
    id: string;
    category: string;
    lang: string;
    style: string;
    judge?: Outcome;
    check?: Outcome;
    detail?: string;
  }[];
}

function median(xs: number[]): number {
  if (!xs.length) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

function groupSummary(
  group: string,
  items: ItemResult[],
  boot: EvalConfig['bootstrap'],
): GroupSummary {
  const ok = items.filter((r) => !r.error);
  const rewritten = ok.filter((r) => r.rewritten && r.judge);
  const judged = rewritten.map((r) => r.judge!.outcome);
  const allItems = ok.map((r) => r.judge?.outcome ?? 'tie');
  const checked = rewritten.filter((r) => r.check);
  const rate = (xs: boolean[]) => (xs.length ? xs.filter(Boolean).length / xs.length : Number.NaN);
  return {
    group,
    items: items.length,
    rewritten: rewritten.length,
    errors: items.length - ok.length,
    judge: summarizeOutcomes(judged, boot),
    judgeAllItems: summarizeOutcomes(allItems, boot),
    checks: {
      n: checked.length,
      originalPassRate: rate(checked.map((r) => r.check!.original.pass)),
      optimizedPassRate: rate(checked.map((r) => r.check!.optimized.pass)),
      outcomes: summarizeOutcomes(
        checked.map((r) => r.check!.outcome),
        boot,
      ),
    },
  };
}

function groupBy<K extends string>(
  items: ItemResult[],
  key: (r: ItemResult) => K,
  order: readonly K[],
  boot: EvalConfig['bootstrap'],
) {
  return order
    .map((k) =>
      groupSummary(
        k,
        items.filter((r) => key(r) === k),
        boot,
      ),
    )
    .filter((g) => g.items > 0);
}

export function summarize(results: ItemResult[], config: EvalConfig): Summary {
  const boot = config.bootstrap;
  const judged = results.filter((r) => !r.error && r.judge && r.lengthLogRatio !== undefined);
  const logRatios = judged.map((r) => r.lengthLogRatio!);
  const scores = judged.map((r) => r.judge!.score / 2);
  const band = Math.log(config.lengthControl.matchedRatio);
  const matched = judged
    .filter((r) => Math.abs(r.lengthLogRatio!) <= band)
    .map((r) => r.judge!.outcome);

  const verdicts: Record<string, number> = {};
  for (const r of results) {
    const v = r.error ? 'error' : r.optimizer.verdict;
    verdicts[v] = (verdicts[v] ?? 0) + 1;
  }

  const hurt: Summary['hurt'] = [];
  for (const r of results) {
    const j = r.judge?.outcome;
    const c = r.check?.outcome;
    if (j === 'loss' || c === 'loss') {
      hurt.push({
        id: r.id,
        category: r.category,
        lang: r.lang,
        style: r.style,
        judge: j,
        check: c,
        detail: c === 'loss' ? r.check!.optimized.detail : undefined,
      });
    }
  }

  return {
    overall: groupSummary('all', results, boot),
    byCategory: groupBy(
      results,
      (r) => r.category,
      ['coding', 'writing', 'summarizing', 'reasoning', 'format'],
      boot,
    ),
    byLang: groupBy(results, (r) => r.lang, ['en', 'ta', 'hi', 'hinglish'], boot),
    byStyle: groupBy(results, (r) => r.style, ['vague', 'typical', 'well-specified'], boot),
    verdicts,
    judgeHealth: {
      comparisons: judged.length,
      positionConsistency: judged.length
        ? judged.filter((r) => r.judge!.consistent).length / judged.length
        : Number.NaN,
      parseFailures: judged.reduce((s, r) => s + r.judge!.parseFailures, 0),
    },
    length: {
      medianLogRatio: median(logRatios),
      scoreLengthCorrelation: pearson(logRatios, scores),
      matchedRatio: config.lengthControl.matchedRatio,
      matched: summarizeOutcomes(matched, boot),
      controlledNet: lengthControlledNet(logRatios, scores, boot),
    },
    hurt,
  };
}

const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '–');
const signedPct = (x: number) =>
  Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}` : '–';
const ci = (i: Interval) =>
  Number.isFinite(i.point) ? `${pct(i.point)} [${pct(i.lo)}, ${pct(i.hi)}]` : '–';
const netCi = (i: Interval) =>
  Number.isFinite(i.point) ? `${signedPct(i.point)} [${signedPct(i.lo)}, ${signedPct(i.hi)}]` : '–';

function groupTable(title: string, groups: GroupSummary[]): string {
  const lines = [
    `### ${title}`,
    '',
    '| Group | Items | Rewritten | Win | Tie | Loss | Net (pp) | Checks: orig → opt pass | Check W/T/L |',
    '|---|---:|---:|---|---|---|---|---|---|',
  ];
  for (const g of groups) {
    const c = g.checks;
    lines.push(
      `| ${g.group} | ${g.items} | ${g.rewritten} | ${ci(g.judge.winRate)} | ${ci(g.judge.tieRate)} | ${ci(g.judge.lossRate)} | ${netCi(g.judge.net)} | ${
        c.n ? `${pct(c.originalPassRate)} → ${pct(c.optimizedPassRate)} (n=${c.n})` : '–'
      } | ${c.n ? `${c.outcomes.wins}/${c.outcomes.ties}/${c.outcomes.losses}` : '–'} |`,
    );
  }
  return lines.join('\n');
}

export interface RunMeta {
  runId: string;
  startedAt: string;
  finishedAt: string;
  fake: boolean;
  datasetSha256: string;
  targetId: string;
  judgeId: string;
  optimizerId: string;
  judgePromptVersion: string;
}

export function renderMarkdown(meta: RunMeta, summary: Summary, config: EvalConfig): string {
  const o = summary.overall;
  const out: string[] = [];
  out.push(`# Prompt-quality benchmark: ${meta.runId}`, '');
  if (meta.fake) {
    out.push(
      '> **FAKE MODELS. This run exercises the pipeline only. None of these numbers are results and none may be published.**',
      '',
    );
  }
  out.push(
    `- Target model: \`${meta.targetId}\` (temperature ${config.generation.temperature}, max ${config.generation.maxTokens} tokens)`,
    `- Judge model: \`${meta.judgeId}\` (prompt \`${meta.judgePromptVersion}\`, every pair judged twice with positions swapped)`,
    `- Optimizer: \`${meta.optimizerId}\``,
    `- Dataset sha256: \`${meta.datasetSha256.slice(0, 16)}…\``,
    `- Items: ${o.items} (rewritten ${o.rewritten}, errors ${o.errors}); optimizer verdicts: ${Object.entries(
      summary.verdicts,
    )
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`,
    `- Intervals are ${Math.round(config.bootstrap.confidence * 100)}% percentile bootstrap CIs over items (${config.bootstrap.resamples} resamples, seed ${config.bootstrap.seed}).`,
    '',
    "Win/Tie/Loss are from the optimized prompt's point of view and cover rewritten prompts only. Prompts the optimizer left alone are not judged (they would be ties by construction); the end-to-end row below counts them as ties.",
    '',
    `**End-to-end (all items, left-alone = tie):** win ${ci(o.judgeAllItems.winRate)}, loss ${ci(o.judgeAllItems.lossRate)}, net ${netCi(o.judgeAllItems.net)} pp`,
    '',
    groupTable('Overall', [o]),
    '',
    groupTable('By category', summary.byCategory),
    '',
    groupTable('By language', summary.byLang),
    '',
    groupTable('By original prompt style', summary.byStyle),
    '',
    '### Length control',
    '',
    `- Median ln(optimized answer length / original answer length): ${Number.isFinite(summary.length.medianLogRatio) ? summary.length.medianLogRatio.toFixed(3) : '–'}`,
    `- Correlation between length ratio and judge score: ${Number.isFinite(summary.length.scoreLengthCorrelation) ? summary.length.scoreLengthCorrelation.toFixed(3) : '–'}`,
    `- Length-matched pairs (within ×${summary.length.matchedRatio}): n=${summary.length.matched.n}, win ${ci(summary.length.matched.winRate)}, loss ${ci(summary.length.matched.lossRate)}`,
    `- Length-controlled net preference (regression intercept, [-1, 1] scale): ${netCi(summary.length.controlledNet)} (slope ${Number.isFinite(summary.length.controlledNet.slope) ? summary.length.controlledNet.slope.toFixed(3) : '–'})`,
    '',
    '### Judge health',
    '',
    `- Comparisons: ${summary.judgeHealth.comparisons}; position consistency: ${pct(summary.judgeHealth.positionConsistency)}; unparseable votes: ${summary.judgeHealth.parseFailures}`,
    '',
    '### Where optimizing hurt',
    '',
  );
  if (summary.hurt.length === 0) {
    out.push('None in this run.');
  } else {
    out.push(
      '| Item | Category | Lang | Style | Judge | Check | Check detail |',
      '|---|---|---|---|---|---|---|',
    );
    for (const h of summary.hurt) {
      out.push(
        `| ${h.id} | ${h.category} | ${h.lang} | ${h.style} | ${h.judge ?? '–'} | ${h.check ?? '–'} | ${h.detail?.replace(/\|/g, '\\|') ?? ''} |`,
      );
    }
  }
  out.push('');
  return out.join('\n');
}
