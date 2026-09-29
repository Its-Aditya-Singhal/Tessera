import { beforeEach, describe, expect, it } from 'vitest';
import { readComposerText } from '../src/adapters/extract';
import { injectText } from '../src/adapters/inject';

const opts = (sel: string, extra: Partial<Parameters<typeof injectText>[1]> = {}) => ({
  findComposer: () => document.querySelector<HTMLElement>(sel),
  readText: readComposerText,
  sendAccepted: () => !(document.querySelector('button') as HTMLButtonElement | null)?.disabled,
  settleMs: 5,
  ...extra,
});

describe('injectText', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('sets a controlled textarea through the prototype setter and fires input', async () => {
    document.body.innerHTML = '<textarea></textarea><button disabled></button>';
    const ta = document.querySelector('textarea')!;
    const btn = document.querySelector('button')!;
    let state = '';
    // A React-style owner: tracks value only via input events and re-renders from state.
    ta.addEventListener('input', () => {
      state = ta.value;
      btn.disabled = state === '';
    });
    const res = await injectText('hello\nworld', opts('textarea'));
    expect(res).toMatchObject({ ok: true, strategy: 'textarea-setter' });
    expect(state).toBe('hello\nworld');
  });

  it('falls back to beforeinput when execCommand is unavailable', async () => {
    document.body.innerHTML = '<div contenteditable="true"></div>';
    const res = await injectText('line 1\nline 2', opts('[contenteditable]'));
    expect(res.ok).toBe(true);
    expect(res.attempts[0]).toMatchObject({ strategy: 'exec-command', ok: false });
    expect(res.strategy).toBe('before-input');
    expect(readComposerText(document.querySelector('[contenteditable]')!)).toBe('line 1\nline 2');
  });

  it('rejects when the editor reverts the text on re-render', async () => {
    document.body.innerHTML = '<div contenteditable="true"><p>kept</p></div>';
    const el = document.querySelector<HTMLElement>('[contenteditable]')!;
    // An editor that ignores everything and restores its own model shortly after.
    el.addEventListener('beforeinput', (e) => e.preventDefault());
    el.addEventListener('paste', (e) => e.preventDefault());
    const timer = setInterval(() => (el.innerHTML = '<p>kept</p>'), 3);
    const res = await injectText('new text', opts('[contenteditable]'));
    clearInterval(timer);
    expect(res.ok).toBe(false);
    expect(el.textContent).toBe('kept');
  });

  it('rejects when the send button stays disabled', async () => {
    document.body.innerHTML = '<div contenteditable="true"></div><button disabled></button>';
    const res = await injectText('text', opts('[contenteditable]'));
    expect(res.ok).toBe(false);
    expect(res.attempts.some((a) => a.reason?.includes('send button still disabled'))).toBe(true);
  });

  it('reports a missing composer', async () => {
    const res = await injectText('x', opts('#nope'));
    expect(res).toMatchObject({ ok: false });
    expect(res.attempts[0]!.reason).toBe('composer not found');
  });
});

describe('readComposerText', () => {
  it('ignores ProseMirror trailing breaks and keeps blank paragraphs', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>a<br class="ProseMirror-trailingBreak"></p><p><br></p><p>b</p>';
    expect(readComposerText(el)).toBe('a\n\nb');
  });

  it('treats a mid-line <br> as a newline', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>a<br>b</p>';
    expect(readComposerText(el)).toBe('a\nb');
  });
});
