import { RedactionSession, TYPE_LABELS, gatePrompt, pasteWarnings } from '@tessera/core';
import type { DomSiteAdapter } from '../adapters/dom-adapter';
import { formatDiagnostics, runDiagnostics } from '../adapters/diagnostics';
import { ImportHistory } from '../adapters/history';
import type { EngineLike } from '../optimize';
import type { Settings } from '../settings';
import { h } from './dom';
import { createOptimizeView } from './optimize-view';
import { PANEL_CSS } from './styles';

export interface PanelController {
  toggle(): void;
  open(view?: string): void;
  close(): void;
  destroy(): void;
  host: HTMLElement;
  /** Writes text into the chatbox with Undo support (used by the handoff delivery too). */
  importText(text: string, verb?: string): Promise<boolean>;
  setStatus(msg: string, tone?: 'ok' | 'bad' | ''): void;
}

export interface PanelDeps {
  getSettings(): Settings;
  engine: EngineLike & { intent(): Promise<unknown> };
  openSettings(): void;
  /** Extra views (tabs) such as Transfer, added after Optimize. */
  extraViews?: PanelView[];
}

export interface PanelView {
  id: string;
  label: string;
  el: HTMLElement;
  /** Called each time the view is shown. */
  show?(): void;
  /** Called when the panel closes: forget anything captured. */
  reset?(): void;
}

export interface PanelApi {
  adapter: DomSiteAdapter;
  importText(text: string, verb?: string): Promise<boolean>;
  setStatus(msg: string, tone?: 'ok' | 'bad' | ''): void;
}

/**
 * The in-page UI: a small button pinned to the composer and a panel with the
 * Optimize view (and Transfer, when provided). Lives in a closed-off shadow root
 * so the page's CSS cannot reach in, and nothing typed here is stored.
 */
