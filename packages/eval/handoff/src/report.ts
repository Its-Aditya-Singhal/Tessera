// JSON and Markdown output for a run.

import type { ConditionSummary, RunOutput } from './runner.ts';
import type { Proportion } from './stats.ts';
import type { ConditionId } from './types.ts';

export interface RunMeta {
  startedAt: string;
  finishedAt: string;
  fake: boolean;
  dataset: { path: string; sha256: string; conversations: number; questions: number };
  models: { target: string; summarizer: string | null; judge: string | null };
  capsuleBuilder: string | null;
  options: Record<string, unknown>;
}

export interface RunReport extends RunOutput {
  meta: RunMeta;
}

export const CONDITION_LABELS: Record<ConditionId, string> = {
  full: 'Full transcript',
  hybrid: 'Hybrid capsule',
  summary: 'Plain summary',
  none: 'No context',
};

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

export function fmtProportion(p: Proportion | undefined): string {
  if (!p || p.rate === null) return 'n/a';
  const ci = p.ci95 ? ` (${pct(p.ci95[0])}–${pct(p.ci95[1])})` : '';
  return `${pct(p.rate)}${ci}`;
}

const fmtNum = (x: number | null | undefined, digits = 0): string =>
  x === null || x === undefined ? 'n/a' : x.toFixed(digits);

function row(s: ConditionSummary, judged: boolean): string {
  const label = CONDITION_LABELS[s.condition];
  if (s.status === 'not-run')
    return `| ${label} | not run: ${s.reason ?? ''} |${' |'.repeat(judged ? 8 : 7)}`;
  const cells = [
    label,
    fmtProportion(s.factRetention),
    fmtProportion(s.decisionRetention),
    fmtProportion(s.staleDecisions),
    fmtProportion(s.codeExact),
    ...(judged ? [fmtProportion(s.judgedRetention)] : []),
    fmtProportion(s.contextCoverage),
    fmtNum(s.meanContextTokens),
    fmtNum(s.meanGenerationTokens),
  ];
  return `| ${cells.join(' | ')} |`;
}

export function renderMarkdown(report: RunReport): string {
  const { meta, summaries } = report;
  const judged = meta.models.judge !== null;
  const lines: string[] = ['# Handoff-fidelity benchmark results', ''];
  if (meta.fake) {
    lines.push(
      '> **FAKE MODELS. This is a harness smoke test, not a benchmark result.** The target, summarizer and',
      '> capsule builder are deterministic stand-ins used to check the pipeline end to end. Do not quote these numbers.',
      '',
    );
  }
  lines.push(
    `- Run: ${meta.startedAt} to ${meta.finishedAt}`,
    `- Dataset: \`${meta.dataset.path}\` (${meta.dataset.conversations} conversations, ${meta.dataset.questions} questions, sha256 \`${meta.dataset.sha256.slice(0, 12)}\`)`,
    `- Target model: \`${meta.models.target}\``,
    `- Summarizer: ${meta.models.summarizer ? `\`${meta.models.summarizer}\`` : 'none'}`,
    `- Judge: ${meta.models.judge ? `\`${meta.models.judge}\`` : 'none (strict string matching only)'}`,
    `- Capsule builder: ${meta.capsuleBuilder ? `\`${meta.capsuleBuilder}\`` : 'none'}`,
    '',
    'Rates are per question with 95% bootstrap intervals over conversations. Token counts are approximate',
    '(see `src/tokens.ts`) and averaged per conversation.',
    '',
    `| Condition | Facts retained | Decisions retained | Stale decisions | Code exact |${judged ? ' Recall (judged) |' : ''} Context carries answer | Context tokens | Generation tokens |`,
    `|---|---|---|---|---|${judged ? '---|' : ''}---|---|---|`,
    ...summaries.map((s) => row(s, judged)),
    '',
    '## Retention by where the answer was planted',
    '',
    '| Condition | Early | Middle | Late |',
    '|---|---|---|---|',
    ...summaries
      .filter((s) => s.status === 'ran')
      .map(
        (s) =>
          `| ${CONDITION_LABELS[s.condition]} | ${fmtProportion(s.byPosition?.early)} | ${fmtProportion(s.byPosition?.middle)} | ${fmtProportion(s.byPosition?.late)} |`,
      ),
    '',
    '## Column definitions',
    '',
    '- **Facts retained / Decisions retained:** the answer contains the planted value (decisions: every content word of the final choice).',
    '- **Stale decisions:** among decisions that were changed mid-conversation, answers giving only the superseded choice.',
    '- **Code exact:** the answer reproduces the planted code block exactly (line endings and trailing spaces ignored).',
    '- **Context carries answer:** model-free check that the handoff context itself still contains what the question needs.',
    '- **Context tokens:** size of the handoff context. **Generation tokens:** tokens spent producing it (summarizer calls).',
    '',
  );
  return lines.join('\n');
}
