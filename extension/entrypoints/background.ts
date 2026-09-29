import type { Context } from '@tessera/core';
import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import type { HostConfig } from '../src/engine/host';
import {
  isTesseraMessage,
  type EngineResponse,
  type HandoffTarget,
  type TesseraMessage,
} from '../src/messaging';
import { loadSettings, onSettingsChanged } from '../src/settings';

/**
 * The service worker only coordinates. Chrome suspends it when idle, so it keeps
 * nothing important in memory: tab visibility lives in storage.session (memory
 * only, never on disk) and the model lives in the offscreen document.
 */
export default defineBackground(() => {
  const togglePanel = async (tabId?: number) => {
    const id = tabId ?? (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (id === undefined) return;
    try {
      await browser.tabs.sendMessage(id, { type: 'tessera/toggle-panel' } satisfies TesseraMessage);
    } catch {
      // Not a supported site: open settings instead so the click does something useful.
      await browser.runtime.openOptionsPage();
    }
  };

  browser.commands.onCommand.addListener((command) => {
    if (command === 'toggle-panel') void togglePanel();
  });
  browser.action.onClicked.addListener((tab) => void togglePanel(tab.id));

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install')
      void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
  });

  browser.idle.setDetectionInterval(300);
  browser.idle.onStateChanged.addListener((state) => void updateContext({ idle: state }));
  browser.windows.onFocusChanged.addListener(
    (windowId) =>
      void updateContext({ windowFocused: windowId !== browser.windows.WINDOW_ID_NONE }),
  );
  browser.tabs.onRemoved.addListener((tabId) => void setTabVisible(tabId, false));
  onSettingsChanged(() => void pushToHost());

  browser.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
    if (!isTesseraMessage(msg)) return false;
    switch (msg.type) {
      case 'tessera/tab-visibility':
        if (sender.tab?.id !== undefined) void setTabVisible(sender.tab.id, msg.visible);
        return false;
      case 'tessera/open-settings':
        void browser.runtime.openOptionsPage();
        return false;
      case 'tessera/engine':
        relayEngine(msg.request).then(sendResponse, (err: unknown) =>
          sendResponse({ ok: false, error: errorText(err) } satisfies EngineResponse),
        );
        return true;
      case 'tessera/handoff/start':
        startHandoff(msg.target, msg.text).then(
          () => sendResponse({ ok: true, data: null }),
          (err: unknown) => sendResponse({ ok: false, error: errorText(err) }),
        );
        return true;
      case 'tessera/probe-offscreen':
        void ensureOffscreen()
          .then(() =>
            browser.runtime.sendMessage({
              type: 'tessera/offscreen/probe',
            } satisfies TesseraMessage),
          )
          .then(sendResponse, (err: unknown) => sendResponse({ ok: false, error: errorText(err) }));
        return true;
      case 'tessera/webllm-spike':
        void ensureOffscreen()
          .then(() =>
            browser.runtime.sendMessage({
              type: 'tessera/offscreen/webllm-spike',
              modelId: msg.modelId,
            } satisfies TesseraMessage),
          )
          .then(sendResponse, (err: unknown) => sendResponse({ ok: false, error: errorText(err) }));
        return true;
      default:
        return false;
    }
  });
});

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// ---- Context: which AI tabs are visible, focus, idle ----

interface StoredContext {
  visibleTabs: Record<string, boolean>;
  windowFocused: boolean;
  idle: Context['idle'];
}

async function readContext(): Promise<StoredContext> {
  const got = (await browser.storage.session.get('ctx')) as { ctx?: StoredContext };
  return got.ctx ?? { visibleTabs: {}, windowFocused: true, idle: 'active' };
}

function toContext(s: StoredContext): Context {
  return {
    visibleAiTabs: Object.values(s.visibleTabs).filter(Boolean).length,
    windowFocused: s.windowFocused,
    idle: s.idle,
  };
}

async function setTabVisible(tabId: number, visible: boolean): Promise<void> {
  const s = await readContext();
  if (visible) s.visibleTabs[String(tabId)] = true;
  else delete s.visibleTabs[String(tabId)];
  await browser.storage.session.set({ ctx: s });
  await pushToHost();
}

