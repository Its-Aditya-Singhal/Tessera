# Milestone 1 risk spikes

Two questions had to be answered before building the engine (M2):

1. Does WebGPU, and therefore WebLLM, work in the context we would host the model in?
2. Can the extension use Chrome's built-in model (Prompt API, `LanguageModel`)?

## Where the model lives

Manifest V3 service workers are suspended when idle, so the model cannot live there. The chosen host
is an **offscreen document** (`chrome.offscreen`, reason `WORKERS`) that runs the model inside a
**dedicated worker**. The service worker only coordinates. Offscreen documents opened with any reason
other than `AUDIO_PLAYBACK` have no automatic lifetime limit, and only one can exist per profile,
which matches the "one shared model instance" rule. Only `chrome.runtime` is available inside, so
everything else (tabs, idle, alarms) stays in the service worker.

## How to reproduce

```sh
pnpm build:e2e
pnpm --filter @tessera/extension exec playwright test e2e/spike.spec.ts
# Optional, downloads about 270 MB of weights:
TESSERA_SPIKE_WEBLLM=1 pnpm --filter @tessera/extension exec playwright test e2e/spike.spec.ts
```

Or load the extension and open `chrome-extension://<id>/diagnostics.html`, which shows the same
table and has a consented "Run spike" button for WebLLM.

## What was checked, and how

| Claim                                                                                                                                                                                    | How it was verified                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Prompt API shape (`LanguageModel.availability()`, `create()`, `params()` in extensions), hardware bar (22 GB free disk; >4 GB VRAM or 16 GB RAM and 4 cores), extensions from Chrome 138 | [developer.chrome.com/docs/ai/prompt-api](https://developer.chrome.com/docs/ai/prompt-api), read 2026-09-29                          |
| Prompt API "only available to top-level windows and their same-origin iframes", not workers                                                                                              | Same page. **Contradicted in Chromium 141, see below.**                                                                              |
| `create()` needs user activation while the model is `downloadable` or `downloading`                                                                                                      | [developer.chrome.com/docs/ai/get-started](https://developer.chrome.com/docs/ai/get-started)                                         |
| Offscreen reasons, one document per profile, only `runtime` inside                                                                                                                       | [developer.chrome.com/docs/extensions/reference/api/offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen) |
| WebLLM 0.2.85 runs in a dedicated worker (`CreateWebWorkerMLCEngine`), has JSON mode, Apache-2.0                                                                                         | [github.com/mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) and the installed package's types                                     |

## Results (2026-09-29, headless Chromium 141.0.7390.37, Linux x64 cloud container, no GPU)

From `e2e/spike.spec.ts` (`test-results/spike-probe.json`):

| Context                                        | WebGPU adapter                                        | Compute shader | WebAssembly under our CSP | `LanguageModel` | `availability()` |
| ---------------------------------------------- | ----------------------------------------------------- | -------------- | ------------------------- | --------------- | ---------------- |
| Extension page (`diagnostics.html`)            | yes (SwiftShader, software fallback, no `shader-f16`) | ran correctly  | yes                       | present         | `downloadable`   |
| Offscreen document                             | yes (same)                                            | ran correctly  | yes                       | present         | `downloadable`   |
| Dedicated worker inside the offscreen document | yes (same)                                            | ran correctly  | yes                       | **present**     | `downloadable`   |

`LanguageModel.params()` returned `{ defaultTopK: 0, maxTopK: 128, defaultTemperature: 0, maxTemperature: 2 }`
in every context. `navigator.deviceMemory` reported 8 (the API caps at 8, so it is a coarse hint only).
`navigator.getBattery` existed in documents but not in the worker.

### Answers

1. **WebGPU in the chosen host: yes.** A WebGPU device was created and a compute shader produced
   correct results inside the offscreen document and inside its dedicated worker. The WebLLM worker
   bundle also loaded and started the engine there. It stopped at the first weight fetch because this
   container's network policy blocks `huggingface.co`. **A full model load, time to first token and
   tokens per second have not been measured yet.** That needs a normal machine; the spike test and the
   diagnostics page are ready for it.
2. **Prompt API from the extension: reachable, not yet exercised end to end.** `LanguageModel` is
   exposed in extension pages, the offscreen document and, contrary to the docs, its worker (in
   Chromium 141). Availability was `downloadable` because the container has no model and weak
   hardware. `create()` was not called because it would start a multi-gigabyte download.

### Design consequences for M2

- The first `create()` (which triggers the download) must happen **on an extension page after a
  click**, for example in onboarding, because the offscreen document never has user activation.
  After the model is `available`, sessions can be created from the offscreen document.
- Do not rely on the Prompt API existing in workers: the docs say it should not, so host Tier 1 on
  the offscreen document's main thread and Tier 2 (WebLLM) in its worker.
- Prefer `q4f32` models when the adapter lacks `shader-f16` (the spike model is
  `SmolLM2-360M-Instruct-q4f32_1-MLC`).
- The WebLLM library is about 6 MB and is currently bundled twice (worker and page chunk), which makes
  the zip about 4.3 MB. Worth trimming in M2.

### Still open

- Real numbers from 2-3 real machines (one with a discrete GPU, one integrated, one low-memory).
- Whether `LanguageModel.create()` succeeds from the offscreen document once the model is available.
- Behaviour when Chrome kills the offscreen document mid-generation (M2 lifecycle work).
