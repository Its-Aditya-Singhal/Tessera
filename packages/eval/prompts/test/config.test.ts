import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, mergeConfig } from '../src/config.ts';

describe('mergeConfig', () => {
  it('replaces model sections wholesale and merges the others', () => {
    const c = mergeConfig(DEFAULT_CONFIG, {
      $comment: 'ignored',
      judge: { provider: 'openai-compatible', model: 'm', baseUrl: 'http://localhost:8080/v1' },
      generation: { maxTokens: 100 },
    });
    expect(c.judge).toEqual({
      provider: 'openai-compatible',
      model: 'm',
      baseUrl: 'http://localhost:8080/v1',
    });
    expect(c.generation).toEqual({ ...DEFAULT_CONFIG.generation, maxTokens: 100 });
    expect(c.target).toEqual(DEFAULT_CONFIG.target);
    expect('$comment' in c).toBe(false);
  });

  it('defaults to local models and the identity optimizer', () => {
    expect(DEFAULT_CONFIG.target.provider).toBe('ollama');
    expect(DEFAULT_CONFIG.judge.provider).toBe('ollama');
    expect(DEFAULT_CONFIG.optimizer).toEqual({ kind: 'identity' });
  });
});

describe('eval.config.example.json', () => {
  it('loads and keeps local defaults', async () => {
    const { loadConfig } = await import('../src/config.ts');
    const { fileURLToPath } = await import('node:url');
    const file = fileURLToPath(new URL('../eval.config.example.json', import.meta.url));
    const { config } = loadConfig(file, '.');
    expect(config.target.provider).toBe('ollama');
    expect(config.optimizer).toEqual({ kind: 'identity' });
    expect('$optimizerOnceM4Lands' in config).toBe(false);
  });
});
