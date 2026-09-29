import { describe, expect, it } from 'vitest';
import {
  HANDOFF_PREAMBLE,
  approxTokens,
  buildCapsule,
  capsuleMarkdown,
  extract,
  recentStart,
} from '../../src/handoff';
import type { Message } from '../../src/types';

const msg = (role: Message['role'], text: string, extra: Partial<Message> = {}): Message => ({
  role,
  text,
  codeBlocks: [],
  attachments: [],
  ...extra,
});

const CODE = 'export function prorate(days: number) {\n  return days / 30;\n}\n';

const CHAT: Message[] = [
  msg('user', "I'm adding subscription billing to my TypeScript SaaS app. Can you help?"),
  msg('assistant', 'Sure. Let us pin down plans, trials and the data model.'),
  msg('user', "Let's make the free trial 9 days, not 14."),
  msg('assistant', 'Got it: a 9-day trial.'),
  msg('user', 'On staging the billing service listens on port 7545.'),
  msg('assistant', 'Okay, staging billing on 7545.'),
  msg('user', 'Should we use SQLite or PostgreSQL?'),
  msg('assistant', "I'd go with SQLite here. We agreed: SQLite it is."),
  msg(
    'user',
    "Change of plan: ops can't support SQLite. Let's switch billing records to PostgreSQL.",
  ),
  msg('assistant', `Here is the proration helper:\n\`\`\`ts\n${CODE}\`\`\``, {
    codeBlocks: [{ language: 'ts', code: CODE }],
  }),
  msg('user', 'Here is our price list.', {
    attachments: [{ name: 'prices.csv', type: 'text/csv' }],
  }),
  msg('assistant', 'Thanks. Want me to write the webhook handler next?'),
];

describe('extract', () => {
  it('finds the goal, decisions (marking revisions), facts, code and files', () => {
    const e = extract(CHAT);
    expect(e.goal).toContain('subscription billing');
    expect(e.decisions.join('\n')).toMatch(/9 days/);
    expect(e.decisions.at(-1)).toMatch(/^\(changed\) .*PostgreSQL/);
    expect(e.facts.join('\n')).toContain('7545');
    expect(e.code).toHaveLength(1);
    expect(e.attachments).toEqual(['prices.csv (text/csv)']);
    expect(e.open).toEqual(['Assistant asked: Want me to write the webhook handler next?']);
  });

  it('lists an unanswered final user question as open', () => {
    const e = extract([...CHAT, msg('user', 'How do refunds work with proration?')]);
    expect(e.open).toEqual(['How do refunds work with proration?']);
  });
});

describe('buildCapsule', () => {
  it('starts every mode with the reference-data preamble', () => {
    for (const mode of ['full', 'capsule', 'hybrid'] as const) {
      const r = buildCapsule(CHAT, { mode });
      expect(r.text.startsWith(HANDOFF_PREAMBLE)).toBe(true);
      expect(r.text).toContain('End of handoff context');
    }
  });

  it('full mode keeps the whole transcript and code verbatim', () => {
    const r = buildCapsule(CHAT, { mode: 'full' });
    for (const m of CHAT) expect(r.text).toContain(m.text);
    expect(r.cut).toEqual([]);
  });

  it('capsule mode keeps code verbatim and the planted values', () => {
    const r = buildCapsule(CHAT, { mode: 'capsule' });
    expect(r.text).toContain(CODE.trimEnd());
    expect(r.text).toContain('7545');
    expect(r.text).toContain('PostgreSQL');
    expect(r.text).not.toContain('Most recent messages');
    expect(r.sections.map((s) => s.id)).toEqual([
      'goal',
      'facts',
      'decisions',
      'open',
      'code',
      'attachments',
    ]);
  });

  it('hybrid mode adds the last N turns and does not repeat code that is in them', () => {
    const r = buildCapsule(CHAT, { mode: 'hybrid', lastTurns: 2 });
    expect(r.text).toContain('Most recent messages');
    expect(r.text).toContain("Change of plan: ops can't support SQLite");
    expect(r.text.split(CODE.trimEnd()).length - 1).toBe(1);
  });

  it('full mode drops the oldest turns to fit, keeps the goal, and says so', () => {
    const long = [
      ...CHAT,
      ...Array.from({ length: 40 }, (_, i) =>
        msg(i % 2 ? 'assistant' : 'user', `Filler message ${i} `.repeat(30)),
      ),
    ];
    const r = buildCapsule(long, { mode: 'full', budgetTokens: 1500 });
    expect(r.tokens).toBeLessThanOrEqual(1500);
    expect(r.text).toContain('subscription billing');
    expect(r.text).toMatch(/\[\d+ earlier message\(s\) left out/);
    expect(r.cut[0]).toMatch(/earlier message/);
  });

  it('hybrid mode trims verbatim turns first, then older facts', () => {
    const many = [
      ...CHAT,
      ...Array.from({ length: 30 }, (_, i) => [
        msg(
          'user',
          `Set limit_${i} to ${1000 + i} and keep going with the plan please. `.repeat(4),
        ),
        msg('assistant', `Done ${i}.`),
      ]).flat(),
    ];
    const r = buildCapsule(many, { mode: 'hybrid', lastTurns: 6, budgetTokens: 600 });
    expect(r.cut[0]).toMatch(/most recent turns/);
    expect(r.cut.join(' ')).toMatch(/older fact/);
    expect(r.text).toContain(CODE.trimEnd());
  });

  it('flags a result that cannot fit', () => {
    const huge = 'x'.repeat(20_000);
    const r = buildCapsule(
      [
        msg('user', 'Keep this code'),
        msg('assistant', huge, { codeBlocks: [{ language: '', code: huge }] }),
      ],
      { mode: 'capsule', budgetTokens: 500 },
    );
    expect(r.cut.join(' ')).toMatch(/code block/);
    expect(r.overBudget).toBe(false);
  });

  it('makes a Markdown file', () => {
    expect(capsuleMarkdown(buildCapsule(CHAT, { mode: 'capsule' }), 'Billing')).toMatch(
      /^# Billing\n\n/,
    );
  });
});

describe('helpers', () => {
  it('recentStart counts turns from the last user message', () => {
    expect(recentStart(CHAT, 1)).toBe(10);
    expect(recentStart(CHAT, 2)).toBe(8);
    expect(recentStart(CHAT, 100)).toBe(0);
    expect(recentStart(CHAT, 0)).toBe(CHAT.length);
  });

  it('approxTokens counts words in pieces and Indic text more densely', () => {
    expect(approxTokens('hello world')).toBe(4);
    expect(approxTokens('a, b')).toBe(3);
    expect(approxTokens('नमस्ते')).toBeGreaterThan(approxTokens('hello'));
  });
});
