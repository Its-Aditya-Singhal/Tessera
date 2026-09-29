import {
  DETECTION_TYPES,
  TIER_LABELS,
  TYPE_LABELS,
  type Availability,
  type Tier,
} from '@tessera/core';
import { browser } from 'wxt/browser';
import { engineClient } from '../engine/client';
import type { EngineStatus } from '../engine/host';
import { isTesseraMessage } from '../messaging';
import {
  DEFAULT_SETTINGS,
  WEBLLM_MODELS,
  clearAllData,
  loadSettings,
  saveSettings,
  type Settings,
} from '../settings';

type Attrs = Record<string, string | boolean | number | EventListener | undefined>;

/** Tiny DOM helper: h('button', { class: 'primary', onclick }, 'Save'). Text children are never parsed as HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** replaceChildren that skips null/false entries from conditional sections. */
export function replaceKids(
  el: Element,
  ...kids: (Node | string | null | undefined | false)[]
): void {
  el.replaceChildren(
    ...kids.filter((k): k is Node | string => k !== null && k !== undefined && k !== false),
  );
}

const AVAIL_TEXT: Record<Availability, [string, 'ok' | 'warn' | 'bad']> = {
  ready: ['ready', 'ok'],
  'needs-download': ['needs download', 'warn'],
  unavailable: ['not available', 'bad'],
};

interface BuiltInModel {
  availability(o?: unknown): Promise<string>;
  create(o?: unknown): Promise<{ destroy(): void }>;
}

