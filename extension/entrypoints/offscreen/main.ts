import { browser } from 'wxt/browser';
import { EngineHost, type HostConfig } from '../../src/engine/host';
import {
  isTesseraMessage,
  type EngineOp,
  type EngineResponse,
  type ProbeResponse,
  type SpikeResponse,
  type TesseraMessage,
} from '../../src/messaging';
import { probeContext, withTimeout } from '../../src/spike/probe';
import type { ProbeReport } from '../../src/spike/types';
import { runWebLlmSpike } from '../../src/spike/webllm-spike';

// The offscreen document is the model host: one shared model for every tab.
// Only the runtime API exists here; the service worker passes settings and context in.

let host: EngineHost | undefined;

function getHost(config: HostConfig): EngineHost {
  if (!host) {
    host = new EngineHost(config, (status) => {
      void browser.runtime
        .sendMessage({ type: 'tessera/engine-status', status } satisfies TesseraMessage)
        .catch(() => undefined);
    });
  } else {
    host.configure(config);
  }
  return host;
}

async function handleEngine(h: EngineHost, request: EngineOp): Promise<EngineResponse> {
  switch (request.op) {
    case 'status':
      return { ok: true, data: await h.status() };
    case 'generate':
      return { ok: true, data: await h.generate(request.req) };
    case 'intent':
      await h.refreshAvailability();
      h.intent();
      return { ok: true, data: null };
    case 'unload':
      h.unloadNow();
      return { ok: true, data: await h.status(false) };
    case 'download':
      await h.download();
      return { ok: true, data: await h.status() };
  }
}

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
  switch (msg.type) {
    case 'tessera/offscreen/context':
      getHost(msg.config).context(msg.ctx);
      return false;
    case 'tessera/offscreen/engine': {
      const h = getHost(msg.config);
      h.context(msg.ctx);
      handleEngine(h, msg.request).then(sendResponse, (err: unknown) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        } satisfies EngineResponse),
      );
      return true;
    }
    case 'tessera/offscreen/probe':
      Promise.all([probeContext('offscreen document'), probeWorker()]).then(
        (reports) => sendResponse({ ok: true, reports } satisfies ProbeResponse),
        (err: unknown) => sendResponse({ ok: false, error: String(err) } satisfies ProbeResponse),
      );
      return true;
    case 'tessera/offscreen/webllm-spike':
      runWebLlmSpike('offscreen document → dedicated worker', msg.modelId, (text, progress) => {
        void browser.runtime
          .sendMessage({ type: 'tessera/spike-progress', text, progress } satisfies TesseraMessage)
          .catch(() => undefined);
      }).then(
        (result) => sendResponse({ ok: true, result } satisfies SpikeResponse),
        (err: unknown) => sendResponse({ ok: false, error: String(err) } satisfies SpikeResponse),
      );
      return true;
    default:
      return false;
  }
});
