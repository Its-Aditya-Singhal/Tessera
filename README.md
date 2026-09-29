# Tessera

A local-first layer for AI chatbots that is light by default. Rules handle everyday work, and an
on-device model wakes up only when it is worth it. Works with ChatGPT, Claude and Gemini in Chrome.

> **Status: early development (milestone 1 of 9).** The site adapters, in-page panel and model-host
> spikes exist. The optimizer, privacy layer and handoff are not built yet. See [Roadmap](#roadmap).

## The three pillars

1. **Prompt optimizer.** Shows an optimized version of your prompt next to the original, with a
   diff. Import it into the chatbox, undo it, or keep yours. It can also say "this is already good"
   or ask one or two clarifying questions. _(M4)_
2. **Privacy layer.** Finds secrets and personal identifiers (API keys, emails, phone numbers,
   Aadhaar, PAN, UPI IDs, and more) on your device and swaps them for placeholders before anything is
   optimized, transferred or pasted. _(M3)_
3. **Chat handoff.** Carries a conversation from one chatbot to another as context, with redaction
   applied first. You review it and press send yourself. _(M7)_

Demo GIF: coming with the first release.

## Install (Load unpacked)

1. Download `tessera-<version>-chrome.zip` from [Releases](../../releases), or build it with
   `pnpm install && pnpm zip` (it lands in `extension/.output/`). Unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder.

Open a supported chat site and press `Alt+Shift+O` (or the small **T** button above the chatbox).

## Supported sites

| Site              | Composer read/write                  | Conversation capture | Fixture provenance                                |
| ----------------- | ------------------------------------ | -------------------- | ------------------------------------------------- |
| chatgpt.com       | yes (new and pre-September-2026 DOM) | yes                  | reconstructed, see [fixtures](fixtures/README.md) |
| claude.ai         | yes                                  | yes                  | partly confirmed                                  |
| gemini.google.com | yes                                  | yes                  | reconstructed                                     |

Adapters are tested against saved HTML and a local mock chat page. They have **not yet been verified
on the live signed-in sites**, which change their markup often. The panel's **Diagnostics** section
reports which selectors failed so a bug report can say exactly what broke.

## Permissions

Only the four chatbot domains, plus `offscreen` to host the optional on-device model. Access to
`localhost` (for a local model server) is optional and requested only when you enable it. Full list
with reasons: [docs/permissions.md](docs/permissions.md).

## Privacy

Nothing leaves your device and nothing is stored except settings. No accounts, servers, analytics or
telemetry. See [docs/privacy.md](docs/privacy.md).

## Known limitations

- Attachments (images, files) cannot be transferred between chatbots; their names are listed so you
  can re-attach them.
- Chat sites change their DOM often, which can break the adapters until a selector is updated.
- Small on-device models make mistakes. Rules run first, the model is optional, and every change is
  shown before you import it.
- Chrome's built-in model needs recent hardware (see [docs/spikes.md](docs/spikes.md)).

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). Repository layout:

```
extension/        MV3 extension (WXT): background, content script, offscreen host, pages
packages/core     Pure TypeScript logic, no browser extension APIs
packages/eval     Benchmark harnesses (M3, M5, M8)
fixtures/         Saved site HTML for adapter tests (no personal data)
docs/             Architecture, permissions, privacy, spikes
```

Build tool: [WXT](https://wxt.dev). It handles Manifest V3 entrypoints (service worker, content
scripts, offscreen and extension pages), bundles workers for WebLLM, and zips releases, with less
configuration than a hand-rolled Vite setup.

## Roadmap

| #   | Milestone                               | State                |
| --- | --------------------------------------- | -------------------- |
| M0  | Setup: repo, tooling, CI, docs skeleton | done                 |
| M1  | Risk spikes and site adapters           | done, pending review |
| M2  | Engine tiers and lifecycle manager      |                      |
| M3  | Privacy layer                           |                      |
| M4  | Prompt optimizer                        |                      |
| M5  | Evaluation: prompts                     |                      |
| M6  | Smart behaviour (gate tuning)           |                      |
| M7  | Chat handoff                            |                      |
| M8  | Evaluation: handoff and resources       |                      |
| M9  | Release                                 |                      |

## Dependencies

| Package                                                                          | Licence          | Used for               |
| -------------------------------------------------------------------------------- | ---------------- | ---------------------- |
| wxt                                                                              | MIT              | Build tool             |
| @mlc-ai/web-llm                                                                  | Apache-2.0       | Tier 2 on-device model |
| typescript, vitest, @playwright/test, eslint, typescript-eslint, prettier, jsdom | Apache-2.0 / MIT | Development only       |

## Licence

[MIT](LICENSE)