async function updateContext(patch: Partial<Omit<StoredContext, 'visibleTabs'>>): Promise<void> {
  const s = { ...(await readContext()), ...patch };
  await browser.storage.session.set({ ctx: s });
  await pushToHost();
}

async function hostConfig(): Promise<HostConfig> {
  const s = await loadSettings();
  const localhostGranted = await browser.permissions.contains({
    origins: ['http://localhost/*', 'http://127.0.0.1/*'],
  });
  return {
    tier: s.tier,
    lifecycleMode: s.lifecycleMode,
    graceMinutes: s.graceMinutes,
    webllmModel: s.webllmModel,
    webllmConsent: s.webllmConsent,
    ollama: s.ollama,
    localhostGranted,
  };
}

/**
 * Sends the current context and settings to the model host. The host is only
 * created here when "keep warm" needs it; otherwise it appears on first use.
 */
async function pushToHost(): Promise<void> {
  const [config, stored] = await Promise.all([hostConfig(), readContext()]);
  const ctx = toContext(stored);
  const wantHost = config.lifecycleMode === 'keep-warm' && ctx.visibleAiTabs > 0;
  if (!(await hasOffscreen()) && !wantHost) return;
  await ensureOffscreen();
  await browser.runtime
    .sendMessage({ type: 'tessera/offscreen/context', ctx, config } satisfies TesseraMessage)
    .catch(() => undefined);
}

async function relayEngine(
  request: Extract<TesseraMessage, { type: 'tessera/engine' }>['request'],
): Promise<EngineResponse> {
  const [config, stored] = await Promise.all([hostConfig(), readContext()]);
  await ensureOffscreen();
  const res = (await browser.runtime.sendMessage({
    type: 'tessera/offscreen/engine',
    request,
    config,
    ctx: toContext(stored),
  } satisfies TesseraMessage)) as EngineResponse | undefined;
  return res ?? { ok: false, error: 'The model host did not answer.' };
}

// ---- Offscreen document (model host) ----

const OFFSCREEN_PATH = 'offscreen.html';
let creating: Promise<void> | undefined;

async function hasOffscreen(): Promise<boolean> {
  const existing = await browser.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as Browser.runtime.ContextType],
    documentUrls: [browser.runtime.getURL(`/${OFFSCREEN_PATH}`)],
  });
  return existing.length > 0;
}

/** Creates the offscreen document if it is not running (Chrome allows one per profile, and may kill it). */
async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreen()) return;
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

// ---- Handoff: open the target chat and hand it the capsule ----

const NEW_CHAT: Partial<Record<HandoffTarget, string>> = {
  chatgpt: 'https://chatgpt.com/',
  claude: 'https://claude.ai/new',
  gemini: 'https://gemini.google.com/app',
  ...(__TESSERA_E2E__ ? { mock: 'http://127.0.0.1:4173/mock-chat/' } : {}),
};

async function startHandoff(target: HandoffTarget, text: string): Promise<void> {
  const url = NEW_CHAT[target];
  if (!url) throw new Error('Unknown target.');
  const tab = await browser.tabs.create({ url, active: true });
  if (tab.id === undefined) throw new Error('Could not open a tab.');
  const tabId = tab.id;
  // The capsule stays in this function's memory until the content script in the new tab is ready.
  await waitForTabComplete(tabId, 30_000);
  let lastError = 'The chat page did not become ready.';
  for (let i = 0; i < 20; i++) {
    try {
      const res = (await browser.tabs.sendMessage(tabId, {
        type: 'tessera/handoff/deliver',
        text,
      } satisfies TesseraMessage)) as { ok: boolean; error?: string } | undefined;
      if (res?.ok) return;
      lastError = res?.error ?? lastError;
    } catch {
      // Content script not injected yet.
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(lastError);
}

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      browser.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (id: number, info: Browser.tabs.OnUpdatedInfo) => {
      if (id === tabId && info.status === 'complete') done();
    };
    browser.tabs.onUpdated.addListener(listener);
    const timer = setTimeout(done, timeoutMs);
  });
}
