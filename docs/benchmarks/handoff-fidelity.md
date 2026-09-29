# Handoff-fidelity benchmark

How much of a conversation survives when Tessera hands it to another chatbot, compared across four
conditions: full transcript, hybrid capsule, plain summary and no context. Methodology, dataset and
scoring are described in [`packages/eval/handoff/README.md`](../../packages/eval/handoff/README.md).
Reproduce with `pnpm eval:handoff`.

## Results

No results yet. The table stays empty until a real run exists, because:

- A run needs a local target model (and optionally a judge), and none was reachable from the
  environment that built this release. The hybrid capsule builder exists (M7) and is wired in
  through `packages/eval/handoff/src/tessera-capsule.ts`.
- A model-free check of what the capsule keeps is published in
  [capsule-coverage.md](capsule-coverage.md).
- The harness has only been exercised with deterministic fake models (`pnpm eval:handoff --fake`).
  Those outputs check the pipeline and are not results.

| Condition       | Facts retained | Decisions retained | Stale decisions | Code exact | Context tokens | Generation tokens |
| --------------- | -------------- | ------------------ | --------------- | ---------- | -------------- | ----------------- |
| Full transcript |                |                    |                 |            |                |                   |
| Hybrid capsule  |                |                    |                 |            |                |                   |
| Plain summary   |                |                    |                 |            |                |                   |
| No context      |                |                    |                 |            |                |                   |

Target model, summarizer, hardware and dataset hash will be listed with the first real run.
