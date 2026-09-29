import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/settings';

describe('sanitizeSettings', () => {
  it('returns defaults for garbage', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps numbers and rejects unknown enum values', () => {
    const s = sanitizeSettings({
      graceMinutes: 99,
      capsuleTurns: -3,
      tier: 7,
      lifecycleMode: 'always',
      tokenBudgets: { claude: 5 },
    });
    expect(s.graceMinutes).toBe(10);
    expect(s.capsuleTurns).toBe(0);
    expect(s.tier).toBe('auto');
    expect(s.lifecycleMode).toBe('on-demand');
    expect(s.tokenBudgets.claude).toBe(1000);
    expect(s.tokenBudgets.chatgpt).toBe(DEFAULT_SETTINGS.tokenBudgets.chatgpt);
  });

  it('only accepts localhost URLs for the local server', () => {
    expect(sanitizeSettings({ ollama: { url: 'https://evil.example' } }).ollama.url).toBe(
      'http://localhost:11434',
    );
    expect(sanitizeSettings({ ollama: { url: 'http://127.0.0.1:8080/' } }).ollama.url).toBe(
      'http://127.0.0.1:8080',
    );
  });

  it('keeps per-category redaction switches and fills missing ones', () => {
    const s = sanitizeSettings({ redaction: { EMAIL: false } });
    expect(s.redaction.EMAIL).toBe(false);
    expect(s.redaction.PHONE).toBe(true);
  });
});
