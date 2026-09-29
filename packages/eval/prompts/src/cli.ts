#!/usr/bin/env node
// Entry point for `pnpm eval:prompts`.
//
//   node src/cli.ts [--config eval.config.json] [--fake] [--limit N]
//                   [--category coding,writing] [--lang ta,hi] [--out DIR]
//                   [--validate-only]

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadConfig, type EvalConfig } from './config.ts';
import { loadDataset } from './dataset.ts';
import { JUDGE_PROMPT_VERSION } from './judge.ts';
import { createModel } from './models.ts';
import { loadOptimizer } from './optimizer.ts';
import { renderMarkdown, summarize, type RunMeta } from './report.ts';
import { preflight, runBenchmark, selectItems } from './runner.ts';
import type { Category, Lang } from './types.ts';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      config: { type: 'string', short: 'c' },
      fake: { type: 'boolean', default: false },
      limit: { type: 'string' },
      category: { type: 'string' },
      lang: { type: 'string' },
      out: { type: 'string' },
      'validate-only': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    console.info(
      'Usage: pnpm eval:prompts [--config FILE] [--fake] [--limit N] [--category a,b] [--lang en,ta] [--out DIR] [--validate-only]',
    );
    return;
  }

  const { config: loaded, baseDir } = loadConfig(values.config, packageDir);
  const config: EvalConfig = { ...loaded, filter: { ...loaded.filter } };
  if (values.limit) config.filter!.limit = Number(values.limit);
  if (values.category) config.filter!.categories = values.category.split(',') as Category[];
  if (values.lang) config.filter!.langs = values.lang.split(',') as Lang[];
  if (values.fake) {
    // Deterministic stand-ins: exercise every stage without any model server.
    config.target = { provider: 'fake', behavior: 'echo', model: 'echo' };
    config.judge = { provider: 'fake', behavior: 'hash-judge', model: 'hash-judge' };
    if (config.optimizer.kind === 'identity') config.optimizer = { kind: 'fake-suffix' };
    config.bootstrap = {
      ...config.bootstrap,
      resamples: Math.min(config.bootstrap.resamples, 2000),
    };
  }

  const datasetPath = path.resolve(baseDir, config.dataset);
  const { items: allItems, sha256 } = loadDataset(datasetPath);
  if (values['validate-only']) {
    const count = (k: 'category' | 'lang' | 'style') =>
      Object.entries(Object.groupBy(allItems, (i) => i[k]))
        .map(([g, xs]) => `${g} ${xs?.length ?? 0}`)
        .join(', ');
    console.info(
      `${allItems.length} items OK (${allItems.filter((i) => i.check).length} with checks)`,
    );
    console.info(
      `  category: ${count('category')}\n  lang: ${count('lang')}\n  style: ${count('style')}`,
    );
    return;
  }
  const items = selectItems(allItems, config.filter);

  const target = createModel(config.target);
  const judge = createModel(config.judge);
  const optimizer = await loadOptimizer(config.optimizer, baseDir);
  const fake =
    [config.target, config.judge].some((m) => m.provider === 'fake') ||
    optimizer.id.startsWith('fake');

  if (optimizer.id === 'identity') {
    console.warn(
      'Optimizer is the identity stub: every prompt is left as is, so nothing is generated or judged. ' +
        'Point optimizer.module at a real optimizer (see README) to get results.',
    );
  }
  if (!fake) await preflight([target, judge]);

  const startedAt = new Date();
  const runId = `${startedAt.toISOString().replace(/[:.]/g, '-')}${fake ? '-FAKE' : ''}`;
  const outRoot = path.resolve(values.out ?? path.resolve(baseDir, config.outDir));
  const runDir = path.join(outRoot, runId);
  mkdirSync(runDir, { recursive: true });

  console.info(
    `Running ${items.length} prompts: target ${target.id}, judge ${judge.id}, optimizer ${optimizer.id}`,
  );
  const results = await runBenchmark(items, config, {
    target,
    judge,
    optimizer,
    // Shared across runs with the same models, so a killed run resumes where it stopped.
    cacheFile: fake ? null : path.join(outRoot, 'cache.jsonl'),
    onProgress: (done, total, r) => {
      const tag = r.error
        ? `error: ${r.error}`
        : r.rewritten
          ? `judge ${r.judge?.outcome}${r.check ? `, check ${r.check.outcome}` : ''}`
          : r.optimizer.verdict;
      console.info(`[${done}/${total}] ${r.id}: ${tag}`);
    },
  });

  const summary = summarize(results, config);
  const meta: RunMeta = {
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    fake,
    datasetSha256: sha256,
    targetId: target.id,
    judgeId: judge.id,
    optimizerId: optimizer.id,
    judgePromptVersion: JUDGE_PROMPT_VERSION,
  };
  writeFileSync(
    path.join(runDir, 'results.json'),
    JSON.stringify({ meta, config, summary, items: results }, null, 2),
  );
  writeFileSync(path.join(runDir, 'results.md'), renderMarkdown(meta, summary, config));
  console.info(`\nWrote ${path.relative(process.cwd(), runDir)}/results.{json,md}`);
  if (summary.overall.errors) {
    console.warn(`${summary.overall.errors} item(s) failed; see "error" fields in results.json`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
