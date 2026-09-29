import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FIXTURES = resolve(__dirname, '../../fixtures');

/** Loads a site fixture from /fixtures into the jsdom document. */
export function loadFixture(name: string): void {
  const html = readFileSync(resolve(FIXTURES, name), 'utf8');
  document.documentElement.innerHTML = html.replace(/^<!doctype html>/i, '');
}
