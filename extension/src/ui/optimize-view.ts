import {
  finalText,
  foldAnswers,
  gatePrompt,
  reviewRows,
  toggleItem,
  wordDiff,
  type GateResult,
  type InvariantIssue,
  type OptimizeOutcome,
  type RedactionResult,
} from '@tessera/core';
import { runOptimize, type EngineLike, type RunOptions } from '../optimize';
import type { Settings } from '../settings';
import { h, replaceKids } from './dom';

export interface OptimizeViewDeps {
  getSettings(): Settings;
  engine: EngineLike & { intent(): Promise<unknown> };
  /** Writes text into the chatbox, records Undo and reports status. */
  importText(text: string, verb?: string): Promise<boolean>;
  setStatus(msg: string, tone?: 'ok' | 'bad' | ''): void;
  openSettings?(): void;
}

export interface OptimizeView {
  el: HTMLElement;
  /** Replace the prompt with text read from the chatbox and clear any result. */
  load(text: string): void;
  focus(): void;
  /** Forget the current result and its placeholder mapping. */
  reset(): void;
}

const VERDICT_CHIP: Record<GateResult['verdict'], [string, string]> = {
  ok_as_is: ['Looks clear', 'ok'],
  improve: ['Could be clearer', 'warn'],
  ask: ['Needs more detail', 'warn'],
};

const ISSUE_LABEL: Record<InvariantIssue['kind'], string> = {
  number: 'number',
  url: 'link',
  code: 'code block',
  quote: 'quoted text',
  placeholder: 'hidden value',
};

const INTENT_EVERY_MS = 15_000;

interface Current {
  outcome: OptimizeOutcome;
  tierLabel: string;
  redaction: RedactionResult;
  /** The user's edit of the rewrite, if any. */
  edited?: string;
  editing: boolean;
  prompt: string;
}

