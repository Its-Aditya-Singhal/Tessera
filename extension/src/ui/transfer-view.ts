import {
  RedactionSession,
  buildCapsule,
  capsuleMarkdown,
  redactionSummary,
  reviewRows,
  toggleItem,
  type CapsuleMode,
  type CapsuleResult,
  type Message,
  type RedactionResult,
} from '@tessera/core';
import type { DomSiteAdapter } from '../adapters/dom-adapter';
import type { HandoffTarget } from '../messaging';
import type { Settings, TargetSite } from '../settings';
import { h, replaceKids } from './dom';
import type { PanelView } from './panel';

export const TARGET_LABELS: Record<TargetSite, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
};

const MODE_LABELS: Record<CapsuleMode, string> = {
  hybrid: 'Summary + recent messages',
  capsule: 'Summary only',
  full: 'Full transcript',
};

export interface TransferViewDeps {
  adapter: DomSiteAdapter;
  getSettings(): Settings;
  setStatus(msg: string, tone?: 'ok' | 'bad' | ''): void;
  /** Opens a new chat on the target and places the text in its chatbox (never sends). */
  startHandoff(target: HandoffTarget, text: string): Promise<void>;
  /** Extra targets for tests (the mock site). */
  extraTargets?: { id: HandoffTarget; label: string; budget: number }[];
}

interface State {
  messages: Message[];
  complete: boolean;
  note: string;
  capsule?: CapsuleResult;
  redaction?: RedactionResult;
  session?: RedactionSession;
}

/**
 * The Transfer tab: capture this chat, build a handoff capsule, review what is
 * redacted, and open it in another assistant. The text only ever lives in this
 * tab's memory and, briefly, the service worker's while the new tab loads.
 */
