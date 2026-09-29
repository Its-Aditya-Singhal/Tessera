import { browser } from 'wxt/browser';
import type { ProbeResponse, SpikeResponse, TesseraMessage } from '../../src/messaging';
import { isTesseraMessage } from '../../src/messaging';
import { probeContext, withTimeout } from '../../src/spike/probe';
import type { ProbeReport } from '../../src/spike/types';
import { SPIKE_MODEL_ID } from '../../src/spike/webllm-spike';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function gpuCell(r: ProbeReport): string {
  const g = r.webgpu;
  if (!g.present) return 'not exposed';
  if (!g.adapter) return `no adapter${g.error ? ` (${g.error})` : ''}`;
  const name =
    [g.adapterInfo?.vendor, g.adapterInfo?.architecture].filter(Boolean).join(' ') || 'adapter';
  const compute = g.compute
    ? `, compute ${g.compute.ok ? 'ok' : `failed (${g.compute.error ?? ''})`}`
    : '';
  return `${name}${g.isFallbackAdapter ? ' (software fallback)' : ''}, f16 ${g.shaderF16 ? 'yes' : 'no'}${compute}`;
}

function promptCell(r: ProbeReport): string {
  const p = r.promptApi;
  if (!p.present) return 'not exposed';
  return p.availability ?? `error: ${p.error ?? 'unknown'}`;
}

function render(reports: ProbeReport[]): void {
  const rows = $('cap-rows');
  rows.replaceChildren(
    ...reports.map((r) => {
      const tr = document.createElement('tr');
      for (const text of [
        r.context,
        gpuCell(r),
        promptCell(r),
        r.deviceMemoryGB ? `${r.deviceMemoryGB} GB` : 'n/a',
      ]) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      }
      return tr;
    }),
  );
  $('cap-raw').textContent = JSON.stringify(reports, null, 2);
}

async function runProbes(): Promise<ProbeReport[]> {
  const local = await probeContext('extension page');
  render([local]);
  let res: ProbeResponse;
  try {
    res = (await withTimeout(
      browser.runtime.sendMessage({ type: 'tessera/probe-offscreen' } satisfies TesseraMessage),
      30_000,
      'offscreen probe',
    )) as ProbeResponse;
  } catch (err) {
    res = { ok: false, error: String(err) };
  }
  const reports = res.ok ? [local, ...res.reports] : [local];
  if (!res.ok) console.warn('offscreen probe failed:', res.error);
  render(reports);
  (window as unknown as { __tesseraProbe: ProbeReport[] }).__tesseraProbe = reports;
  return reports;
}

$('spike-model').textContent = SPIKE_MODEL_ID;
$('spike-size').textContent = 'About 270 MB download, about 580 MB of GPU memory while loaded.';
const consent = $<HTMLInputElement>('spike-consent');
const run = $<HTMLButtonElement>('spike-run');
consent.addEventListener('change', () => (run.disabled = !consent.checked));

browser.runtime.onMessage.addListener((msg: unknown) => {
  if (isTesseraMessage(msg) && msg.type === 'tessera/spike-progress') {
    $('spike-progress').textContent = `${Math.round(msg.progress * 100)}% ${msg.text}`;
  }
});

run.addEventListener('click', async () => {
  run.disabled = true;
  $('spike-progress').textContent = 'Starting…';
  const res = (await browser.runtime.sendMessage({
    type: 'tessera/webllm-spike',
    modelId: SPIKE_MODEL_ID,
    host: 'offscreen-worker',
  } satisfies TesseraMessage)) as SpikeResponse;
  const out = $('spike-out');
  out.hidden = false;
  out.textContent = JSON.stringify(res, null, 2);
  $('spike-progress').textContent = res.ok ? 'Done.' : 'Failed.';
  (window as unknown as { __tesseraSpike: SpikeResponse }).__tesseraSpike = res;
  run.disabled = !consent.checked;
});

void runProbes();
