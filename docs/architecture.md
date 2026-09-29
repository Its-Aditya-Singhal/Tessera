# Architecture

## Components

```mermaid
flowchart LR
  subgraph Page["Chat site tab"]
    CS["Content script<br/>site adapter + Shadow DOM panel"]
  end
  SW["Service worker<br/>coordinator (commands, tabs, lifecycle)"]
  subgraph OD["Offscreen document (model host)"]
    T1["Tier 1: Chrome built-in model"]
    W["Dedicated worker<br/>Tier 2: WebLLM"]
  end
  EP["Extension pages<br/>diagnostics, onboarding, settings"]
  Core["packages/core<br/>pure TS: redaction, gate, capsule"]

  CS <-- runtime messages --> SW
  EP <-- runtime messages --> SW
  SW -- create / message --> OD
  OD --- W
  CS -. imports .-> Core
  OD -. imports .-> Core
```

- `packages/core` has no `chrome.*` and no DOM access, so it runs in Node tests and any context.
- Site-specific code is limited to `extension/src/adapters/configs/*`.
- The service worker can be suspended at any time; it holds no state that matters.

## Lifecycle state machine

```mermaid
stateDiagram-v2
  [*] --> cold
  cold --> warming: gate judges prompt improvable
  warming --> warm: model loaded
  warm --> cooling: AI tabs hidden, window unfocused, or idle
  cooling --> warm: user returns
  cooling --> cold: grace timer expires, machine locked, or unload
  warm --> cold: unload now
```

Implemented in `packages/core/src/engine/lifecycle.ts` as a pure reducer (`reduce`) plus a small
runner (`LifecycleManager`) that executes its effects. It runs inside the offscreen document (the
model host), which keeps one model for all tabs. The service worker forwards context: content
scripts report their tab's visibility, `windows.onFocusChanged` reports focus, and `idle` reports
idle or locked. Modes: on demand (default), keep warm while on AI sites (downgraded to on demand on
devices reporting 4 GB of memory or less), and off. Tier choice (`pickTier`) prefers a ready built-in
model, then a ready local server, then a cached WebLLM model, and otherwise stays on rules.

## Handoff sequence (planned for M7)

```mermaid
sequenceDiagram
  participant U as User
  participant A as Source tab adapter
  participant SW as Service worker
  participant B as Target tab adapter
  U->>A: Transfer
  A->>A: getMessages(), redact, build capsule
  A->>U: Preview with redaction summary
  U->>A: Confirm
  A->>SW: open target new chat
  SW->>B: wait for composer
  B->>B: setComposerText(capsule)
  B->>U: Review and send yourself
```
