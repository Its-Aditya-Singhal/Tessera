import { browser } from 'wxt/browser';
import {
  isTesseraMessage,
  type ProbeResponse,
  type SpikeResponse,
  type TesseraMessage,
} from '../../src/messaging';
import { probeContext, withTimeout } from '../../src/spike/probe';
import type { ProbeReport } from '../../src/spike/types';
import { runWebLlmSpike } from '../../src/spike/webllm-spike';

// The offscreen document is the model host. Only the runtime API exists here.

async function probeWorker(): Promise<ProbeReport> {
  const worker = new Worker(new URL('../../src/spike/probe.worker.ts', import.meta.url), {
    type: 'module',
  });
  try {
    return await withTimeout(
      new Promise<ProbeReport>((resolve, reject) => {
        worker.onmessage = (ev: MessageEvent<ProbeReport>) => resolve(ev.data);
        worker.onerror = (ev) => reject(new Error(ev.message));
        worker.postMessage('probe');
      }),
      20_000,
      'worker probe',
    );
  } finally {
    worker.terminate();
  }
}

browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  if (!isTesseraMessage(msg)) return false;
  if (msg.type === 'tessera/offscreen/probe') {
    Promise.all([probeContext('offscreen document'), probeWorker()]).then(
      (reports) => sendResponse({ ok: true, reports } satisfies ProbeResponse),
      (err: unknown) => sendResponse({ ok: false, error: String(err) } satisfies ProbeResponse),
    );
    return true;
  }
  if (msg.type === 'tessera/offscreen/webllm-spike') {
    runWebLlmSpike('offscreen document → dedicated worker', msg.modelId, (text, progress) => {
      void browser.runtime
        .sendMessage({ type: 'tessera/spike-progress', text, progress } satisfies TesseraMessage)
        .catch(() => undefined);
    }).then(
      (result) => sendResponse({ ok: true, result } satisfies SpikeResponse),
      (err: unknown) => sendResponse({ ok: false, error: String(err) } satisfies SpikeResponse),
    );
    return true;
  }
  return false;
});
