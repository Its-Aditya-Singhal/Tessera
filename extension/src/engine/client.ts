import type { GenReq } from '@tessera/core';
import { browser } from 'wxt/browser';
import type { EngineOp, EngineResponse, TesseraMessage } from '../messaging';
import type { EngineStatus, GenerateResult } from './host';

/** Talks to the shared model host through the service worker. Usable from content scripts and pages. */
async function call<T>(request: EngineOp): Promise<T> {
  const res = (await browser.runtime.sendMessage({
    type: 'tessera/engine',
    request,
  } satisfies TesseraMessage)) as EngineResponse | undefined;
  if (!res) throw new Error('The extension did not answer. Reload the page and try again.');
  if (!res.ok) throw new Error(res.error);
  return res.data as T;
}

export const engineClient = {
  status: () => call<EngineStatus>({ op: 'status' }),
  generate: (req: Omit<GenReq, 'signal'>) => call<GenerateResult>({ op: 'generate', req }),
  intent: () => call<null>({ op: 'intent' }),
  unload: () => call<null>({ op: 'unload' }),
  download: () => call<null>({ op: 'download' }),
};
