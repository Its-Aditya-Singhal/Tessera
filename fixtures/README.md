# Site fixtures

Trimmed HTML of each supported site's composer and conversation, used by the adapter unit tests
(`extension/test/adapters.test.ts`). They contain no personal data.

**Provenance matters here.** A fixture is only as good as the day it was saved.

| File | Source | Captured |
| --- | --- | --- |
| `chatgpt.html` | Reconstructed from public reports of ChatGPT's September 2026 DOM (see the config file's comments), not saved from a live session | 2026-09-29 |
| `chatgpt-legacy.html` | Reconstructed pre-redesign DOM (`#prompt-textarea`, `data-message-author-role`) | 2026-09-29 |
| `claude.html` | Composer wrapper `aria-label` confirmed from a logged-out page load; conversation markup reconstructed | 2026-09-29 |
| `gemini.html` | Reconstructed from public reports (Angular custom elements, Quill composer) | 2026-09-29 |

The build environment that produced these could not load chatgpt.com or gemini.google.com, so none
of them is a verbatim capture of a signed-in page yet. Replace them with real captures (see
`docs/updating-a-site-adapter.md`) and keep this table current.
