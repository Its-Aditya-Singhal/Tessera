/**
 * Normalises text for "did the composer accept what we wrote?" comparisons.
 * Rich-text editors swap spaces for NBSPs, add a trailing newline, or use CRLF,
 * none of which means the write failed.
 */
export function normalizeForCompare(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u200b\ufeff]/g, (ch) => (ch === '\u00a0' ? ' ' : ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function textsMatch(actual: string, expected: string): boolean {
  return normalizeForCompare(actual) === normalizeForCompare(expected);
}

/** Collapses runs of blank lines and trims, for text scraped out of a page. */
export function tidyScrapedText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
