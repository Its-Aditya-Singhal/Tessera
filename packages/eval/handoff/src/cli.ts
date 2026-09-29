// `pnpm eval:handoff`: run the handoff-fidelity benchmark and write JSON + Markdown results.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadCapsuleBuilder, type CapsuleBuilder } from './capsule.ts';
import { loadConfig, parseConfig, type HandoffConfig } from './config.ts';
import { toyCapsuleBuilder } from './fake-capsule.ts';
import { createModel, withCache } from './models.ts';
import { renderMarkdown, type RunReport } from './report.ts';
import { runHandoffEval } from './runner.ts';
import { ALL_CONDITIONS, type ChatModel, type ConditionId, type Dataset } from './types.ts';

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `Usage: pnpm eval:handoff [options]

  --config <path>       config file (default: handoff.config.json)
  --fake                use deterministic fake models and the toy capsule (harness smoke test, not results)
  --conditions <list>   comma-separated subset of ${ALL_CONDITIONS.join(',')}
  --limit <n>           only the first n conversations
  --out <dir>           output directory (default from config; results/fake with --fake)
  --no-cache            do not read or write the model response cache
  --quiet               no progress output
  --help`;

function fakeConfig(): HandoffConfig {
  return parseConfig(
    {
      target: { provider: 'fake', behaviour: 'retriever' },
      summarizer: { provider: 'fake', behaviour: 'lead-summarizer' },
      judge: { provider: 'fake', behaviour: 'keyword-judge' },
      outDir: 'results/fake',
    },
    PKG_DIR,
  );
}

export async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      config: { type: 'string' },
      fake: { type: 'boolean', default: false },
      conditions: { type: 'string' },
      limit: { type: 'string' },
      out: { type: 'string' },
      'no-cache': { type: 'boolean', default: false },
      quiet: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.info(HELP);
    return 0;
  }

  const cfg = values.fake
    ? fakeConfig()
    : loadConfig(values.config ?? join(PKG_DIR, 'handoff.config.json'));
  const conditions = values.conditions
    ? (values.conditions.split(',').map((s) => s.trim()) as ConditionId[])
    : cfg.conditions;
  for (const c of conditions)
    if (!ALL_CONDITIONS.includes(c)) throw new Error(`unknown condition "${c}"`);

  const outDir = resolve(cfg.baseDir, values.out ?? cfg.outDir);
  mkdirSync(outDir, { recursive: true });
  const cacheFile = join(outDir, '.cache.jsonl');
  const make = (spec: Parameters<typeof createModel>[0]): ChatModel =>
    values['no-cache'] ? createModel(spec) : withCache(createModel(spec), cacheFile);

  const target = make(cfg.target);
  const summarizer = make(cfg.summarizer ?? cfg.target);
  const judge = cfg.judge ? make(cfg.judge) : undefined;
  let capsule: CapsuleBuilder | undefined;
  if (values.fake) capsule = toyCapsuleBuilder;
  else if (cfg.capsule.module) capsule = await loadCapsuleBuilder(cfg.capsule.module, cfg.baseDir);

  const datasetPath = resolve(cfg.baseDir, cfg.dataset);
  const raw = readFileSync(datasetPath, 'utf8');
  const dataset = JSON.parse(raw) as Dataset;
  const limit = values.limit ? Number(values.limit) : undefined;
  const conversations = limit ? dataset.conversations.slice(0, limit) : dataset.conversations;

  const startedAt = new Date().toISOString();
  const output = await runHandoffEval({
    conversations,
    conditions,
    target,
    ...(judge ? { judge } : {}),
    deps: {
      summarizer,
      ...(capsule ? { capsule } : {}),
      capsuleOptions: { lastTurns: cfg.capsule.lastTurns },
      summaryOptions: cfg.summary,
    },
    bootstrap: cfg.bootstrap,
    onProgress: values.quiet ? undefined : (m) => console.error(m),
  });

  const report: RunReport = {
    meta: {
      startedAt,
      finishedAt: new Date().toISOString(),
      fake: [target, summarizer, judge].some((m) => m?.fake) || capsule === toyCapsuleBuilder,
      dataset: {
        path: relative(PKG_DIR, datasetPath),
        sha256: createHash('sha256').update(raw).digest('hex'),
        conversations: conversations.length,
        questions: conversations.reduce((n, c) => n + c.questions.length, 0),
      },
      models: {
        target: target.id,
        summarizer: conditions.includes('summary') ? summarizer.id : null,
        judge: judge?.id ?? null,
      },
      capsuleBuilder: capsule?.id ?? null,
      options: { conditions, capsule: cfg.capsule, summary: cfg.summary, bootstrap: cfg.bootstrap },
    },
    ...output,
  };

  const jsonPath = join(outDir, 'handoff-results.json');
  const mdPath = join(outDir, 'handoff-results.md');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
  writeFileSync(mdPath, renderMarkdown(report));
  console.error(
    `wrote ${relative(process.cwd(), jsonPath)} and ${relative(process.cwd(), mdPath)}`,
  );
  if (!existsSync(cacheFile) && !values['no-cache'] && !report.meta.fake)
    console.error('note: no model responses were cached');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
}
