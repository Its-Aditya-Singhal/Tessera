import { describe, expect, it } from 'vitest';
import { normalizeForCompare, textsMatch, tidyScrapedText } from '../src/text';

describe('normalizeForCompare', () => {
  it('treats NBSP, CRLF and trailing newlines as equal', () => {
    expect(textsMatch('hello\u00a0world\r\n', 'hello world')).toBe(true);
  });

  it('drops zero-width characters editors insert', () => {
    expect(normalizeForCompare('a\u200bb\ufeff')).toBe('ab');
  });

  it('keeps meaningful differences', () => {
    expect(textsMatch('hello world', 'hello  world!')).toBe(false);
  });

  it('keeps a single blank line between paragraphs', () => {
    expect(normalizeForCompare('a\n\n\n\nb')).toBe('a\n\nb');
  });
});

describe('tidyScrapedText', () => {
  it('trims trailing spaces on each line', () => {
    expect(tidyScrapedText('  a  \n b\t\n\n\n\nc ')).toBe('a\n b\n\nc');
  });
});
