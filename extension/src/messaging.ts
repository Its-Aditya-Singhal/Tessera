import type { Context, GenReq } from '@tessera/core';
import type { EngineStatus, GenerateResult, HostConfig } from './engine/host';
import type { ProbeReport, WebLlmSpikeResult } from './spike/types';

/** Where a conversation can be handed off to. `mock` exists only in the e2e build. */
export type HandoffTarget = 'chatgpt' | 'claude' | 'gemini' | 'mock';

export type EngineOp =
  | { op: 'status' }
  | { op: 'generate'; req: Omit<GenReq, 'signal'> }
  | { op: 'intent' }
  | { op: 'unload' }
  | { op: 'download' };

/** Messages passed between the service worker, content scripts, the offscreen document and pages. */
export type TesseraMessage =
  | { type: 'tessera/toggle-panel' }
  | { type: 'tessera/tab-visibility'; visible: boolean }
  | { type: 'tessera/engine'; request: EngineOp }
  | {
      type: 'tessera/offscreen/engine';
      request: EngineOp;
      config: HostConfig;
      ctx: Partial<Context>;
    }
  | { type: 'tessera/offscreen/context'; ctx: Partial<Context>; config: HostConfig }
  | { type: 'tessera/engine-status'; status: EngineStatus }
  | { type: 'tessera/open-settings' }
  | { type: 'tessera/handoff/start'; target: HandoffTarget; text: string }
  | { type: 'tessera/handoff/deliver'; text: string }
  | { type: 'tessera/probe-offscreen' }
  | { type: 'tessera/offscreen/probe' }
  | { type: 'tessera/webllm-spike'; modelId: string; host: 'offscreen-worker' }
  | { type: 'tessera/offscreen/webllm-spike'; modelId: string }
  | { type: 'tessera/spike-progress'; text: string; progress: number };

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type EngineResponse = Result<EngineStatus | GenerateResult | null>;
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
