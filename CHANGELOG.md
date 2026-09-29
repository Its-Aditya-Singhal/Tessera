# Changelog

## 0.1.0 (release candidate)

First complete build. Load it unpacked from the release zip.

- Prompt optimizer: rules-only quality gate with live hints and clarifying questions; optional
  rewrite by an on-device model (Chrome built-in model, WebLLM or a local Ollama server) with a word
  diff, edit before import, invariant checks and Undo.
- Privacy layer: on-device detection of 13 kinds of secrets and identifiers, placeholders with a
  per-item review list, paste warning with one-click scrub.
- Chat handoff: capture a conversation, build a full, summary or hybrid capsule within a per-site
  token budget, review the redacted preview, and open it in a new chat without sending.
- Model lifecycle: on-demand, keep-warm or off, with a grace period and low-memory fallback.
- Settings, onboarding and Clear all data.
- Benchmarks: redaction, prompt gate and capsule coverage published; prompt-quality and
  handoff-fidelity harnesses ready for a run with local models.

Known risks: the site adapters are not yet verified on the live signed-in sites, and the WebLLM
model load has not been measured on real hardware.
