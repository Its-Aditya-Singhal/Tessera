import { textsMatch } from '@tessera/core';

export type InjectStrategy = 'textarea-setter' | 'exec-command' | 'before-input' | 'paste';

export interface InjectAttempt {
  strategy: InjectStrategy;
  ok: boolean;
  reason?: string;
}

export interface InjectResult {
  ok: boolean;
  strategy?: InjectStrategy;
  attempts: InjectAttempt[];
}

export interface InjectOptions {
  /** Re-finds the composer, since editors may replace their element on re-render. */
  findComposer: () => HTMLElement | null;
  readText: (el: HTMLElement) => string;
  /** Returns false when the site's send button exists but is still disabled. */
  sendAccepted: () => boolean;
  /** How long to wait before checking, and again before the re-render check. */
  settleMs?: number;
  /** Test hook: restrict which strategies run. */
  only?: InjectStrategy[];
}

const CONTENTEDITABLE_ORDER: InjectStrategy[] = ['exec-command', 'before-input', 'paste'];

export function isTextField(el: Element): el is HTMLTextAreaElement | HTMLInputElement {
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
}

/**
 * Writes `text` into a chat composer, replacing what is there.
 *
 * Rich-text editors (ProseMirror, Quill, Lexical) keep their own model and ignore
 * direct DOM edits, so each strategy is tried in turn and only counts as a success
 * when the text reads back, the send button is enabled, and it is still there
 * after the editor has had a chance to re-render.
 */
export async function injectText(text: string, opts: InjectOptions): Promise<InjectResult> {
  const settleMs = opts.settleMs ?? 120;
  const attempts: InjectAttempt[] = [];
  const first = opts.findComposer();
  if (!first)
    return {
      ok: false,
      attempts: [{ strategy: 'exec-command', ok: false, reason: 'composer not found' }],
    };

  const order: InjectStrategy[] = isTextField(first)
    ? ['textarea-setter', 'paste']
    : CONTENTEDITABLE_ORDER;
  for (const strategy of order) {
    if (opts.only && !opts.only.includes(strategy)) continue;
    const el = opts.findComposer();
    if (!el) {
      attempts.push({ strategy, ok: false, reason: 'composer disappeared' });
      break;
    }
    try {
      runStrategy(strategy, el, text);
    } catch (err) {
      attempts.push({ strategy, ok: false, reason: `threw: ${String(err)}` });
      continue;
    }
    const reason = await verify(text, opts, settleMs);
    attempts.push(reason ? { strategy, ok: false, reason } : { strategy, ok: true });
    if (!reason) return { ok: true, strategy, attempts };
  }
  return { ok: false, attempts };
}

async function verify(
  text: string,
  opts: InjectOptions,
  settleMs: number,
): Promise<string | undefined> {
  await sleep(settleMs);
  const check = (phase: string): string | undefined => {
    const el = opts.findComposer();
    if (!el) return `${phase}: composer gone`;
    const got = opts.readText(el);
    if (!textsMatch(got, text)) return `${phase}: read back ${JSON.stringify(got.slice(0, 60))}`;
    if (text.trim() && !opts.sendAccepted()) return `${phase}: send button still disabled`;
    return undefined;
  };
  const immediate = check('after write');
  if (immediate) return immediate;
  // Give the editor a chance to re-render from its own state. If it never saw our
  // edit, a re-render wipes it and this second check catches that.
  await sleep(settleMs * 2);
  return check('after re-render');
}

function runStrategy(strategy: InjectStrategy, el: HTMLElement, text: string): void {
  switch (strategy) {
    case 'textarea-setter':
      return setNativeValue(el as HTMLTextAreaElement | HTMLInputElement, text);
    case 'exec-command':
      return viaExecCommand(el, text);
    case 'before-input':
      return viaBeforeInput(el, text);
    case 'paste':
      return viaPaste(el, text);
  }
}

/** React and friends track `.value` through the prototype setter, so call that one. */
function setNativeValue(el: HTMLTextAreaElement | HTMLInputElement, text: string): void {
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  el.focus();
  if (setter) setter.call(el, text);
  else el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function selectAllIn(el: HTMLElement): void {
  el.focus();
  const doc = el.ownerDocument;
  const sel = doc.getSelection();
  if (!sel) return;
  const range = doc.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
}

function viaExecCommand(el: HTMLElement, text: string): void {
  selectAllIn(el);
  const doc = el.ownerDocument;
  if (typeof doc.execCommand !== 'function') throw new Error('execCommand unavailable');
  // Deprecated but still the one path that produces trusted input events editors honour.
  const ok = doc.execCommand('insertText', false, text);
  if (!ok) throw new Error('execCommand returned false');
}

function viaBeforeInput(el: HTMLElement, text: string): void {
  selectAllIn(el);
  const view = el.ownerDocument.defaultView;
  const InputEv = view?.InputEvent ?? InputEvent;
  const before = new InputEv('beforeinput', {
    inputType: 'insertText',
    data: text,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  const notHandled = el.dispatchEvent(before);
  if (notHandled) {
    // Nobody took over, so do what the browser would have done.
    replaceEditableContent(el, text);
  }
  el.dispatchEvent(
    new InputEv('input', { inputType: 'insertText', data: text, bubbles: true, composed: true }),
  );
}

function viaPaste(el: HTMLElement, text: string): void {
  if (isTextField(el)) {
    el.focus();
    el.select();
  } else {
    selectAllIn(el);
  }
  const view = el.ownerDocument.defaultView;
  const DT = view?.DataTransfer ?? (typeof DataTransfer !== 'undefined' ? DataTransfer : undefined);
  if (!DT) throw new Error('DataTransfer unavailable');
  const data = new DT();
  data.setData('text/plain', text);
  const ClipEv = view?.ClipboardEvent ?? ClipboardEvent;
  const ev = new ClipEv('paste', {
    clipboardData: data,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  // Some engines drop clipboardData from the constructor; make sure listeners can read it.
  if (!ev.clipboardData) Object.defineProperty(ev, 'clipboardData', { value: data });
  el.dispatchEvent(ev);
}

/** Replaces a contenteditable's content with one paragraph per line. */
export function replaceEditableContent(el: HTMLElement, text: string): void {
  const doc = el.ownerDocument;
  el.replaceChildren(
    ...text.split('\n').map((line) => {
      const p = doc.createElement('p');
      if (line) p.textContent = line;
      else p.appendChild(doc.createElement('br'));
      return p;
    }),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
