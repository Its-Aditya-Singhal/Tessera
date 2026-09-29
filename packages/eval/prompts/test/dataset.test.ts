import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCheck } from '../src/checks.ts';
import { loadDataset, parseDataset } from '../src/dataset.ts';
import { CATEGORIES, LANGS, STYLES, type Check } from '../src/types.ts';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/prompts.jsonl');
const { items } = loadDataset(file);

describe('prompts.jsonl', () => {
  it('has 150-200 valid items covering every category, language and style', () => {
    expect(items.length).toBeGreaterThanOrEqual(150);
    expect(items.length).toBeLessThanOrEqual(200);
    for (const c of CATEGORIES) expect(items.some((i) => i.category === c)).toBe(true);
    for (const l of LANGS)
      expect(items.filter((i) => i.lang === l).length).toBeGreaterThanOrEqual(10);
    for (const s of STYLES)
      expect(items.filter((i) => i.style === s).length).toBeGreaterThanOrEqual(30);
  });

  it('has checkable tasks in every language', () => {
    for (const l of LANGS)
      expect(items.filter((i) => i.lang === l && i.check).length).toBeGreaterThanOrEqual(5);
  });

  it('every numeric check accepts a correct "Answer: X" and rejects a wrong one', () => {
    const numeric = (c: Check | undefined): Extract<Check, { type: 'numeric' }> | undefined =>
      c?.type === 'numeric' ? c : undefined;
    const withNum = items.filter((i) => numeric(i.check));
    expect(withNum.length).toBeGreaterThan(30);
    for (const it of withNum) {
      const c = numeric(it.check)!;
      expect(runCheck(c, `Working...\nAnswer: ${c.answer}`).pass, it.id).toBe(true);
      const wrong = c.answer + 2 * (c.tolerance ?? 0) + 1;
      expect(runCheck(c, `Answer: ${wrong}`).pass, it.id).toBe(false);
    }
  });

  it('matches the generator output (run data/src/build.py after editing the sources)', () => {
    const text = readFileSync(file, 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.split('\n').filter(Boolean).length).toBe(items.length);
  });
});

describe('parseDataset', () => {
  it('rejects bad items with a line reference', () => {
    const bad = [
      JSON.stringify({ id: 'a', category: 'coding', lang: 'en', style: 'vague', prompt: 'x' }),
      '',
      JSON.stringify({
        id: 'a',
        category: 'poetry',
        lang: 'en',
        style: 'vague',
        prompt: 'x',
        check: { type: 'regex', pattern: '(' },
      }),
    ].join('\n');
    expect(() => parseDataset(bad)).toThrow(
      /duplicate id a[\s\S]*bad category poetry[\s\S]*bad regex/,
    );
    expect(() => parseDataset('{not json')).toThrow(/line 1/);
  });
});
