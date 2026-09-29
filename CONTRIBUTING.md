# Contributing

Thanks for helping. Tessera is small on purpose; please keep it that way.

## Setup

Requires Node 22.22+ and pnpm 10.

```sh
pnpm install
pnpm dev          # WXT dev mode with reload
pnpm test         # Vitest (core + extension)
pnpm build:e2e && pnpm e2e   # Playwright against the local mock chat page
pnpm lint && pnpm typecheck && pnpm format:check
```

## Ground rules

- `packages/core` must not use `chrome.*` or the DOM. It should run in plain Node.
- No network calls, analytics or telemetry. Model downloads only after explicit consent.
- Every new permission needs a row in `docs/permissions.md`.
- New dependencies: open-source only, note the licence in the PR, and prefer none.
- Test data is synthetic. Never commit real personal data, real IDs, or real chat logs.
- Benchmark tables are never filled in by hand. If an eval cannot run, leave it empty and say why.

## Site changes

See [docs/updating-a-site-adapter.md](docs/updating-a-site-adapter.md).
