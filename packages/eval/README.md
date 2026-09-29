# @tessera/eval

Benchmark harnesses live here. The handoff-fidelity harness is in [`handoff/`](handoff/README.md)
and the prompt-quality harness is in [`prompts/`](prompts/README.md) (it can run the real optimizer, but has no
published results until a run with local models is done).

| Benchmark                  | Milestone | Command               |
| -------------------------- | --------- | --------------------- |
| Redaction precision/recall | M3        | `pnpm eval:redaction` |
| Prompt gate (no model)     | M6        | `pnpm eval:gate`      |
| Prompt quality             | M5        | `pnpm eval:prompts`   |
| Handoff fidelity           | M8        | `pnpm eval:handoff`   |
| Resource cost              | M8        | `pnpm eval:resources` |

Rules: synthetic data only, local or free-tier models by default, and no fabricated numbers. If a
benchmark cannot run, its results table stays empty with a note saying why.
