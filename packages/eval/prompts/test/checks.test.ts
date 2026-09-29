import { describe, expect, it } from 'vitest';
import {
  countBullets,
  extractFinalNumber,
  runCheck,
  scriptRatio,
  stripFence,
} from '../src/checks.ts';

describe('extractFinalNumber', () => {
  it('prefers an explicit answer marker over later numbers', () => {
    expect(extractFinalNumber('Answer: 42\n\nChecked with 3 methods.')).toBe(42);
  });
  it('reads Hindi and Tamil answer markers', () => {
    expect(extractFinalNumber('चरण 1 ... उत्तर: 15')).toBe(15);
    expect(extractFinalNumber('படி 2 ... விடை: 12900')).toBe(12900);
  });
  it('handles Indian digit grouping and currency', () => {
    expect(extractFinalNumber('The EMI is ₹17,770 per month.')).toBe(17770);
    expect(extractFinalNumber('Total: 2,00,000')).toBe(200000);
  });
  it('uses \\boxed and bold values', () => {
    expect(extractFinalNumber('so \\boxed{48} km/h, not 50')).toBe(48);
    expect(extractFinalNumber('It takes **5 minutes**, not 100.')).toBe(5);
  });
  it('falls back to the last number', () => {
    expect(extractFinalNumber('3 + 4 = 7')).toBe(7);
    expect(extractFinalNumber('no digits here')).toBeNull();
  });
});

describe('runCheck', () => {
  it('numeric respects tolerance', () => {
    expect(
      runCheck({ type: 'numeric', answer: 24.53, tolerance: 0.01 }, 'Each pays $24.53').pass,
    ).toBe(true);
    expect(
      runCheck({ type: 'numeric', answer: 24.53, tolerance: 0.01 }, 'Each pays $24.60').pass,
    ).toBe(false);
  });
  it('json accepts a fenced object and reports missing keys', () => {
    const ok = runCheck(
      { type: 'json', requiredKeys: ['a', 'b'] },
      '```json\n{"a": 1, "b": 2}\n```',
    );
    expect(ok.pass).toBe(true);
    const missing = runCheck({ type: 'json', requiredKeys: ['a', 'b'] }, '{"a": 1}');
    expect(missing).toEqual({ pass: false, detail: 'missing keys b' });
    expect(runCheck({ type: 'json' }, 'Here you go: {"a": 1}').pass).toBe(false);
  });
  it('counts bullets and numbered items', () => {
    expect(countBullets('- a\n* b\n• c\n1. d\n2) e\nnot a bullet')).toBe(5);
    expect(runCheck({ type: 'bulletCount', exact: 3 }, '- a\n- b\n- c').pass).toBe(true);
  });
  it('measures script share', () => {
    expect(scriptRatio('வணக்கம் friend', 'tamil')).toBeCloseTo(7 / 13, 2);
    expect(
      runCheck({ type: 'script', script: 'devanagari', minRatio: 0.5 }, 'नमस्ते दोस्त').pass,
    ).toBe(true);
    expect(
      runCheck({ type: 'script', script: 'latin', minRatio: 0.8 }, 'Kal milte hain!').pass,
    ).toBe(true);
  });
  it('combines checks with all', () => {
    const r = runCheck(
      {
        type: 'all',
        checks: [
          { type: 'contains', anyOf: ['Canberra'] },
          { type: 'wordCount', max: 2 },
        ],
      },
      'The capital is Canberra.',
    );
    expect(r.pass).toBe(false);
    expect(r.detail).toContain('FAIL');
  });
  it('stripFence leaves unfenced text alone', () => {
    expect(stripFence('  {"a":1} ')).toBe('{"a":1}');
  });
});
