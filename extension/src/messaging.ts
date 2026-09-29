import type { ProbeReport, WebLlmSpikeResult } from './spike/types';

/** Messages passed between the service worker, content scripts, offscreen document and pages. */
export type TesseraMessage =
  | { type: 'tessera/toggle-panel' }
  | { type: 'tessera/probe-offscreen' }
  | { type: 'tessera/offscreen/probe' }
  | { type: 'tessera/webllm-spike'; modelId: string; host: 'offscreen-worker' }
  | { type: 'tessera/offscreen/webllm-spike'; modelId: string }
  | { type: 'tessera/spike-progress'; text: string; progress: number };

export type ProbeResponse = { ok: true; reports: ProbeReport[] } | { ok: false; error: string };
export type SpikeResponse = { ok: true; result: WebLlmSpikeResult } | { ok: false; error: string };

export function isTesseraMessage(msg: unknown): msg is TesseraMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    typeof (msg as { type?: unknown }).type === 'string' &&
    (msg as { type: string }).type.startsWith('tessera/')
  );
}