export function createTransferView(deps: TransferViewDeps): PanelView & { reset(): void } {
  const targets = [
    ...(Object.keys(TARGET_LABELS) as TargetSite[]).map((id) => ({
      id: id as HandoffTarget,
      label: TARGET_LABELS[id],
      budget: () => deps.getSettings().tokenBudgets[id],
    })),
    ...(deps.extraTargets ?? []).map((t) => ({ ...t, budget: () => t.budget })),
  ];
  const targetSel = h('select', { id: 't-target', class: 'target' });
  for (const t of targets) targetSel.append(h('option', { value: t.id }, t.label));
  const firstOther = targets.find((t) => t.id !== deps.adapter.id) ?? targets[0]!;
  targetSel.value = firstOther.id;

  const modeSel = h('select', { id: 't-mode', class: 'mode' });
  for (const [id, label] of Object.entries(MODE_LABELS))
    modeSel.append(h('option', { value: id }, label));

  const captureBtn = h(
    'button',
    { class: 'btn primary capture', type: 'button' },
    'Capture this chat',
  );
  const out = h('div', { class: 'transfer-out', 'aria-live': 'polite' });
  const el = h(
    'div',
    { class: 'view transfer-view' },
    h(
      'p',
      { class: 'note' },
      'Move this conversation to a new chat in another assistant. You review the text first; nothing is sent until you press send there.',
    ),
    h(
      'div',
      { class: 'grid2' },
      h('label', { for: 't-target' }, 'Continue in'),
      targetSel,
      h('label', { for: 't-mode' }, 'What to bring'),
      modeSel,
    ),
    h('div', { class: 'row' }, captureBtn),
    out,
  );

  let state: State | undefined;
  let busy = false;

  const target = () => targets.find((t) => t.id === targetSel.value) ?? firstOther;

  const clear = () => {
    state?.session?.clear();
    state = undefined;
    out.replaceChildren();
  };

  const rebuild = () => {
    if (!state) return;
    const s = deps.getSettings();
    state.session?.clear();
    state.capsule = buildCapsule(state.messages, {
      mode: modeSel.value as CapsuleMode,
      lastTurns: s.capsuleTurns,
      budgetTokens: target().budget(),
      sourceLabel: deps.adapter.config.label,
    });
    state.session = new RedactionSession({ enabled: s.redaction });
    state.redaction = state.session.redact(state.capsule.text);
    render();
  };

  const render = () => {
    if (!state?.capsule || !state.redaction) return;
    const c = state.capsule;
    const r = state.redaction;
    const t = target();
    const rows = reviewRows(r);
    replaceKids(
      out,
      h(
        'p',
        { class: 'meta' },
        `${c.messageCount} messages captured · about ${c.tokens.toLocaleString()} tokens of ${t.budget().toLocaleString()} for ${t.label}`,
      ),
      !state.complete ? h('p', { class: 'issues' }, state.note) : null,
      c.cut.length ? h('p', { class: 'note cut' }, `Left out to fit: ${c.cut.join(', ')}.`) : null,
      c.overBudget
        ? h(
            'p',
            { class: 'issues' },
            'Still over the size limit. Try "Summary only" or raise the budget in Settings.',
          )
        : null,
      h('p', { class: 'note summary' }, `${redactionSummary(r)}.`),
      rows.length
        ? h(
            'details',
            { class: 'privacy' },
            h(
              'summary',
              {},
              `Review private values (${rows.filter((x) => x.enabled).length} hidden)`,
            ),
            h(
              'ul',
              { class: 'rows' },
              ...rows.map((row) => {
                const box = h('input', {
                  type: 'checkbox',
                  checked: row.enabled,
                  'aria-label': row.ariaLabel,
                });
                box.addEventListener('change', () => {
                  if (!state?.redaction) return;
                  state.redaction = toggleItem(state.redaction, row.id, box.checked);
                  render();
                });
                return h(
                  'li',
                  {},
                  h(
                    'label',
                    { class: 'rowlabel' },
                    box,
                    h('span', { class: 'ph' }, row.placeholder),
                    h('span', { class: 'val' }, row.preview),
                  ),
                );
              }),
            ),
          )
        : null,
      h('div', { class: 'preview', tabindex: '0', 'aria-label': 'Handoff text preview' }, r.text),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          { class: 'btn primary handoff', type: 'button', onclick: () => void send() },
          `Open in ${t.label}`,
        ),
        h(
          'button',
          { class: 'btn copy-capsule', type: 'button', onclick: () => void copy() },
          'Copy',
        ),
        h('button', { class: 'btn save-md', type: 'button', onclick: save }, 'Save as Markdown'),
      ),
    );
  };

  const capture = async () => {
    if (busy) return;
    busy = true;
    captureBtn.disabled = true;
    deps.setStatus('Reading this chat (scrolling up for older messages)…');
    try {
      const res = await deps.adapter.captureMessages();
      clear();
      if (!res.messages.length) {
        deps.setStatus(
          'No messages found on this page. The site may have changed; see Diagnostics.',
          'bad',
        );
        return;
      }
      state = { messages: res.messages, complete: res.complete, note: res.note };
      rebuild();
      deps.setStatus('');
      captureBtn.textContent = 'Capture again';
    } catch (err) {
      deps.setStatus(
        `Could not read this chat: ${err instanceof Error ? err.message : String(err)}`,
        'bad',
      );
    } finally {
      busy = false;
      captureBtn.disabled = false;
    }
  };

  const finalText = () => state?.redaction?.text ?? '';

  const send = async () => {
    const text = finalText();
    if (!text) return;
    const t = target();
    deps.setStatus(`Opening ${t.label}…`);
    try {
      await deps.startHandoff(t.id, text);
      deps.setStatus(
        `Placed in a new ${t.label} chat. Review it there, then send it yourself.`,
        'ok',
      );
    } catch (err) {
      deps.setStatus(
        `${t.label} did not accept the text (${err instanceof Error ? err.message : String(err)}). Use Copy and paste it instead.`,
        'bad',
      );
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(finalText());
      deps.setStatus('Copied. Paste it into any chat.', 'ok');
    } catch {
      deps.setStatus('Could not copy; select the preview text instead.', 'bad');
    }
  };

  const save = () => {
    if (!state?.capsule) return;
    const md = capsuleMarkdown(
      { ...state.capsule, text: finalText() },
      `Handoff from ${deps.adapter.config.label}`,
    );
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const a = h('a', { href: url, download: `tessera-handoff-${stamp}.md` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    deps.setStatus('Saved to your downloads.', 'ok');
  };

  captureBtn.addEventListener('click', () => void capture());
  targetSel.addEventListener('change', rebuild);
  modeSel.addEventListener('change', rebuild);

  return {
    id: 'transfer',
    label: 'Transfer',
    el,
    show() {
      if (!state) modeSel.value = deps.getSettings().capsuleMode;
    },
    reset: clear,
  };
}