/** The Optimize tab: prompt box, live hints, and the result of an optimize run. */
export function createOptimizeView(deps: OptimizeViewDeps): OptimizeView {
  const text = h('textarea', {
    id: 't-text',
    spellcheck: false,
    'aria-describedby': 't-live',
    placeholder: 'Type or paste a prompt, or open this panel with text already in the chatbox.',
  });
  const chip = h('span', { class: 'chip' });
  const hintList = h('ul', { class: 'hints' });
  const live = h('div', { id: 't-live', class: 'live', 'aria-live': 'polite' }, chip, hintList);
  const optimizeBtn = h(
    'button',
    { class: 'btn primary optimize', type: 'button', title: 'Optimize (Ctrl+Enter)' },
    'Optimize',
  );
  const cancelBtn = h('button', { class: 'btn cancel', type: 'button', hidden: true }, 'Cancel');
  const importBtn = h(
    'button',
    { class: 'btn import', type: 'button', title: 'Put this text in the chatbox as it is' },
    'Import',
  );
  const result = h('div', { class: 'result', 'aria-live': 'polite' });
  const el = h(
    'div',
    { class: 'view optimize-view' },
    h('label', { for: 't-text' }, 'Your prompt'),
    text,
    live,
    h('div', { class: 'row' }, optimizeBtn, cancelBtn, importBtn),
    result,
  );

  let current: Current | undefined;
  let runId = 0;
  let lastIntent = 0;

  // ---------- Live hints while typing ----------
  let liveTimer: ReturnType<typeof setTimeout> | undefined;
  const renderLive = () => {
    const value = text.value;
    if (!value.trim()) {
      chip.textContent = '';
      chip.className = 'chip';
      hintList.replaceChildren();
      return;
    }
    const gate = gatePrompt(value);
    const [label, tone] = VERDICT_CHIP[gate.verdict];
    chip.textContent = label;
    chip.className = `chip ${tone}`;
    replaceKids(hintList, ...gate.hints.map((hint) => h('li', {}, hint)));
    // Warm the model up in the background while the user is still typing.
    if (gate.verdict !== 'ok_as_is' && Date.now() - lastIntent > INTENT_EVERY_MS) {
      lastIntent = Date.now();
      void deps.engine.intent().catch(() => undefined);
    }
  };
  text.addEventListener('input', () => {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(renderLive, 250);
  });

  // ---------- Running ----------
  const setBusy = (busy: boolean) => {
    optimizeBtn.disabled = busy;
    importBtn.disabled = busy;
    cancelBtn.hidden = !busy;
    for (const b of result.querySelectorAll('button')) b.disabled = busy;
  };

  const clearCurrent = () => {
    current?.outcome.session.clear();
    current = undefined;
  };

  const run = async (opts: RunOptions = {}) => {
    const prompt = text.value;
    if (!prompt.trim()) {
      deps.setStatus('Type a prompt first.', 'bad');
      return;
    }
    const id = ++runId;
    setBusy(true);
    deps.setStatus('Optimizing on this device…');
    try {
      const res = await runOptimize(prompt, deps.getSettings(), deps.engine, opts);
      if (id !== runId) {
        res.outcome.session.clear();
        return;
      }
      clearCurrent();
      // Keep the answers in the prompt box so they are not lost if the user edits and re-runs.
      if (opts.answers?.some((a) => a.answer.trim())) {
        text.value = foldAnswers(prompt, opts.answers);
        renderLive();
      }
      current = {
        outcome: res.outcome,
        tierLabel: res.tierLabel,
        redaction: res.outcome.redaction,
        editing: false,
        prompt,
      };
      deps.setStatus('');
      render();
    } catch (err) {
      if (id === runId)
        deps.setStatus(
          `Could not optimize: ${err instanceof Error ? err.message : String(err)}`,
          'bad',
        );
    } finally {
      if (id === runId) setBusy(false);
    }
  };

  optimizeBtn.addEventListener('click', () => void run());
  cancelBtn.addEventListener('click', () => {
    runId++;
    setBusy(false);
    deps.setStatus('Cancelled.');
  });
  importBtn.addEventListener('click', () => void deps.importText(text.value));
  text.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      void run();
    }
  });

  // ---------- Result ----------
  const render = () => {
    // The result carries its own hints; don't show them twice.
    hintList.hidden = Boolean(current);
    if (!current) {
      result.replaceChildren();
      return;
    }
    const c = current;
    const o = c.outcome;
    const rewrite = c.edited ?? o.optimizedRedacted;
    replaceKids(
      result,
      banner(c),
      o.verdict === 'improve' && !rewrite && o.gate.hints.length
        ? h('ul', { class: 'hints' }, ...o.gate.hints.map((x) => h('li', {}, x)))
        : null,
      o.verdict === 'ask' ? questions(c) : null,
      o.notes.length ? h('ul', { class: 'notes' }, ...o.notes.map((n) => h('li', {}, n))) : null,
      o.source === 'rules' && o.verdict !== 'ok_as_is' && deps.openSettings
        ? h(
            'button',
            { class: 'linkish setup', type: 'button', onclick: () => deps.openSettings?.() },
            'Set up an on-device model for full rewrites',
          )
        : null,
      rewrite ? rewriteBlock(c, rewrite) : null,
      o.changes.length && !c.editing
        ? h(
            'div',
            { class: 'changes' },
            h('h3', {}, 'What changed'),
            h('ul', {}, ...o.changes.map((x) => h('li', {}, x))),
          )
        : null,
      o.issues.length ? issues(o.issues) : null,
      c.redaction.items.length ? privacy(c) : null,
      actions(c, rewrite),
    );
  };

  const banner = (c: Current) => {
    const o = c.outcome;
    const by = o.source === 'model' ? c.tierLabel : 'rules';
    if (o.verdict === 'improve' && o.optimizedRedacted)
      return h(
        'div',
        { class: 'verdict improve' },
        h('strong', {}, 'Suggested rewrite'),
        ` · ${by}`,
      );
    if (o.verdict === 'improve')
      return h(
        'div',
        { class: 'verdict improve' },
        h('strong', {}, 'This prompt could be clearer.'),
        ' Suggestions:',
      );
    if (o.verdict === 'ask')
      return h(
        'div',
        { class: 'verdict ask' },
        h('strong', {}, 'A couple of questions first.'),
        ' Answers are added to your prompt.',
      );
    return h(
      'div',
      { class: 'verdict ok' },
      h('strong', {}, 'Your prompt already looks clear.'),
      ` · ${by}`,
    );
  };

  const questions = (c: Current) => {
    const inputs = c.outcome.questions.map((q, i) => {
      const input = h('input', { type: 'text', id: `t-q${i}`, class: 'q' });
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          submit();
        }
      });
      return { q, input };
    });
    const submit = () =>
      void run({ answers: inputs.map(({ q, input }) => ({ question: q, answer: input.value })) });
    return h(
      'div',
      { class: 'questions' },
      ...inputs.map(({ q, input }) =>
        h('div', { class: 'qa' }, h('label', { for: input.id }, q), input),
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn primary answer', type: 'button', onclick: submit }, 'Continue'),
        h(
          'button',
          { class: 'btn', type: 'button', onclick: () => void run({ force: true }) },
          'Skip and optimize',
        ),
      ),
    );
  };

  const rewriteBlock = (c: Current, rewrite: string) => {
    if (c.editing) {
      const area = h('textarea', {
        class: 'edit',
        'aria-label': 'Edit the rewrite',
        spellcheck: false,
      });
      area.value = rewrite;
      area.addEventListener('input', () => {
        c.edited = area.value;
      });
      queueMicrotask(() => area.focus());
      return area;
    }
    const diff = h('div', {
      class: 'diff',
      'aria-label': 'Changes from your prompt to the rewrite',
    });
    for (const op of wordDiff(c.redaction.text, rewrite)) {
      if (op.type === 'equal') diff.append(op.text);
      else if (op.type === 'insert') diff.append(h('ins', {}, op.text));
      else diff.append(h('del', {}, op.text));
    }
    return diff;
  };

  const issues = (list: InvariantIssue[]) =>
    h(
      'div',
      { class: 'issues', role: 'alert' },
      h('strong', {}, 'Missing from the rewrite: '),
      list
        .slice(0, 6)
        .map((i) => `${ISSUE_LABEL[i.kind]} ${short(i.value)}`)
        .join(', '),
      list.length > 6 ? ` and ${list.length - 6} more` : '',
    );

  const privacy = (c: Current) => {
    const rows = reviewRows(c.redaction);
    const hidden = rows.filter((r) => r.enabled).length;
    return h(
      'details',
      { class: 'privacy', open: true },
      h('summary', {}, `Private values: ${hidden} of ${rows.length} hidden`),
      h(
        'p',
        { class: 'note' },
        'Checked values are never shown to the model, and stay hidden in the chatbox as placeholders like [EMAIL_1]. Uncheck one to put the real value back.',
      ),
      h(
        'ul',
        { class: 'rows' },
        ...rows.map((r) => {
          const box = h('input', {
            type: 'checkbox',
            checked: r.enabled,
            'aria-label': r.ariaLabel,
          });
          box.addEventListener('change', () => {
            c.redaction = toggleItem(c.redaction, r.id, box.checked);
            render();
          });
          return h(
            'li',
            {},
            h(
              'label',
              { class: 'rowlabel' },
              box,
              h('span', { class: 'ph' }, r.placeholder),
              h('span', { class: 'val' }, r.preview),
              r.uncertain ? h('span', { class: 'maybe' }, 'possible') : null,
            ),
          );
        }),
      ),
    );
  };

  const actions = (c: Current, rewrite: string | undefined) => {
    const o = c.outcome;
    const btns: HTMLElement[] = [];
    if (rewrite) {
      btns.push(
        h(
          'button',
          {
            class: 'btn primary use',
            type: 'button',
            onclick: () =>
              // Read at click time: the edit box changes c.edited without re-rendering.
              void deps.importText(
                finalText(c.edited ?? c.outcome.optimizedRedacted ?? rewrite, c.redaction.items),
                'Import',
              ),
          },
          'Use rewrite',
        ),
        h(
          'button',
          {
            class: 'btn edit-toggle',
            type: 'button',
            onclick: () => {
              c.editing = !c.editing;
              render();
            },
          },
          c.editing ? 'Show changes' : 'Edit',
        ),
      );
    }
    if (o.source === 'model' || o.verdict === 'ok_as_is')
      btns.push(
        h(
          'button',
          { class: 'btn regen', type: 'button', onclick: () => void run({ force: true }) },
          o.optimizedRedacted ? 'Regenerate' : 'Optimize anyway',
        ),
      );
    if (c.redaction.items.some((i) => i.enabled))
      btns.push(
        h(
          'button',
          {
            class: 'btn scrubbed',
            type: 'button',
            title: 'Your own prompt, with the checked values replaced by placeholders',
            onclick: () => void deps.importText(c.redaction.text, 'Import'),
          },
          'Import original, scrubbed',
        ),
      );
    return btns.length ? h('div', { class: 'row' }, ...btns) : null;
  };

  return {
    el,
    load(value: string) {
      runId++;
      setBusy(false);
      clearCurrent();
      render();
      text.value = value;
      renderLive();
    },
    focus: () => text.focus(),
    reset() {
      runId++;
      clearCurrent();
      render();
    },
  };
}

function short(value: string): string {
  const flat = value.replace(/\s+/g, ' ');
  return `“${flat.length > 30 ? `${flat.slice(0, 27)}…` : flat}”`;
}