export function mountPanel(
  adapter: DomSiteAdapter,
  extensionVersion: string,
  deps: PanelDeps | ((api: PanelApi) => PanelDeps),
  doc: Document = document,
): PanelController {
  const host = doc.createElement('tessera-root');
  host.setAttribute('data-tessera', '');
  const shadow = host.attachShadow({ mode: 'open' });
  const history = new ImportHistory();

  const style = h('style', {}, PANEL_CSS);
  const fab = h(
    'button',
    {
      class: 'fab',
      part: 'fab',
      type: 'button',
      'aria-label': 'Open Tessera (Alt+Shift+O)',
      title: 'Tessera (Alt+Shift+O)',
      hidden: true,
    },
    'T',
  );
  const status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const setStatus = (msg: string, tone: 'ok' | 'bad' | '' = '') => {
    status.textContent = msg;
    status.className = `status ${tone}`;
  };
  const undoBtn = h('button', { class: 'btn undo', type: 'button', disabled: true }, 'Undo');
  const importLock = { busy: false };

  const write = async (value: string, verb: string): Promise<boolean> => {
    if (!adapter.findComposer()) {
      setStatus('Chatbox not found. The site may have changed; see Diagnostics.', 'bad');
      return false;
    }
    if (importLock.busy) return false;
    importLock.busy = true;
    setStatus(`${verb}…`);
    const ok = await adapter.setComposerText(value);
    importLock.busy = false;
    refreshDiagnostics();
    const res = adapter.lastInject();
    if (ok) setStatus(`${verb} done. Review it in the chatbox, then send it yourself.`, 'ok');
    else
      setStatus(
        `The site did not accept the text (${res?.attempts.at(-1)?.reason ?? 'unknown reason'}). See Diagnostics.`,
        'bad',
      );
    return ok;
  };

  const importText = async (value: string, verb = 'Import'): Promise<boolean> => {
    const before = adapter.getComposerText();
    const ok = await write(value, verb);
    if (ok) {
      history.record(before, value);
      undoBtn.disabled = false;
    }
    return ok;
  };

  const api: PanelApi = { adapter, importText, setStatus };
  const d = typeof deps === 'function' ? deps(api) : deps;

  const optimize = createOptimizeView({
    getSettings: d.getSettings,
    engine: d.engine,
    importText,
    setStatus,
    openSettings: () => d.openSettings(),
  });
  const views: PanelView[] = [
    { id: 'optimize', label: 'Optimize', el: optimize.el },
    ...(d.extraViews ?? []),
  ];

  const tierChip = h('span', { class: 'tier', title: 'Where the optimizer runs' });
  const diag = h('pre', { class: 'diag' });
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Tessera' });
  const viewBox = h('div', { class: 'views' });
  let activeView = 'optimize';
  const showView = (id: string) => {
    activeView = id;
    for (const v of views) {
      v.el.hidden = v.id !== id;
      const tab = tabs.querySelector<HTMLButtonElement>(`[data-view="${v.id}"]`);
      tab?.setAttribute('aria-selected', String(v.id === id));
      if (tab) tab.tabIndex = v.id === id ? 0 : -1;
    }
    setStatus('');
    views.find((v) => v.id === id)?.show?.();
  };
  for (const v of views) {
    v.el.id = `t-view-${v.id}`;
    v.el.setAttribute('role', 'tabpanel');
    tabs.append(
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: `tab tab-${v.id}`,
          'data-view': v.id,
          'aria-controls': v.el.id,
          onclick: () => showView(v.id),
        },
        v.label,
      ),
    );
    viewBox.append(v.el);
  }
  tabs.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    const i = views.findIndex((v) => v.id === activeView);
    const next = views[(i + (ev.key === 'ArrowRight' ? 1 : views.length - 1)) % views.length]!;
    showView(next.id);
    tabs.querySelector<HTMLButtonElement>(`[data-view="${next.id}"]`)?.focus();
  });

  const panel = h(
    'section',
    {
      class: 'panel',
      role: 'dialog',
      'aria-modal': 'false',
      'aria-labelledby': 't-title',
      hidden: true,
    },
    h(
      'header',
      {},
      h(
        'div',
        {},
        h('h2', { id: 't-title' }, 'Tessera'),
        h('div', { class: 'site' }, `on ${adapter.config.label} `, tierChip),
      ),
      h(
        'div',
        { class: 'head-actions' },
        h(
          'button',
          {
            class: 'icon settings',
            type: 'button',
            'aria-label': 'Open Tessera settings',
            title: 'Settings',
            onclick: () => d.openSettings(),
          },
          '⚙',
        ),
        h('button', { class: 'icon close', type: 'button', 'aria-label': 'Close Tessera' }, '×'),
      ),
    ),
    views.length > 1 ? tabs : null,
    viewBox,
    h(
      'div',
      { class: 'row footer-row' },
      undoBtn,
      h(
        'button',
        { class: 'btn reload', type: 'button', title: 'Read the chatbox again' },
        'Read chatbox',
      ),
    ),
    status,
    h(
      'p',
      { class: 'note' },
      'Runs on this device. Nothing you type here is stored or sent anywhere.',
    ),
    h(
      'details',
      { class: 'diagnostics' },
      h('summary', {}, 'Diagnostics'),
      h(
        'p',
        { class: 'note' },
        'Selectors and counts only, no chat text. Copy this into a bug report if the site changed.',
      ),
      diag,
      h('div', { class: 'row' }, h('button', { class: 'btn copy', type: 'button' }, 'Copy report')),
    ),
  );
  showView('optimize');

  // A short-lived notice next to the button, for paste warnings.
  const toast = h('div', { class: 'toast', role: 'alert', hidden: true });
  shadow.append(style, fab, panel, toast);

  const $ = <T extends Element>(sel: string) => shadow.querySelector(sel) as T;

  const refreshDiagnostics = () => {
    diag.textContent = formatDiagnostics(runDiagnostics(adapter, doc, extensionVersion));
  };

  const refreshTier = () => {
    d.engine.status().then(
      (s) => {
        tierChip.textContent = s.tierLabel;
        tierChip.className = `tier t${s.tier}`;
      },
      () => {
        tierChip.textContent = 'Rules only';
        tierChip.className = 'tier t0';
      },
    );
  };

  const readChatbox = () => {
    const composer = adapter.findComposer();
    if (!composer) {
      setStatus('Chatbox not found. The site may have changed; see Diagnostics.', 'bad');
      return;
    }
    optimize.load(adapter.getComposerText());
    setStatus('');
  };

  const open = (view?: string) => {
    if (view && views.some((v) => v.id === view)) showView(view);
    panel.hidden = false;
    readChatbox();
    refreshDiagnostics();
    refreshTier();
    if (activeView === 'optimize') optimize.focus();
    else views.find((v) => v.id === activeView)?.show?.();
  };
  const close = () => {
    panel.hidden = true;
    optimize.reset();
    for (const v of views) v.reset?.();
    adapter.findComposer()?.focus();
  };
  const toggle = () => (panel.hidden ? open() : close());
  const setStatusPublic = setStatus;

  undoBtn.addEventListener('click', async () => {
    const previous = history.pop();
    if (previous === undefined) return;
    const current = adapter.getComposerText();
    if (!(await write(previous, 'Undo'))) history.record(previous, current); // keep it so the user can retry
    undoBtn.disabled = !history.canUndo();
  });
  $<HTMLButtonElement>('.reload').addEventListener('click', readChatbox);
  $<HTMLButtonElement>('.close').addEventListener('click', close);
  $<HTMLButtonElement>('.copy').addEventListener('click', () => {
    void navigator.clipboard?.writeText(diag.textContent ?? '').then(
      () => setStatus('Diagnostics copied.', 'ok'),
      () => setStatus('Could not copy; select the text instead.', 'bad'),
    );
  });
  fab.addEventListener('click', toggle);
  panel.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      close();
    }
  });
  // Keep page shortcuts (e.g. the site's own "/" focus key) from firing while typing in the panel.
  for (const type of ['keydown', 'keyup', 'keypress'] as const) {
    panel.addEventListener(type, (ev) => ev.stopPropagation());
    toast.addEventListener(type, (ev) => ev.stopPropagation());
  }

  // ---------- Signals from the chatbox itself ----------
  const inComposer = (target: EventTarget | null) => {
    const composer = adapter.findComposer();
    return Boolean(composer && target instanceof Node && composer.contains(target));
  };

  // A dot on the button when the prompt in the chatbox looks underspecified. Rules only, a few ms.
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  let lastIntent = 0;
  const onComposerInput = (ev: Event) => {
    // Editors that handle `beforeinput` themselves fire no `input` event, so keyup counts too.
    if (!inComposer(ev.target) && !inComposer(doc.activeElement)) return;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      const value = adapter.getComposerText();
      const gate = value.trim().split(/\s+/).length >= 3 ? gatePrompt(value) : undefined;
      const flag = gate !== undefined && gate.verdict !== 'ok_as_is';
      fab.classList.toggle('hint', flag);
      fab.title = flag
        ? `Tessera: ${gate.hints[0] ?? 'this prompt could be clearer'} (Alt+Shift+O)`
        : 'Tessera (Alt+Shift+O)';
      if (flag && Date.now() - lastIntent > 15_000) {
        lastIntent = Date.now();
        void d.engine.intent().catch(() => undefined);
      }
    }, 600);
  };

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const hideToast = () => {
    toast.hidden = true;
    toast.replaceChildren();
  };
  const onPaste = (ev: ClipboardEvent) => {
    if (!d.getSettings().pasteWarning || !inComposer(ev.target)) return;
    const pasted = ev.clipboardData?.getData('text/plain') ?? '';
    if (!pasted) return;
    const found = pasteWarnings(pasted);
    if (!found.length) return;
    const types = [...new Set(found.map((f) => f.type))];
    const what = types.map((t) => TYPE_LABELS[t].singular).join(', ');
    clearTimeout(toastTimer);
    toast.replaceChildren(
      h('p', {}, h('strong', {}, 'That paste looks like it contains a secret'), ` (${what}).`),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn primary scrub',
            type: 'button',
            onclick: async () => {
              hideToast();
              const current = adapter.getComposerText();
              const session = new RedactionSession({
                enabled: Object.fromEntries(types.map((t) => [t, true])),
                minConfidence: 0.8,
              });
              const res = session.redact(current);
              const only = res.items.filter((i) => types.includes(i.type));
              session.clear();
              if (!only.length) return;
              const ok = await importText(res.text, 'Scrub');
              toast.hidden = false;
              toast.replaceChildren(
                h(
                  'p',
                  {},
                  ok
                    ? `Replaced ${only.length} value(s) with placeholders. Undo is in the Tessera panel.`
                    : 'The chatbox did not accept the change. Remove the value by hand.',
                ),
              );
              toastTimer = setTimeout(hideToast, 6000);
            },
          },
          'Scrub it',
        ),
        h('button', { class: 'btn', type: 'button', onclick: hideToast }, 'Keep'),
      ),
    );
    toast.hidden = false;
    toastTimer = setTimeout(hideToast, 15_000);
  };
  doc.addEventListener('input', onComposerInput, true);
  doc.addEventListener('keyup', onComposerInput, true);
  doc.addEventListener('paste', onPaste, true);

  // Keep the button pinned to the composer's top-right corner. Sites re-render the
  // composer on navigation, so re-find it on a slow timer as well as on resize.
  let raf = 0;
  const place = () => {
    raf = 0;
    const composer = adapter.findComposer();
    if (!composer) {
      fab.hidden = true;
      return;
    }
    const r = composer.getBoundingClientRect();
    const width = doc.defaultView?.innerWidth ?? 0;
    fab.hidden = false;
    const top = Math.max(4, r.top - 36);
    const left = Math.max(4, Math.min(r.right - 30, width - 38));
    fab.style.top = `${top}px`;
    fab.style.left = `${left}px`;
    toast.style.top = `${Math.max(4, top - 8)}px`;
    toast.style.left = `${Math.max(4, Math.min(left - 290, width - 330))}px`;
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(place);
  };
  const win = doc.defaultView ?? window;
  win.addEventListener('resize', schedule);
  win.addEventListener('scroll', schedule, true);
  const timer = win.setInterval(schedule, 1000);
  schedule();

  doc.documentElement.appendChild(host);

  return {
    host,
    toggle,
    open,
    close,
    importText,
    setStatus: setStatusPublic,
    destroy() {
      win.clearInterval(timer);
      win.removeEventListener('resize', schedule);
      win.removeEventListener('scroll', schedule, true);
      doc.removeEventListener('input', onComposerInput, true);
      doc.removeEventListener('keyup', onComposerInput, true);
      doc.removeEventListener('paste', onPaste, true);
      clearTimeout(hintTimer);
      clearTimeout(toastTimer);
      optimize.reset();
      for (const v of views) v.reset?.();
      history.clear();
      host.remove();
    },
  };
}