export async function renderSettingsPage(
  root: HTMLElement,
  opts: { welcome: boolean },
): Promise<void> {
  let settings = await loadSettings();
  const save = async (patch: Partial<Settings>) => {
    settings = await saveSettings(patch);
    void refreshStatus();
  };

  const version = browser.runtime.getManifest().version;
  const statusBox = h('div');
  const statusLine = h('p', { class: 'status', role: 'status', 'aria-live': 'polite' });

  // ---------- Engine status ----------
  const renderStatus = (s: EngineStatus) => {
    const row = (t: 1 | 2 | 3) => {
      const a = s.availability[t] ?? 'unavailable';
      const [text, tone] = AVAIL_TEXT[a];
      return h(
        'tr',
        {},
        h('td', {}, TIER_LABELS[t]),
        h('td', {}, h('span', { class: `pill ${tone}` }, text)),
      );
    };
    const m = s.metrics;
    replaceKids(
      statusBox,
      h(
        'p',
        {},
        'In use: ',
        h('strong', {}, s.tierLabel),
        s.tier === 0 ? ' (the optimizer gives rule-based hints; no model runs)' : '',
        '. Model state: ',
        h('strong', {}, s.state),
        s.progress ? ` (${Math.round(s.progress.progress * 100)}% ${s.progress.text})` : '',
      ),
      s.modeNote ? h('p', { class: 'muted' }, s.modeNote) : null,
      s.lastError ? h('p', { class: 'status bad' }, `Last error: ${s.lastError}`) : null,
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Tier'), h('th', {}, 'Status'))),
        h('tbody', {}, row(1), row(3), row(2)),
      ),
      h(
        'p',
        { class: 'muted' },
        `This session: ${m.loadCount} load(s), ${m.residentMinutes} min resident`,
        m.lastLoadMs !== undefined ? `, last load ${(m.lastLoadMs / 1000).toFixed(1)} s` : '',
        m.medianTtftMs !== undefined ? `, first token ${m.medianTtftMs} ms` : '',
        m.medianTokensPerSecond !== undefined ? `, ${m.medianTokensPerSecond} tokens/s` : '',
        '. Kept in memory only.',
      ),
      h(
        'p',
        { class: 'muted' },
        s.tier === 0
          ? 'Cost: none. Rules run in a few milliseconds.'
          : 'Cost: uses your GPU or CPU for a few seconds per optimization, and memory while the model is loaded.',
      ),
    );
  };
  const refreshStatus = async () => {
    try {
      renderStatus(await engineClient.status());
    } catch (err) {
      statusBox.replaceChildren(
        h('p', { class: 'status bad' }, `Could not read the engine status: ${String(err)}`),
      );
    }
  };
  browser.runtime.onMessage.addListener((msg: unknown) => {
    if (isTesseraMessage(msg) && msg.type === 'tessera/engine-status') renderStatus(msg.status);
  });

  const radio = <T extends string | number>(
    name: string,
    value: T,
    current: T,
    label: string,
    onPick: (v: T) => void,
    hint?: string,
  ) =>
    h(
      'label',
      { style: 'display:flex;align-items:flex-start;margin:6px 0' },
      h('input', {
        type: 'radio',
        name,
        value: String(value),
        checked: current === value,
        onchange: () => onPick(value),
      }),
      h('span', {}, h('strong', {}, label), hint ? h('span', { class: 'muted' }, ` ${hint}`) : ''),
    );

  // ---------- Built-in model (Tier 1) ----------
  const builtIn = (globalThis as { LanguageModel?: BuiltInModel }).LanguageModel;
  const builtInStatus = h('span', { class: 'status', role: 'status' });
  const builtInBtn = h(
    'button',
    {
      type: 'button',
      onclick: async () => {
        if (!builtIn) return;
        builtInBtn.disabled = true;
        builtInStatus.textContent = 'Starting Chrome’s download…';
        try {
          // Must run from a click: Chrome only starts the download with user activation.
          const session = await builtIn.create({
            expectedInputs: [{ type: 'text', languages: ['en'] }],
            expectedOutputs: [{ type: 'text', languages: ['en'] }],
            monitor: (m: EventTarget) =>
              m.addEventListener('downloadprogress', (e) => {
                builtInStatus.textContent = `Downloading: ${Math.round((e as unknown as { loaded: number }).loaded * 100)}%`;
              }),
          });
          session.destroy();
          builtInStatus.textContent = 'The built-in model is ready.';
          builtInStatus.className = 'status ok';
        } catch (err) {
          builtInStatus.textContent = `Chrome could not enable it: ${String(err)}`;
          builtInStatus.className = 'status bad';
        }
        builtInBtn.disabled = false;
        void refreshStatus();
      },
    },
    'Enable Chrome’s built-in model',
  );
  if (!builtIn) {
    builtInBtn.disabled = true;
    builtInStatus.textContent =
      'Not offered by this browser. It needs Chrome 138 or later on supported hardware.';
  } else {
    void builtIn.availability().then((a) => {
      if (a === 'available') {
        builtInBtn.disabled = true;
        builtInStatus.textContent = 'Ready.';
        builtInStatus.className = 'status ok';
      } else if (a === 'unavailable') {
        builtInBtn.disabled = true;
        builtInStatus.textContent =
          'Chrome says this device cannot run it (it needs about 22 GB free disk and a capable GPU or 16 GB RAM).';
      }
    });
  }

  // ---------- WebLLM (Tier 2) ----------
  const webllmStatus = h('span', { class: 'status', role: 'status' });
  const modelSelect = h(
    'select',
    { id: 'webllm-model', onchange: () => void save({ webllmModel: modelSelect.value }) },
    ...WEBLLM_MODELS.map((m) =>
      h('option', { value: m.id, selected: m.id === settings.webllmModel }, m.label),
    ),
  );
  const consent = h('input', {
    type: 'checkbox',
    id: 'webllm-consent',
    checked: settings.webllmConsent,
    onchange: () => void save({ webllmConsent: consent.checked }),
  });
  const downloadBtn = h(
    'button',
    {
      type: 'button',
      onclick: async () => {
        if (!settings.webllmConsent) {
          webllmStatus.textContent = 'Tick the consent box first.';
          webllmStatus.className = 'status bad';
          return;
        }
        downloadBtn.disabled = true;
        webllmStatus.textContent = 'Downloading… progress appears above.';
        webllmStatus.className = 'status';
        try {
          await save({ tier: settings.tier === 'auto' ? 'auto' : 2 });
          await engineClient.download();
          webllmStatus.textContent = 'Downloaded and cached on this device.';
          webllmStatus.className = 'status ok';
        } catch (err) {
          webllmStatus.textContent = String(err instanceof Error ? err.message : err);
          webllmStatus.className = 'status bad';
        }
        downloadBtn.disabled = false;
        void refreshStatus();
      },
    },
    'Download now',
  );

  // ---------- Local server (Tier 3) ----------
  const ollamaStatus = h('span', { class: 'status', role: 'status' });
  const ollamaUrl = h('input', {
    type: 'url',
    value: settings.ollama.url,
    'aria-label': 'Server URL',
    size: 28,
  });
  const ollamaModel = h('input', {
    type: 'text',
    value: settings.ollama.model,
    'aria-label': 'Model name',
    size: 22,
  });
  const ollamaEnabled = h('input', {
    type: 'checkbox',
    checked: settings.ollama.enabled,
    onchange: async () => {
      if (ollamaEnabled.checked) {
        // Optional permission: asked for only now, from a click.
        const granted = await browser.permissions.request({
          origins: ['http://localhost/*', 'http://127.0.0.1/*'],
        });
        if (!granted) {
          ollamaEnabled.checked = false;
          ollamaStatus.textContent = 'Permission not granted, so the local server stays off.';
          return;
        }
      }
      await save({ ollama: { ...settings.ollama, enabled: ollamaEnabled.checked } });
    },
  });
  const saveOllama = () =>
    void save({
      ollama: { ...settings.ollama, url: ollamaUrl.value.trim(), model: ollamaModel.value.trim() },
    });
  ollamaUrl.addEventListener('change', saveOllama);
  ollamaModel.addEventListener('change', saveOllama);

  // ---------- Build ----------
  const tierOptions: [Settings['tier'], string][] = [
    ['auto', 'Automatic (best available)'],
    [0, TIER_LABELS[0]],
    [1, TIER_LABELS[1]],
    [2, TIER_LABELS[2]],
    [3, TIER_LABELS[3]],
  ];
  const grace = h('input', {
    type: 'range',
    min: 1,
    max: 10,
    step: 1,
    value: String(settings.graceMinutes),
    'aria-label': 'Grace period in minutes',
  });
  const graceOut = h('output', {}, `${settings.graceMinutes} min`);
  grace.addEventListener('input', () => (graceOut.textContent = `${grace.value} min`));
  grace.addEventListener('change', () => void save({ graceMinutes: Number(grace.value) }));

  const redactionBoxes = DETECTION_TYPES.map((t) =>
    h(
      'label',
      {},
      h('input', {
        type: 'checkbox',
        checked: settings.redaction[t],
        onchange: (e: Event) =>
          void save({
            redaction: { ...settings.redaction, [t]: (e.target as HTMLInputElement).checked },
          }),
      }),
      TYPE_LABELS[t].plural[0]!.toUpperCase() + TYPE_LABELS[t].plural.slice(1),
    ),
  );

  const budgetInput = (site: keyof Settings['tokenBudgets'], label: string) =>
    h(
      'label',
      {},
      label,
      h('input', {
        type: 'number',
        min: 1000,
        step: 1000,
        value: String(settings.tokenBudgets[site]),
        onchange: (e: Event) =>
          void save({
            tokenBudgets: {
              ...settings.tokenBudgets,
              [site]: Number((e.target as HTMLInputElement).value),
            },
          }),
      }),
    );

  replaceKids(
    root,
    h(
      'header',
      { class: 'top' },
      h('img', { src: browser.runtime.getURL('/icon/128.png'), alt: '' }),
      h(
        'div',
        {},
        h('h1', {}, opts.welcome ? 'Welcome to Tessera' : 'Tessera settings'),
        h('span', { class: 'muted' }, `Version ${version}`),
      ),
    ),
    opts.welcome
      ? h(
          'section',
          { class: 'card' },
          h('h2', {}, 'What Tessera does, all on this device'),
          h(
            'ol',
            { class: 'steps' },
            h(
              'li',
              {},
              h('strong', {}, 'Sharper prompts. '),
              'Press ',
              h('code', {}, 'Alt+Shift+O'),
              ' or the T button above a chatbox on ChatGPT, Claude or Gemini to see an improved prompt next to yours, then import it or keep yours.',
            ),
            h(
              'li',
              {},
              h('strong', {}, 'Secrets stay out. '),
              'Keys, passwords, emails, phone numbers, Aadhaar, PAN, UPI IDs and more are swapped for placeholders before anything is optimized or transferred.',
            ),
            h(
              'li',
              {},
              h('strong', {}, 'Carry context. '),
              'Move a conversation to another chatbot as a compact summary plus the recent turns and all code.',
            ),
          ),
          h(
            'p',
            { class: 'muted' },
            'Nothing you type leaves your computer. Tessera has no servers, accounts or analytics. Rules work straight away; a model is optional and only downloads if you ask below.',
          ),
        )
      : null,
    h(
      'section',
      { class: 'card', 'aria-labelledby': 'engine-h' },
      h('h2', { id: 'engine-h' }, 'Model'),
      statusBox,
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            type: 'button',
            onclick: async () => {
              await engineClient.unload();
              void refreshStatus();
            },
          },
          'Unload now',
        ),
        h('button', { type: 'button', onclick: () => void refreshStatus() }, 'Refresh'),
      ),
      h('label', { class: 'block', for: 'tier' }, 'Which model to use'),
      h(
        'select',
        {
          id: 'tier',
          onchange: (e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            void save({ tier: v === 'auto' ? 'auto' : (Number(v) as Tier) });
          },
        },
        ...tierOptions.map(([v, l]) =>
          h('option', { value: String(v), selected: settings.tier === v }, l),
        ),
      ),
      h(
        'fieldset',
        {},
        h('legend', { class: 'block' }, 'When to load it'),
        radio(
          'mode',
          'on-demand',
          settings.lifecycleMode,
          'On demand',
          (v) => void save({ lifecycleMode: v }),
          '(recommended) Loads while you type a prompt worth improving, unloads when you leave.',
        ),
        radio(
          'mode',
          'keep-warm',
          settings.lifecycleMode,
          'Keep warm on AI sites',
          (v) => void save({ lifecycleMode: v }),
          'Faster, uses more memory. Switched to on demand on low-memory devices.',
        ),
        radio(
          'mode',
          'off',
          settings.lifecycleMode,
          'Off',
          (v) => void save({ lifecycleMode: v }),
          'Rules only. No model ever runs.',
        ),
      ),
      h(
        'div',
        { class: 'row' },
        h('label', {}, 'Unload after leaving AI sites for', grace, graceOut),
      ),
    ),
    h(
      'section',
      { class: 'card', 'aria-labelledby': 't1-h' },
      h('h2', { id: 't1-h' }, 'Chrome built-in model'),
      h(
        'p',
        { class: 'muted' },
        'Managed and downloaded by Chrome itself (a few GB, shared with other sites and extensions).',
      ),
      h('div', { class: 'row' }, builtInBtn, builtInStatus),
    ),
    h(
      'section',
      { class: 'card', 'aria-labelledby': 't2-h' },
      h('h2', { id: 't2-h' }, 'WebLLM on-device model'),
      h(
        'p',
        { class: 'muted' },
        'A small open model that runs on your GPU with WebGPU. Weights come from huggingface.co and are cached by the browser.',
      ),
      h('div', { class: 'row' }, h('label', { for: 'webllm-model' }, 'Model'), modelSelect),
      h(
        'div',
        { class: 'row' },
        h('label', {}, consent, 'I agree to download the selected model (size shown above).'),
      ),
      h('div', { class: 'row' }, downloadBtn, webllmStatus),
    ),
    h(
      'section',
      { class: 'card', 'aria-labelledby': 't3-h' },
      h('h2', { id: 't3-h' }, 'Local server (advanced)'),
      h(
        'p',
        { class: 'muted' },
        'Use a model you already run with Ollama. Start it with ',
        h('code', {}, 'OLLAMA_ORIGINS=chrome-extension://* ollama serve'),
        ' so it accepts requests from the extension.',
      ),
      h(
        'div',
        { class: 'row' },
        h('label', {}, ollamaEnabled, 'Use my local server'),
        ollamaStatus,
      ),
      h('div', { class: 'row' }, ollamaUrl, ollamaModel),
    ),
    opts.welcome
      ? null
      : h(
          'section',
          { class: 'card', 'aria-labelledby': 'priv-h' },
          h('h2', { id: 'priv-h' }, 'Privacy'),
          h(
            'p',
            { class: 'muted' },
            'Detected values are replaced with placeholders like [EMAIL_1]. You can switch individual items off in the review list each time.',
          ),
          h('div', { class: 'grid' }, ...redactionBoxes),
          h(
            'div',
            { class: 'row' },
            h(
              'label',
              {},
              h('input', {
                type: 'checkbox',
                checked: settings.pasteWarning,
                onchange: (e: Event) =>
                  void save({ pasteWarning: (e.target as HTMLInputElement).checked }),
              }),
              'Warn me when I paste something that looks like a secret into a chatbox',
            ),
          ),
        ),
    opts.welcome
      ? null
      : h(
          'section',
          { class: 'card', 'aria-labelledby': 'opt-h' },
          h('h2', { id: 'opt-h' }, 'Prompt optimizer'),
          h(
            'label',
            {},
            h('input', {
              type: 'checkbox',
              checked: settings.englishOutput,
              onchange: (e: Event) =>
                void save({ englishOutput: (e.target as HTMLInputElement).checked }),
            }),
            'Always write the optimized prompt in English',
          ),
        ),
    opts.welcome
      ? null
      : h(
          'section',
          { class: 'card', 'aria-labelledby': 'ho-h' },
          h('h2', { id: 'ho-h' }, 'Chat transfer'),
          h(
            'fieldset',
            {},
            h('legend', {}, 'Default format'),
            radio(
              'capsule',
              'hybrid',
              settings.capsuleMode,
              'Hybrid',
              (v) => void save({ capsuleMode: v }),
              '(recommended) Summary, the last few turns and all code, verbatim.',
            ),
            radio(
              'capsule',
              'capsule',
              settings.capsuleMode,
              'Summary only',
              (v) => void save({ capsuleMode: v }),
              'Goal, decisions, key facts, open questions.',
            ),
            radio(
              'capsule',
              'full',
              settings.capsuleMode,
              'Full transcript',
              (v) => void save({ capsuleMode: v }),
              'Every message.',
            ),
          ),
          h(
            'div',
            { class: 'row' },
            h(
              'label',
              {},
              'Recent turns kept verbatim',
              h('input', {
                type: 'number',
                min: 0,
                max: 50,
                value: String(settings.capsuleTurns),
                onchange: (e: Event) =>
                  void save({ capsuleTurns: Number((e.target as HTMLInputElement).value) }),
              }),
            ),
          ),
          h(
            'p',
            { class: 'muted' },
            'Token budgets (approximate; older, low-value turns are cut first and you are told what was cut):',
          ),
          h(
            'div',
            { class: 'row' },
            budgetInput('chatgpt', 'ChatGPT'),
            budgetInput('claude', 'Claude'),
            budgetInput('gemini', 'Gemini'),
          ),
        ),
    opts.welcome
      ? h(
          'section',
          { class: 'card' },
          h(
            'div',
            { class: 'row' },
            h(
              'button',
              {
                type: 'button',
                class: 'primary',
                onclick: async () => {
                  await save({ onboarded: true });
                  window.close();
                },
              },
              'Done',
            ),
            h(
              'span',
              { class: 'muted' },
              'Change any of this later in Settings (right-click the toolbar icon, then Options).',
            ),
          ),
        )
      : h(
          'section',
          { class: 'card', 'aria-labelledby': 'data-h' },
          h('h2', { id: 'data-h' }, 'Data'),
          h(
            'p',
            { class: 'muted' },
            'Tessera stores only these settings. Prompts, chats and placeholder mappings are kept in memory and never saved.',
          ),
          h(
            'div',
            { class: 'row' },
            h(
              'button',
              {
                type: 'button',
                class: 'danger',
                onclick: async () => {
                  if (!confirm('Reset all settings and clear everything Tessera has stored?'))
                    return;
                  await clearAllData();
                  await engineClient.unload().catch(() => undefined);
                  statusLine.textContent = 'All data cleared. Settings are back to defaults.';
                  statusLine.className = 'status ok';
                  settings = { ...DEFAULT_SETTINGS };
                  setTimeout(() => location.reload(), 800);
                },
              },
              'Clear all data',
            ),
            h('a', { href: browser.runtime.getURL('/diagnostics.html') }, 'Diagnostics'),
            h(
              'a',
              {
                href: 'https://github.com/Its-Aditya-Singhal/Tessera/issues/new/choose',
                target: '_blank',
                rel: 'noopener',
              },
              'Send feedback',
            ),
          ),
          statusLine,
        ),
  );
  void refreshStatus();
}
