import { writeFileSync, mkdirSync } from 'node:fs';
import { expect, test } from './fixtures';

/**
 * Milestone 1 risk spike. Records what this Chromium exposes in each context
 * (extension page, offscreen document, worker inside it). The assertions only
 * check that every context answered; the findings are written to
 * test-results/spike-probe.json for docs/spikes.md.
 */
test('probes WebGPU and the Prompt API in every host context', async ({ context, extensionId }) => {
  const page = await context.newPage();
  page.on('console', (m) => console.info(`[diagnostics] ${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => console.info(`[diagnostics] pageerror: ${e.message}`));
  await page.goto(`chrome-extension://${extensionId}/diagnostics.html`);
  const reports = await page.waitForFunction(
    () => (window as unknown as { __tesseraProbe?: unknown[] }).__tesseraProbe,
    null,
    {
      timeout: 30_000,
    },
  );
  const value = (await reports.jsonValue()) as {
    context: string;
    wasm: { ok: boolean };
    webgpu: { adapter: boolean; compute?: { ok: boolean } };
  }[];
  expect(value.map((r) => r.context)).toEqual([
    'extension page',
    'offscreen document',
    'offscreen document → dedicated worker',
  ]);
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/spike-probe.json', JSON.stringify(value, null, 2));
  // Every context that exposes WebGPU must also be able to run compute (the actual WebLLM requirement).
  for (const r of value) {
    expect(r.wasm.ok).toBe(true);
    if (r.webgpu.adapter) expect(r.webgpu.compute?.ok).toBe(true);
  }
  console.info(JSON.stringify(value, null, 2));
});

test('loads a small WebLLM model in the offscreen worker', async ({ context, extensionId }) => {
  test.skip(
    !process.env.TESSERA_SPIKE_WEBLLM,
    'Downloads ~270 MB; set TESSERA_SPIKE_WEBLLM=1 to run.',
  );
  test.setTimeout(20 * 60_000);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/diagnostics.html`);
  await page.getByLabel(/I understand this downloads/).check();
  await page.getByRole('button', { name: 'Run spike' }).click();
  const res = await page.waitForFunction(
    () => (window as unknown as { __tesseraSpike?: unknown }).__tesseraSpike,
    null,
    {
      timeout: 19 * 60_000,
      polling: 1000,
    },
  );
  const value = (await res.jsonValue()) as { ok: boolean };
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/spike-webllm.json', JSON.stringify(value, null, 2));
  console.info(JSON.stringify(value, null, 2));
  expect(value.ok).toBe(true);
});
