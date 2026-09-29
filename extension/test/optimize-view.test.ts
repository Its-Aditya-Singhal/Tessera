import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineStatus } from '../src/engine/host';
import { runOptimize } from '../src/optimize';
import { DEFAULT_SETTINGS } from '../src/settings';
import { createOptimizeView } from '../src/ui/optimize-view';

const status = (tier: 0 | 1): EngineStatus =>
  ({ tier, tierLabel: tier ? 'Built-in model' : 'Rules only' }) as EngineStatus;

const VAGUE = 'write something about my project for the team, email me at priya.sharma@example.com';

function fakeEngine(answer: string | Error, tier: 0 | 1 = 1) {
  const seen: string[] = [];
  return {
    seen,
    status: vi.fn(async () => status(tier)),
    intent: vi.fn(async () => null),
    generate: vi.fn(async (req: { prompt: string }) => {
      seen.push(req.prompt);
      if (answer instanceof Error) throw answer;
      return { text: answer, tier: 1 as const, ms: 5 };
    }),
  };
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

function mount(engine: ReturnType<typeof fakeEngine>) {
  const imported: string[] = [];
  const view = createOptimizeView({
    getSettings: () => DEFAULT_SETTINGS,
    engine,
    importText: async (t) => {
      imported.push(t);
      return true;
    },
    setStatus: () => undefined,
  });
  document.body.replaceChildren(view.el);
  const $ = <T extends Element>(s: string) => view.el.querySelector(s) as T;
  return { view, imported, $ };
}

const REWRITE = JSON.stringify({
  verdict: 'improve',
  optimized:
    'Write a one-paragraph project update for my team. Email it to [EMAIL_1]. Keep it under 120 words.',
  changes: ['Named the format', 'Added a length limit'],
  questions: [],
});

describe('optimize view', () => {
  beforeEach(() => document.body.replaceChildren());

  it('shows a word diff and imports the rewrite with the email still hidden', async () => {
    const engine = fakeEngine(REWRITE);
    const { view, imported, $ } = mount(engine);
    view.load(VAGUE);
    $<HTMLButtonElement>('.optimize').click();
    await flush();
    expect(engine.seen.join('')).not.toContain('priya.sharma@example.com');
    expect($('.verdict')!.textContent).toContain('Suggested rewrite');
    expect($('.diff ins')).not.toBeNull();
    expect($('.changes')!.textContent).toContain('Added a length limit');
    $<HTMLButtonElement>('.use').click();
    await flush();
    expect(imported[0]).toContain('[EMAIL_1]');
    expect(imported[0]).not.toContain('priya.sharma');
  });

  it('puts the real value back when the user unchecks it', async () => {
    const { view, imported, $ } = mount(fakeEngine(REWRITE));
    view.load(VAGUE);
    $<HTMLButtonElement>('.optimize').click();
    await flush();
    const box = $<HTMLInputElement>('.privacy input[type="checkbox"]');
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    $<HTMLButtonElement>('.use').click();
    await flush();
    expect(imported[0]).toContain('priya.sharma@example.com');
  });

  it('lets the user edit the rewrite before importing', async () => {
    const { view, imported, $ } = mount(fakeEngine(REWRITE));
    view.load(VAGUE);
    $<HTMLButtonElement>('.optimize').click();
    await flush();
    $<HTMLButtonElement>('.edit-toggle').click();
    const area = $<HTMLTextAreaElement>('textarea.edit');
    area.value = 'My own version for [EMAIL_1]';
    area.dispatchEvent(new Event('input'));
    $<HTMLButtonElement>('.use').click();
    await flush();
    expect(imported[0]).toBe('My own version for [EMAIL_1]');
  });

  it('asks questions and folds the answers into the prompt', async () => {
    const { view, $ } = mount(fakeEngine(new Error('no model'), 0));
    view.load('fix it');
    $<HTMLButtonElement>('.optimize').click();
    await flush();
    expect($('.verdict.ask')).not.toBeNull();
    const q = $<HTMLInputElement>('input.q');
    q.value = 'the login form in my React app';
    $<HTMLButtonElement>('.answer').click();
    await flush();
    expect($<HTMLTextAreaElement>('#t-text').value).toContain('the login form in my React app');
  });

  it('forgets the result and its mapping on reset', async () => {
    const { view, $ } = mount(fakeEngine(REWRITE));
    view.load(VAGUE);
    $<HTMLButtonElement>('.optimize').click();
    await flush();
    view.reset();
    expect($('.result')!.childElementCount).toBe(0);
  });
});

describe('runOptimize', () => {
  it('falls back to rules when the model fails, and says why', async () => {
    const res = await runOptimize(VAGUE, DEFAULT_SETTINGS, fakeEngine(new Error('GPU lost')));
    expect(res.tierLabel).toBe('Rules only');
    expect(res.outcome.notes[0]).toContain('GPU lost');
    expect(res.outcome.gate.hints.length).toBeGreaterThan(0);
  });

  it('never calls the model on tier 0', async () => {
    const engine = fakeEngine(REWRITE, 0);
    await runOptimize(VAGUE, DEFAULT_SETTINGS, engine);
    expect(engine.generate).not.toHaveBeenCalled();
  });

  it('respects the redaction switches from settings', async () => {
    const engine = fakeEngine(REWRITE);
    const settings = {
      ...DEFAULT_SETTINGS,
      redaction: { ...DEFAULT_SETTINGS.redaction, EMAIL: false },
    };
    const res = await runOptimize(VAGUE, settings, engine);
    expect(res.outcome.redaction.items).toHaveLength(0);
  });
});
