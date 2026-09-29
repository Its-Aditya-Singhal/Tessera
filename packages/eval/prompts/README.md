# @tessera/eval-prompts

The prompt-quality benchmark (build prompt section 9, item 1). It answers one question: **does
Tessera's optimizer make the chatbot's answer better, worse, or no different?**

Methodology and the results table live in
[`docs/benchmarks/prompt-quality.md`](../../../docs/benchmarks/prompt-quality.md). This file is
about running it.

## Run it

```sh
pnpm install
pnpm eval:prompts                  # defaults: Ollama on localhost, identity optimizer
pnpm eval:prompts --config packages/eval/prompts/eval.config.json
pnpm eval:prompts --fake           # fake models, exercises every stage, output is marked FAKE
pnpm eval:prompts --limit 20 --category reasoning --lang ta,hi
pnpm --filter @tessera/eval-prompts validate-dataset
```

Each run writes `results/<run id>/results.json` (config, summary and every item with both answers
and both judge votes) and `results/<run id>/results.md` (the tables). `results/cache.jsonl` caches
every model call, so a killed run resumes where it stopped. Cache keys include the model and optimizer ids,
so change the optimizer's `id` whenever its behaviour changes (or delete the cache). `results/` is git-ignored.

No build step: the CLI runs the TypeScript sources directly with Node's type stripping (Node
22.18+).

## Models (zero budget)

Defaults, both through [Ollama](https://ollama.com) on `localhost:11434`:

| Role   | Model                   | Licence    | Why                                                                                     |
| ------ | ----------------------- | ---------- | --------------------------------------------------------------------------------------- |
| Target | `qwen2.5:1.5b-instruct` | Apache 2.0 | The size class Tessera's Tier 2 runs; weak models are where prompt wording matters most |
| Judge  | `qwen2.5:7b-instruct`   | Apache 2.0 | Larger than the target, runs on a laptop, handles Tamil and Hindi reasonably            |

```sh
ollama pull qwen2.5:1.5b-instruct && ollama pull qwen2.5:7b-instruct
```

Any OpenAI-compatible server works too (llama.cpp `llama-server`, LM Studio, vLLM, or a free-tier
API you choose). Put the key in an environment variable and name the variable, never the key:

```json
{
  "judge": {
    "provider": "openai-compatible",
    "baseUrl": "http://localhost:8080/v1",
    "model": "qwen2.5-7b-instruct",
    "apiKeyEnv": "JUDGE_API_KEY",
    "jsonMode": true
  }
}
```

A judge that is too small is the biggest threat to validity. Check "position consistency" in the
report: if the judge flips its vote when the answers swap places more than about a third of the
time, its verdicts are mostly noise.

## Plugging in the optimizer

The M4 optimizer does not exist yet, so the default optimizer is `identity` (says every prompt is
fine, so nothing is judged). To benchmark a real optimizer, write a small adapter module that
exports a `PromptOptimizer` (or a factory returning one) and point the config at it:

```ts
// packages/eval/prompts/optimizers/tessera.ts
import type { PromptOptimizer } from '../src/types.ts';

const optimizer: PromptOptimizer = {
  id: 'tessera-optimizer-v1',
  async optimize(prompt, { lang }) {
    // call packages/core here; return { verdict: 'improve' | 'ok_as_is' | 'ask', optimized, questions }
  },
};
export default optimizer;
```

```json
{ "optimizer": { "kind": "module", "module": "./optimizers/tessera.ts" } }
```

The optimizer's own model (if it uses one) is its business; the harness only sees prompts in and
prompts out. `ask` verdicts are counted but not judged, because nobody is there to answer the
questions.

## Dataset

`data/prompts.jsonl`, 176 prompts, generated from the Python sources in `data/src/` (edit those,
then run `python3 data/src/build.py`; numeric answers are computed there, not typed). All content
is written for this benchmark; the passages to summarize are fictional and contain no personal
data.

| Field      | Values                                                        |
| ---------- | ------------------------------------------------------------- |
| `category` | `coding`, `writing`, `summarizing`, `reasoning`, `format`     |
| `lang`     | `en`, `ta` (Tamil), `hi` (Hindi), `hinglish`                  |
| `style`    | `vague`, `typical`, `well-specified` (how good the prompt is) |
| `check`    | optional deterministic check, see `src/types.ts`              |

`style` exists so the report can show where optimizing helps and where it hurts. The
`well-specified` prompts are the ones the gate should leave alone; if the optimizer rewrites them
and loses, that is the signal M6 tunes on.

## Layout

```
src/cli.ts        entry point
src/config.ts     config schema and defaults
src/models.ts     Ollama, OpenAI-compatible and fake clients
src/optimizer.ts  optimizer interface, stubs and module loader
src/runner.ts     optimize, generate both answers, judge, check
src/judge.ts      pairwise judge prompt, vote parsing, swap-and-combine
src/checks.ts     deterministic answer checks
src/stats.ts      bootstrap CIs, length-controlled regression
src/report.ts     summary and Markdown rendering
data/             dataset and its generator
test/             unit tests (fake models only)
```
