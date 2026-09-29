# Tessera

A local-first helper for AI chatbots that stays light by default. Rules handle everyday work, and an
on-device model wakes up only when it is worth it. Works with ChatGPT, Claude and Gemini in Chrome.

> **Status: first release candidate (0.1).** All three features work end to end on a local test
> page. The site adapters have **not yet been verified on the live, signed-in sites**, which change
> their markup often. Please report anything that breaks (see [Feedback](#feedback)).

## What it does

1. **Prompt optimizer.** Checks your prompt as you type and marks the T button when it looks
   underspecified. Open the panel to see hints, answer one or two clarifying questions, or get a
   rewrite from an on-device model with a word-by-word diff. Import it, edit it, undo it, or keep
   yours. Well-specified prompts are left alone.
2. **Privacy layer.** Finds secrets and personal identifiers (API keys, tokens, passwords, cards,
   emails, phone numbers, Aadhaar, PAN, UPI IDs, IFSC codes, IP addresses) and swaps them for
   placeholders like `[EMAIL_1]` before anything reaches a model or another chat. Warns when you
   paste a secret into a chatbox and scrubs it in one click.
3. **Chat handoff.** Carries a conversation to a new chat in another assistant: a summary of the
   goal, facts and decisions, the recent messages and every code block verbatim, redacted first. You
   review it, and you press send yourself.

## Install (Load unpacked)

1. Download `tessera-<version>-chrome.zip` from [Releases](../../releases), or build it with
   `pnpm install && pnpm zip` (it lands in `extension/.output/`). Unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder. A welcome page opens.

Open a supported chat site and press `Alt+Shift+O`, or click the small **T** button above the
chatbox.

## Using it

- **Optimize:** the panel reads what is in the chatbox. Press **Optimize** (or `Ctrl+Enter`).
  - _Looks clear_: nothing to do. **Optimize anyway** asks the model regardless.
  - _Could be clearer_: with a model you get a rewrite and a diff; without one, rule-based hints.
  - _Needs more detail_: answer the questions and press **Continue**.
  - **Use rewrite** puts it in the chatbox; **Undo** puts your text back.
  - Private values stay as placeholders in the chatbox unless you uncheck them.
- **Transfer:** open the **Transfer** tab, pick where to continue and what to bring, press **Capture
  this chat**, review the preview and the private values, then **Open in …**. **Copy** and **Save as
  Markdown** work too.
- **Settings** (gear icon, or the extension's options page): model tier, when the model stays
  loaded, redaction categories, paste warnings, handoff budgets, and **Clear all data**.

## Model tiers

Tessera picks the best tier available, and you can pin one in Settings.

| Tier | What                                         | Cost                                                    |
| ---- | -------------------------------------------- | ------------------------------------------------------- |
| 0    | Rules only (always on)                       | None. About 15 µs per prompt.                           |
| 1    | Chrome's built-in model (Prompt API)         | Downloaded and managed by Chrome, needs recent hardware |
| 2    | WebLLM in the browser (WebGPU), opt-in       | One download of about 280 MB to 880 MB, GPU memory      |
| 3    | A local server such as Ollama on `localhost` | Whatever that server uses                               |

The model loads only when you optimize (or, in "keep warm" mode, while a chat tab is in view) and
unloads after a grace period, 4 minutes by default. See [docs/architecture.md](docs/architecture.md).

## Supported sites

| Site              | Composer read/write                  | Conversation capture | Fixture provenance                                |
| ----------------- | ------------------------------------ | -------------------- | ------------------------------------------------- |
| chatgpt.com       | yes (new and pre-September-2026 DOM) | yes                  | reconstructed, see [fixtures](fixtures/README.md) |
| claude.ai         | yes                                  | yes                  | partly confirmed                                  |
| gemini.google.com | yes                                  | yes                  | reconstructed                                     |

The panel's **Diagnostics** section reports which selectors failed, so a bug report can say exactly
what broke. Fixing one is usually a one-line change:
[docs/updating-a-site-adapter.md](docs/updating-a-site-adapter.md).

## Benchmarks

Every number comes from a script in `packages/eval`; tables that need a model stay empty until a
real run exists.

| Benchmark                                               | Headline                                                                              | Command               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------- |
| [Redaction](docs/benchmarks/redaction.md)               | Precision and recall per category on a synthetic corpus                               | `pnpm eval:redaction` |
| [Prompt gate](docs/benchmarks/gate.md)                  | 96% of vague prompts flagged, 100% of well-specified prompts left alone (176 prompts) | `pnpm eval:gate`      |
| [Capsule coverage](docs/benchmarks/capsule-coverage.md) | Every planted fact, decision and code block kept, at 54% to 74% of full-length tokens | `pnpm eval:capsule`   |
| [Prompt quality](docs/benchmarks/prompt-quality.md)     | Not run yet (needs local models)                                                      | `pnpm eval:prompts`   |
| [Handoff fidelity](docs/benchmarks/handoff-fidelity.md) | Not run yet (needs local models)                                                      | `pnpm eval:handoff`   |

The gate and capsule rules were tuned on the same data they are measured on, so treat those numbers
as optimistic; each page says so.

## Permissions

The four chatbot domains, `storage` for settings, `idle` to unload the model when you are away, and
`offscreen` to host the optional on-device model. Access to `localhost` is optional and requested
only when you enable Tier 3. Full list with reasons: [docs/permissions.md](docs/permissions.md).

## Privacy

Nothing leaves your device and nothing is stored except settings. No accounts, servers, analytics or
telemetry. See [docs/privacy.md](docs/privacy.md).

## Known limitations

- The adapters are tested against saved HTML and a mock chat page, not yet the live sites.
- The Tier 2 model download and load time have not been measured on real hardware yet.
- Attachments (images, files) cannot be transferred; their names are listed so you can re-attach
  them.
- Very long chats: sites load older messages lazily. Transfer scrolls up to fetch them and says so
  when it may have missed some.
- Small on-device models make mistakes. Rules run first, the model is optional, rewrites that drop
  code, links or placeholders are rejected, and every change is shown before you import it.
- Redaction is rule-based and can miss unusual formats. Always glance at the preview.

## Feedback

[Open an issue](../../issues/new/choose). For a broken site, paste the Diagnostics report from the
panel; it contains selectors and counts only, never chat text.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). Repository layout:

```
extension/        MV3 extension (WXT): background, content script, offscreen host, pages
packages/core     Pure TypeScript logic (redaction, optimizer, capsule), no extension APIs
packages/eval     Benchmark harnesses
fixtures/         Saved site HTML for adapter tests (no personal data)
docs/             Architecture, permissions, privacy, benchmarks
```

## Roadmap

| #   | Milestone                                 | State                                  |
| --- | ----------------------------------------- | -------------------------------------- |
| M0  | Setup: repo, tooling, CI, docs skeleton   | done                                   |
| M1  | Risk spikes and site adapters             | done                                   |
| M2  | Engine tiers and lifecycle manager        | done                                   |
| M3  | Privacy layer                             | done                                   |
| M4  | Prompt optimizer                          | done                                   |
| M5  | Evaluation: prompt quality                | harness ready, needs a run with models |
| M6  | Smart behaviour (gate tuning)             | done                                   |
| M7  | Chat handoff                              | done                                   |
| M8  | Evaluation: handoff fidelity and resource | harness ready, needs a run with models |
| M9  | Release                                   | release candidate                      |

## Dependencies

| Package                                                                                | Licence          | Used for               |
| -------------------------------------------------------------------------------------- | ---------------- | ---------------------- |
| wxt                                                                                    | MIT              | Build tool             |
| @mlc-ai/web-llm                                                                        | Apache-2.0       | Tier 2 on-device model |
| typescript, vitest, @playwright/test, eslint, typescript-eslint, prettier, jsdom, jiti | Apache-2.0 / MIT | Development only       |

## Licence

[MIT](LICENSE)
