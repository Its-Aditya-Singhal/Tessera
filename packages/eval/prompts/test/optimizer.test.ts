import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadOptimizer, normalizeResult } from '../src/optimizer.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'tessera-opt-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('loadOptimizer', () => {
  it('loads an optimizer object from a module', async () => {
    writeFileSync(
      path.join(dir, 'obj.mjs'),
      "export default { id: 'obj', optimize: async (p) => ({ verdict: 'improve', optimized: p + '!' }) };",
    );
    const opt = await loadOptimizer({ kind: 'module', module: './obj.mjs' }, dir);
    expect(opt.id).toBe('obj');
    expect(await opt.optimize('hi', { lang: 'en' })).toEqual({
      verdict: 'improve',
      optimized: 'hi!',
    });
  });

  it('calls a named factory export with options', async () => {
    writeFileSync(
      path.join(dir, 'factory.mjs'),
      "export function make(o) { return { id: 'f-' + o.tag, optimize: async (p) => ({ verdict: 'ok_as_is', optimized: p }) }; }",
    );
    const opt = await loadOptimizer(
      { kind: 'module', module: './factory.mjs', export: 'make', options: { tag: 'x' } },
      dir,
    );
    expect(opt.id).toBe('f-x');
  });

  it('rejects modules that do not export an optimizer', async () => {
    writeFileSync(path.join(dir, 'bad.mjs'), 'export default 42;');
    await expect(loadOptimizer({ kind: 'module', module: './bad.mjs' }, dir)).rejects.toThrow(
      /not a PromptOptimizer/,
    );
  });
});

describe('normalizeResult', () => {
  it('keeps ask verdicts and their questions but never a rewritten prompt', () => {
    expect(
      normalizeResult('p', { verdict: 'ask', optimized: 'other', questions: ['which?'] }),
    ).toEqual({
      verdict: 'ask',
      optimized: 'p',
      questions: ['which?'],
    });
  });
});
