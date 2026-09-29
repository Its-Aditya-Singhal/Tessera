import type { DomSiteAdapter } from '../adapters/dom-adapter';
import { formatDiagnostics, runDiagnostics } from '../adapters/diagnostics';
import { ImportHistory } from '../adapters/history';
import { PANEL_CSS } from './styles';

export interface PanelController {
  toggle(): void;
  open(): void;
  close(): void;
  destroy(): void;
  host: HTMLElement;
}

/**
 * The in-page UI: a small button next to the composer and a panel.
 *
 * For M1 the panel is a harness for the adapter: it shows the composer text,
 * lets you edit it and Import it back, Undo, and view diagnostics. The optimizer
 * (M4) and transfer (M7) flows will fill the same panel.
 */
export function mountPanel(
  adapter: DomSiteAdapter,
  extensionVersion: string,
  doc: Document = document,
): PanelController {
  const host = doc.createElement('tessera-root');
  host.setAttribute('data-tessera', '');
  const shadow = host.attachShadow({ mode: 'open' });
  const history = new ImportHistory();

  shadow.innerHTML = `
    <style>${PANEL_CSS}</style>
    <button class="fab" part="fab" type="button" aria-label="Open Tessera (Alt+Shift+O)" title="Tessera (Alt+Shift+O)" hidden>T</button>
    <section class="panel" role="dialog" aria-modal="false" aria-labelledby="t-title" hidden>
      <header>
        <div>
          <h2 id="t-title">Tessera</h2>
          <div class="site"></div>
        </div>
        <button class="icon close" type="button" aria-label="Close Tessera">×</button>
      </header>
      <label for="t-text">Text for the chatbox</label>
      <textarea id="t-text" spellcheck="false"></textarea>
      <p class="note">Runs on this device. Nothing you type here is stored or sent anywhere.</p>
      <div class="row">
        <button class="btn primary import" type="button">Import</button>
        <button class="btn undo" type="button" disabled>Undo</button>
        <button class="btn reload" type="button">Read chatbox</button>
      </div>
      <div class="status" role="status" aria-live="polite"></div>
      <details class="diagnostics">
        <summary>Diagnostics</summary>
        <p class="note">Selectors and counts only, no chat text. Copy this into a bug report if the site changed.</p>
        <pre class="diag"></pre>
        <div class="row"><button class="btn copy" type="button">Copy report</button></div>
      </details>
    </section>`;

  const $ = <T extends Element>(sel: string) => shadow.querySelector(sel) as T;
  const fab = $<HTMLButtonElement>('.fab');
  const panel = $<HTMLElement>('.panel');
  const text = $<HTMLTextAreaElement>('#t-text');
  const status = $<HTMLElement>('.status');
  const undoBtn = $<HTMLButtonElement>('.undo');
  const importBtn = $<HTMLButtonElement>('.import');
  const diag = $<HTMLElement>('.diag');
  $<HTMLElement>('.site').textContent = `on ${adapter.config.label}`;

  const setStatus = (msg: string, tone: 'ok' | 'bad' | '' = '') => {
    status.textContent = msg;
    status.className = `status ${tone}`;
  };

  const refreshDiagnostics = () => {
    diag.textContent = formatDiagnostics(runDiagnostics(adapter, doc, extensionVersion));
  };

  const readChatbox = () => {
    const composer = adapter.findComposer();
    if (!composer) {
      setStatus('Chatbox not found. The site may have changed; see Diagnostics.', 'bad');
      return;
    }
    text.value = adapter.getComposerText();
    setStatus('');
  };

  const open = () => {
    panel.hidden = false;
    readChatbox();
    refreshDiagnostics();
    text.focus();
  };
  const close = () => {
    panel.hidden = true;
    adapter.findComposer()?.focus();
  };
  const toggle = () => (panel.hidden ? open() : close());

  const write = async (value: string, verb: string): Promise<boolean> => {
    if (!adapter.findComposer()) {
      setStatus('Chatbox not found. The site may have changed; see Diagnostics.', 'bad');
      return false;
    }
    importBtn.disabled = true;
    setStatus(`${verb}…`);
    const ok = await adapter.setComposerText(value);
    importBtn.disabled = false;
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

  importBtn.addEventListener('click', async () => {
    const before = adapter.getComposerText();
    if (await write(text.value, 'Import')) {
      history.record(before, text.value);
      undoBtn.disabled = false;
    }
  });
  undoBtn.addEventListener('click', async () => {
    const previous = history.pop();
    if (previous === undefined) return;
    const current = adapter.getComposerText();
    if (await write(previous, 'Undo')) text.value = previous;
    else history.record(previous, current); // keep it so the user can retry
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
  }

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
    fab.hidden = false;
    fab.style.top = `${Math.max(4, r.top - 36)}px`;
    fab.style.left = `${Math.max(4, Math.min(r.right - 30, (doc.defaultView?.innerWidth ?? 0) - 38))}px`;
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
    destroy() {
      win.clearInterval(timer);
      win.removeEventListener('resize', schedule);
      win.removeEventListener('scroll', schedule, true);
      history.clear();
      host.remove();
    },
  };
}
