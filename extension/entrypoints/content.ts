import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { adapterFor } from '../src/adapters/registry';
import { isTesseraMessage, type Result, type TesseraMessage } from '../src/messaging';
import { engineClient } from '../src/engine/client';
import { DEFAULT_SETTINGS, loadSettings, onSettingsChanged, type Settings } from '../src/settings';
import { mountPanel } from '../src/ui/panel';
import { createTransferView } from '../src/ui/transfer-view';
import { CHATBOT_MATCHES } from '../src/matches';

export default defineContentScript({
  matches: CHATBOT_MATCHES,
  runAt: 'document_idle',
  main(ctx) {
    const adapter = adapterFor(new URL(location.href));
    // The e2e build also runs on localhost; only the mock page there gets the UI.
    if (!adapter || (adapter.id === 'mock' && !__TESSERA_E2E__)) return;

    let settings: Settings = DEFAULT_SETTINGS;
    void loadSettings().then((s) => (settings = s));
    ctx.onInvalidated(onSettingsChanged((s) => (settings = s)));

    const panel = mountPanel(adapter, browser.runtime.getManifest().version, (api) => ({
      getSettings: () => settings,
      engine: engineClient,
      openSettings: () =>
        void browser.runtime
          .sendMessage({ type: 'tessera/open-settings' } satisfies TesseraMessage)
          .catch(() => undefined),
      extraViews: [
        createTransferView({
          adapter,
          getSettings: () => settings,
          setStatus: api.setStatus,
          startHandoff: async (target, text) => {
            const res = (await browser.runtime.sendMessage({
              type: 'tessera/handoff/start',
              target,
              text,
            } satisfies TesseraMessage)) as Result<null> | undefined;
            if (!res?.ok) throw new Error(res?.error ?? 'The extension did not answer.');
          },
          ...(__TESSERA_E2E__
            ? { extraTargets: [{ id: 'mock' as const, label: 'Mock chat', budget: 24_000 }] }
            : {}),
        }),
      ],
    }));
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

    let delivering = false;
    browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
      if (!isTesseraMessage(msg)) return false;
      if (msg.type === 'tessera/toggle-panel') {
        panel.toggle();
        return false;
      }
      if (msg.type === 'tessera/handoff/deliver') {
        // The service worker retries until this succeeds; ignore overlapping attempts.
        if (delivering) {
          sendResponse({ ok: false, error: 'Still placing the text.' } satisfies Result<null>);
          return false;
        }
        delivering = true;
        void deliver(msg.text)
          .then(sendResponse)
          .finally(() => (delivering = false));
        return true;
      }
      return false;
    });

    // Places handoff text in this (new) chat's composer. Never sends.
    const deliver = async (text: string): Promise<Result<null>> => {
      const composer = await adapter.waitForComposer(10_000);
      if (!composer) return { ok: false, error: 'The chatbox did not appear.' };
      const ok = await panel.importText(text, 'Handoff');
      if (!ok) return { ok: false, error: 'The chatbox did not accept the text.' };
      panel.open();
      panel.setStatus(
        'Handoff text placed in the chatbox. Review it, add your next message, then send it yourself.',
        'ok',
      );
      return { ok: true, data: null };
    };

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
