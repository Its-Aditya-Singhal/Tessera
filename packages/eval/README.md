# @tessera/eval

Benchmark harnesses live here. Nothing runs yet.

| Benchmark                  | Milestone | Command (planned)     |
| -------------------------- | --------- | --------------------- |
| Redaction precision/recall | M3        | `pnpm eval:redaction` |
| Prompt quality             | M5        | `pnpm eval:prompts`   |
| Handoff fidelity           | M8        | `pnpm eval:handoff`   |
| Resource cost              | M8        | `pnpm eval:resources` |

Rules: synthetic data only, local or free-tier models by default, and no fabricated numbers. If a
benchmark cannot run, its results table stays empty with a note saying why.
