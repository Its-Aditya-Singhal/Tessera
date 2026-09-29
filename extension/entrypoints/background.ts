import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { isTesseraMessage, type TesseraMessage } from '../src/messaging';

/**
 * The service worker only coordinates. Chrome suspends it when idle, so anything
 * long-lived (the model) lives in the offscreen document instead.
 */
export default defineBackground(() => {
  const togglePanel = async (tabId?: number) => {
    const id = tabId ?? (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (id === undefined) return;
    try {
      await browser.tabs.sendMessage(id, { type: 'tessera/toggle-panel' } satisfies TesseraMessage);
    } catch {
      // Not a supported site, so there is no content script to answer. Nothing to do.
    }
  };

  browser.commands.onCommand.addListener((command) => {
    if (command === 'toggle-panel') void togglePanel();
  });
  browser.action.onClicked.addListener((tab) => void togglePanel(tab.id));

  browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    if (!isTesseraMessage(msg)) return false;
    const forward = (inner: TesseraMessage) =>
      ensureOffscreen()
        .then(() => browser.runtime.sendMessage(inner))
        .then(sendResponse, (err: unknown) => sendResponse({ ok: false, error: String(err) }));
    switch (msg.type) {
      case 'tessera/probe-offscreen':
        void forward({ type: 'tessera/offscreen/probe' });
        return true;
      case 'tessera/webllm-spike':
        void forward({ type: 'tessera/offscreen/webllm-spike', modelId: msg.modelId });
        return true;
      default:
        return false;
    }
  });
});

const OFFSCREEN_PATH = 'offscreen.html';
let creating: Promise<void> | undefined;

/** Creates the offscreen document if it is not running. Chrome allows one per profile. */
async function ensureOffscreen(): Promise<void> {
  const url = browser.runtime.getURL(`/${OFFSCREEN_PATH}`);
  const existing = await browser.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as Browser.runtime.ContextType],
    documentUrls: [url],
  });
  if (existing.length) return;
  creating ??= browser.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['WORKERS' as Browser.offscreen.Reason],
      justification:
        'Hosts the optional on-device language model in a worker so it survives service worker suspension.',
    })
    .finally(() => {
      creating = undefined;
    });
  await creating;
}
