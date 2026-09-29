// Loads and validates the prompt dataset (JSON Lines, one PromptItem per line).

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CATEGORIES, LANGS, STYLES, type Check, type PromptItem } from './types.ts';

const CHECK_TYPES = new Set([
  'numeric',
  'contains',
  'notContains',
  'regex',
  'json',
  'wordCount',
  'bulletCount',
  'script',
  'all',
]);

function validateCheck(c: unknown, where: string): string[] {
  if (typeof c !== 'object' || c === null) return [`${where}: check must be an object`];
  const check = c as Check;
  if (!CHECK_TYPES.has(check.type))
    return [`${where}: unknown check type ${String((check as { type: unknown }).type)}`];
  const errs: string[] = [];
  if (check.type === 'numeric' && typeof check.answer !== 'number')
    errs.push(`${where}: numeric check needs a number answer`);
  if (check.type === 'contains' && !(Array.isArray(check.anyOf) && check.anyOf.length))
    errs.push(`${where}: contains needs anyOf`);
  if (check.type === 'notContains' && !(Array.isArray(check.noneOf) && check.noneOf.length))
    errs.push(`${where}: notContains needs noneOf`);
  if (check.type === 'regex') {
    try {
      new RegExp(check.pattern, check.flags ?? '');
    } catch (e) {
      errs.push(`${where}: bad regex: ${(e as Error).message}`);
    }
  }
  if (check.type === 'all') {
    if (!Array.isArray(check.checks) || check.checks.length === 0)
      errs.push(`${where}: all needs checks`);
    else
      check.checks.forEach((sub, i) => errs.push(...validateCheck(sub, `${where}.checks[${i}]`)));
  }
  return errs;
}

export function validateItems(items: unknown[]): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  items.forEach((raw, i) => {
    const where = `item ${i + 1}`;
    if (typeof raw !== 'object' || raw === null) {
      errs.push(`${where}: not an object`);
      return;
    }
    const it = raw as Partial<PromptItem>;
    if (typeof it.id !== 'string' || !it.id) errs.push(`${where}: missing id`);
    else if (seen.has(it.id)) errs.push(`${where}: duplicate id ${it.id}`);
    else seen.add(it.id);
    if (!CATEGORIES.includes(it.category as never))
      errs.push(`${where}: bad category ${String(it.category)}`);
    if (!LANGS.includes(it.lang as never)) errs.push(`${where}: bad lang ${String(it.lang)}`);
    if (!STYLES.includes(it.style as never)) errs.push(`${where}: bad style ${String(it.style)}`);
    if (typeof it.prompt !== 'string' || it.prompt.trim().length === 0)
      errs.push(`${where}: empty prompt`);
    if (it.check !== undefined) errs.push(...validateCheck(it.check, `${where} (${it.id})`));
  });
  return errs;
}

export function parseDataset(text: string): PromptItem[] {
  const items: unknown[] = [];
  text.split('\n').forEach((line, i) => {
    const l = line.trim();
    if (!l || l.startsWith('//')) return;
    try {
      items.push(JSON.parse(l));
    } catch (e) {
      throw new Error(`dataset line ${i + 1}: invalid JSON: ${(e as Error).message}`, { cause: e });
    }
  });
  const errs = validateItems(items);
  if (errs.length) throw new Error(`Invalid dataset:\n  ${errs.join('\n  ')}`);
  return items as PromptItem[];
}

export function loadDataset(file: string): { items: PromptItem[]; sha256: string } {
  const text = readFileSync(file, 'utf8');
  return { items: parseDataset(text), sha256: createHash('sha256').update(text).digest('hex') };
}
