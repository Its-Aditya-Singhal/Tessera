import { describe, expect, it } from 'vitest';
import { ImportHistory } from '../src/adapters/history';

describe('ImportHistory', () => {
  it('undoes in reverse order', () => {
    const h = new ImportHistory();
    h.record('a', 'b');
    h.record('b', 'c');
    expect(h.pop()).toBe('b');
    expect(h.pop()).toBe('a');
    expect(h.canUndo()).toBe(false);
    expect(h.pop()).toBeUndefined();
  });

  it('keeps at most 20 entries', () => {
    const h = new ImportHistory();
    for (let i = 0; i < 25; i++) h.record(String(i), String(i + 1));
    let count = 0;
    while (h.pop() !== undefined) count++;
    expect(count).toBe(20);
  });
});
