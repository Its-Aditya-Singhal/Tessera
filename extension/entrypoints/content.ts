import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { adapterFor } from '../src/adapters/registry';
import { isTesseraMessage, type TesseraMessage } from '../src/messaging';
import { mountPanel } from '../src/ui/panel';
import { CHATBOT_MATCHES } from '../src/matches';

export default defineContentScript({
  matches: CHATBOT_MATCHES,
  runAt: 'document_idle',
  main(ctx) {
    const adapter = adapterFor(new URL(location.href));
    // The e2e build also runs on localhost; only the mock page there gets the UI.
    if (!adapter || (adapter.id === 'mock' && !__TESSERA_E2E__)) return;

    const panel = mountPanel(adapter, browser.runtime.getManifest().version);
    ctx.onInvalidated(() => panel.destroy());

    // Tell the model host whether an AI tab is in view, so the lifecycle can cool down when it is not.
    const reportVisibility = () =>
      void browser.runtime
        .sendMessage({
          type: 'tessera/tab-visibility',
          visible: document.visibilityState === 'visible',
        } satisfies TesseraMessage)
        .catch(() => undefined);
    reportVisibility();
    document.addEventListener('visibilitychange', reportVisibility);
    ctx.onInvalidated(() => document.removeEventListener('visibilitychange', reportVisibility));

    browser.runtime.onMessage.addListener((msg: unknown) => {
      if (isTesseraMessage(msg) && msg.type === 'tessera/toggle-panel') panel.toggle();
    });

    if (__TESSERA_E2E__) {
      // Test-only bridge so Playwright can drive the adapter from the page. Compiled out of release builds.
      window.addEventListener('message', async (ev) => {
        const data = ev.data as { source?: string; cmd?: string; maxScrolls?: number } | undefined;
        if (ev.source !== window || data?.source !== 'tessera-e2e') return;
        if (data.cmd === 'capture') {
          const result = await adapter.captureMessages({
            maxScrolls: data.maxScrolls ?? 25,
            scrollSettleMs: 150,
          });
          window.postMessage({ source: 'tessera-e2e-result', cmd: 'capture', result }, '*');
        }
      });
    }
  },
});
