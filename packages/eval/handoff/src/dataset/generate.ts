// Deterministic generator for the synthetic handoff dataset.
// `pnpm --filter @tessera/eval handoff:dataset` rewrites data/conversations.json; a test checks the committed file matches.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRng, type Rng } from '../rng.ts';
import type { CodeBlock, Conversation, Dataset, Message, Position, Question } from '../types.ts';
import { DOMAINS } from './domains.ts';
import { fence, type DomainSpec, type Exchange } from './spec.ts';

export const DATASET_VERSION = 1;
export const DEFAULT_SEED = 20260929;
export const VARIANTS_PER_DOMAIN = 4;

/** Generic small talk used to lengthen "long" conversations without planting anything. */
const GENERIC_FILLER: readonly Exchange[] = [
  [
    'Sorry, got pulled into a meeting. Where were we?',
    'No problem. We were in the middle of the plan; carry on whenever you are ready.',
  ],
  [
    'Can you summarise what we have so far in one line?',
    'We have the main constraints and a few decisions; the rest is detail we can fill in as we go.',
  ],
  [
    'Is there anything obvious I am missing?',
    'Nothing major. Write down assumptions as you make them so they are easy to revisit.',
  ],
  ['Let me think about that for a second.', 'Take your time.'],
  ['Ok, back. Let us continue.', 'Sure, go ahead.'],
];

type Event =
  | { kind: 'filler'; ex: Exchange }
  | { kind: 'fact'; ex: Exchange; q: Omit<Question, 'plantedAt' | 'position'> }
  | {
      kind: 'decision';
      ex: Exchange;
      q: Omit<Question, 'plantedAt' | 'position'>;
      revise?: Exchange;
    }
  | { kind: 'revision'; ex: Exchange; qid: string }
  | { kind: 'code'; ex: Exchange; q: Omit<Question, 'plantedAt' | 'position'> };

const CODE_FENCE = /```([A-Za-z0-9_+-]*)[^\n]*\n([\s\S]*?)\n?```/g;

export function extractCodeBlocks(text: string): CodeBlock[] {
  return [...text.matchAll(CODE_FENCE)].map((m) => ({ language: m[1] ?? '', code: m[2] ?? '' }));
}

function message(role: Message['role'], text: string): Message {
  return { role, text, codeBlocks: extractCodeBlocks(text), attachments: [] };
}

function positionOf(index: number, total: number): Position {
  const f = index / total;
  return f < 1 / 3 ? 'early' : f < 2 / 3 ? 'middle' : 'late';
}

function buildConversation(domain: DomainSpec, variant: number, r: Rng): Conversation {
  const id = `${domain.id}-${variant + 1}`;
  const length: 'short' | 'medium' | 'long' =
    (['short', 'medium', 'long', 'long'] as const)[variant % 4] ?? 'medium';
  const events: Event[] = [];

  for (const f of r.sample(domain.facts, r.int(3, Math.min(5, domain.facts.length)))) {
    const value = f.value(r);
    events.push({
      kind: 'fact',
      ex: f.plant(value, r),
      q: {
        id: `${id}/${f.id}`,
        kind: 'fact',
        question: f.question,
        accept: f.accept ? f.accept(value) : [value],
      },
    });
  }

  const decisions = r.sample(domain.decisions, r.int(1, Math.min(2, domain.decisions.length)));
  const forcedRevision = r.int(0, decisions.length - 1);
  decisions.forEach((d, i) => {
    const [first, second, third] = r.shuffle(d.options);
    const revised = i === forcedRevision || r.chance(0.3);
    const initial = first as string;
    const rejected = (second ?? third) as string;
    const final = revised ? rejected : initial;
    events.push({
      kind: 'decision',
      ex: d.plant(initial, rejected),
      q: {
        id: `${id}/${d.id}`,
        kind: 'decision',
        question: d.question,
        accept: [final],
        ...(revised ? { stale: initial } : {}),
      },
      ...(revised ? { revise: d.revise(initial, final) } : {}),
    });
  });

  for (const c of r.sample(domain.code, r.int(1, Math.min(2, domain.code.length)))) {
    const gen = c.make(r);
    events.push({
      kind: 'code',
      ex: c.plant(gen, fence(gen.language, gen.code)),
      q: {
        id: `${id}/${c.id}`,
        kind: 'code',
        question: c.question(gen),
        accept: [],
        code: { language: gen.language, code: gen.code },
      },
    });
  }

  const fillerCount = { short: r.int(1, 2), medium: r.int(3, 4), long: domain.filler.length }[
    length
  ];
  for (const ex of r.sample(domain.filler, fillerCount)) events.push({ kind: 'filler', ex });
  if (length === 'long')
    for (const ex of r.sample(GENERIC_FILLER, r.int(2, 4))) events.push({ kind: 'filler', ex });

  // Shuffle, then place each revision somewhere after the decision it revises.
  const ordered: Event[] = r.shuffle(events);
  for (const e of [...ordered]) {
    if (e.kind !== 'decision' || !e.revise) continue;
    const at = ordered.indexOf(e);
    const insertAt = r.int(at + 1, ordered.length);
    ordered.splice(insertAt, 0, { kind: 'revision', ex: e.revise, qid: e.q.id });
  }

  const messages: Message[] = [
    message('user', domain.opener[0]),
    message('assistant', domain.opener[1]),
  ];
  const plantedAt = new Map<string, number>();
  const pending: Omit<Question, 'plantedAt' | 'position'>[] = [];
  for (const e of ordered) {
    const at = messages.length;
    messages.push(message('user', e.ex[0]), message('assistant', e.ex[1]));
    if (e.kind === 'revision') plantedAt.set(e.qid, at);
    else if (e.kind !== 'filler') {
      plantedAt.set(e.q.id, at);
      pending.push(e.q);
    }
  }
  const closer = r.pick(domain.closers);
  messages.push(message('user', closer[0]), message('assistant', closer[1]));

  const questions: Question[] = r.shuffle(pending).map((q) => {
    const at = plantedAt.get(q.id) ?? 0;
    return { ...q, plantedAt: at, position: positionOf(at, messages.length) };
  });

  return { id, domain: domain.id, title: domain.title, messages, questions };
}

export function generateDataset(seed = DEFAULT_SEED): Dataset {
  const conversations: Conversation[] = [];
  DOMAINS.forEach((domain, di) => {
    for (let k = 0; k < VARIANTS_PER_DOMAIN; k++) {
      conversations.push(buildConversation(domain, k, createRng(seed + di * 1000 + k)));
    }
  });
  return { version: DATASET_VERSION, seed, generator: 'src/dataset/generate.ts', conversations };
}

export function serializeDataset(ds: Dataset): string {
  return JSON.stringify(ds, null, 2) + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = fileURLToPath(new URL('../../data/conversations.json', import.meta.url));
  const ds = generateDataset();
  writeFileSync(out, serializeDataset(ds));
  const q = ds.conversations.reduce((n, c) => n + c.questions.length, 0);
  console.info(`wrote ${ds.conversations.length} conversations, ${q} questions to ${out}`);
}
