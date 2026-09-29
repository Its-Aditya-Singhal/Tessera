# @tessera/eval

Benchmark harnesses live here. The handoff-fidelity harness is in [`handoff/`](handoff/README.md)
and the prompt-quality harness is in [`prompts/`](prompts/README.md) (it runs, but has no results
until the M4 optimizer exists).

| Benchmark                  | Milestone | Command (planned)     |
| -------------------------- | --------- | --------------------- |
| Redaction precision/recall | M3        | `pnpm eval:redaction` |
| Prompt quality             | M5        | `pnpm eval:prompts`   |
| Handoff fidelity           | M8        | `pnpm eval:handoff`   |
| Resource cost              | M8        | `pnpm eval:resources` |

Rules: synthetic data only, local or free-tier models by default, and no fabricated numbers. If a
benchmark cannot run, its results table stays empty with a note saying why.
