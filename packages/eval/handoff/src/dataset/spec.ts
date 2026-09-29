// Building blocks for synthetic conversation templates.
// Every planted value is drawn from a seeded RNG so a model cannot answer from priors:
// the no-context condition should score near zero on facts and code.

import type { Rng } from '../rng.ts';

export type Exchange = [user: string, assistant: string];

export interface FactSpec {
  id: string;
  question: string;
  value(r: Rng): string;
  /** Strings that count as correct. Defaults to [value]. */
  accept?(value: string): string[];
  plant(value: string, r: Rng): Exchange;
}

export interface DecisionSpec {
  id: string;
  question: string;
  options: readonly string[];
  plant(choice: string, rejected: string): Exchange;
  /** Later turn where the team changes its mind from `from` to `to`. */
  revise(from: string, to: string): Exchange;
}

export interface GeneratedCode {
  name: string;
  language: string;
  code: string;
}

export interface CodeSpec {
  id: string;
  make(r: Rng): GeneratedCode;
  plant(code: GeneratedCode, fenced: string): Exchange;
  question(code: GeneratedCode): string;
}

export interface DomainSpec {
  id: string;
  title: string;
  opener: Exchange;
  facts: readonly FactSpec[];
  decisions: readonly DecisionSpec[];
  code: readonly CodeSpec[];
  filler: readonly Exchange[];
  closers: readonly Exchange[];
}

// ---- value helpers -------------------------------------------------------

const SYLLABLES = [
  'ka',
  'lo',
  'mir',
  'tan',
  'vel',
  'zo',
  'rin',
  'dax',
  'pem',
  'sul',
  'or',
  'bex',
  'ny',
  'quo',
  'fen',
];
const WORDS = [
  'harbor',
  'quill',
  'ember',
  'lattice',
  'cobalt',
  'juniper',
  'meridian',
  'saffron',
  'tundra',
  'willow',
  'orchid',
  'granite',
  'nimbus',
  'pylon',
  'marlin',
  'thistle',
  'basalt',
  'lumen',
  'kestrel',
  'fjord',
];
const PEOPLE = [
  'Dr. Ilsa Vantorre',
  'Prof. Keshav Ramnath',
  'Dr. Mireille Okafor',
  'Prof. Tomasz Brevik',
  'Dr. Anjali Sethuraman',
  'Prof. Oren Castellan',
  'Dr. Yuki Halvorsen',
  'Prof. Nadia Quennell',
];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const v = {
  word: (r: Rng): string => r.pick(WORDS),
  name: (r: Rng): string => r.pick(SYLLABLES) + r.pick(SYLLABLES) + r.pick(SYLLABLES),
  person: (r: Rng): string => r.pick(PEOPLE),
  ident: (r: Rng): string =>
    `${r.pick(WORDS)}${r.pick(SYLLABLES).replace(/^./, (c) => c.toUpperCase())}`,
  code: (r: Rng, prefix: string): string => `${prefix}-${r.int(1000, 9899)}`,
  upper: (r: Rng, n: number): string =>
    Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[r.int(0, 31)]).join(''),
  date: (r: Rng): string => `${r.int(3, 27)} ${r.pick(MONTHS)}`,
  time: (r: Rng): string =>
    `${String(r.int(5, 22)).padStart(2, '0')}:${r.pick(['05', '15', '20', '35', '40', '50'])}`,
  /** Formats with thousands separators: 48500 -> "48,500". */
  money: (n: number): string => n.toLocaleString('en-US'),
};

/** Accept both "48,500" and "48500" style answers. */
export const numberAccept = (value: string): string[] => {
  const digits = value.replace(/[^0-9.]/g, '');
  return digits && digits !== value ? [value, digits] : [value];
};

export const fence = (language: string, code: string): string =>
  '```' + language + '\n' + code + '\n```';
