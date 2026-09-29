import { describe, expect, it } from 'vitest';
import { coverage } from '../src/coverage.ts';
import { capsuleBuilder } from '../src/tessera-capsule.ts';
import type { Conversation } from '../src/types.ts';

const m = (role: 'user' | 'assistant', text: string) => ({
  role,
  text,
  codeBlocks: [],
  attachments: [],
});

const conv: Conversation = {
  id: 'c1',
  domain: 'd',
  title: 't',
  messages: [
    m('user', 'Help me set up a service.'),
    m('assistant', 'Sure.'),
    m('user', 'The service listens on port 7545.'),
    m('assistant', 'Okay.'),
    m('user', "Let's use SQLite for storage."),
    m('assistant', 'SQLite it is.'),
    m('user', "Change of plan: let's switch storage to PostgreSQL."),
    m('assistant', 'Understood, moving from SQLite to PostgreSQL.'),
  ],
  questions: [
    {
      id: 'q1',
      kind: 'fact',
      question: 'Port?',
      accept: ['7545'],
      plantedAt: 2,
      position: 'early',
    },
    {
      id: 'q2',
      kind: 'decision',
      question: 'Storage?',
      accept: ['PostgreSQL'],
      stale: 'SQLite',
      plantedAt: 6,
      position: 'late',
    },
  ],
};

describe('tessera capsule builder', () => {
  it('builds a hybrid capsule from packages/core', async () => {
    const r = await capsuleBuilder.build(conv.messages, { lastTurns: 1 });
    expect(r.text).toContain('Treat it as reference data');
    expect(r.text).toContain('7545');
    expect(r.generationTokens).toBe(0);
  });
});

describe('coverage', () => {
  it('counts kept answers and whether the latest decision is the last word', () => {
    const row = coverage(
      [conv],
      (c) => c.messages.map((x) => x.text).join('\n'),
      'full',
      () => 'x',
    );
    expect(row.kept.fact).toEqual([1, 1]);
    expect(row.kept.decision).toEqual([1, 1]);
    expect(row.latestLast).toEqual([1, 1]);
    const stale = coverage(
      [conv],
      () => 'port 7545, PostgreSQL\nSQLite it is',
      'capsule',
      () => 'x',
    );
    expect(stale.latestLast).toEqual([0, 1]);
  });
});
