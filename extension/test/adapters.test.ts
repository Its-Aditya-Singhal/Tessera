import { beforeEach, describe, expect, it } from 'vitest';
import { formatDiagnostics, runDiagnostics } from '../src/adapters/diagnostics';
import { adapterFor } from '../src/adapters/registry';
import { loadFixture } from './helpers';

const adapter = (url: string) => {
  const a = adapterFor(new URL(url), { settleMs: 5 });
  if (!a) throw new Error(`no adapter for ${url}`);
  return a;
};

describe('adapterFor', () => {
  it.each([
    ['https://chatgpt.com/c/123', 'chatgpt'],
    ['https://chat.openai.com/', 'chatgpt'],
    ['https://claude.ai/chat/abc', 'claude'],
    ['https://gemini.google.com/app/xyz', 'gemini'],
    ['http://localhost:4173/mock-chat/', 'mock'],
  ])('%s → %s', (url, id) => {
    expect(adapter(url).id).toBe(id);
  });

  it('ignores other sites and other localhost paths', () => {
    expect(adapterFor(new URL('https://example.com/'))).toBeUndefined();
    expect(adapterFor(new URL('http://localhost:3000/app'))).toBeUndefined();
  });

  it('builds new-chat URLs', () => {
    expect(adapter('https://claude.ai/chat/abc').newChatUrl()).toBe('https://claude.ai/new');
    expect(adapter('https://gemini.google.com/app/x').newChatUrl()).toBe(
      'https://gemini.google.com/app',
    );
  });
});

describe('ChatGPT (September 2026 DOM)', () => {
  beforeEach(() => loadFixture('chatgpt.html'));
  const a = () => adapter('https://chatgpt.com/c/1');

  it('finds the ProseMirror composer inside the composer form and reads its lines', () => {
    expect(a().findComposer()?.closest('form[data-chatgpt-composer]')).not.toBeNull();
    expect(a().getComposerText()).toBe('Draft line one\nDraft line two');
  });

  it('captures roles, text, attachments and CodeMirror code verbatim', async () => {
    const messages = await a().getMessages();
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[0]!.text).toBe('Summarise the attached report in 3 bullet points.');
    expect(messages[0]!.attachments).toEqual([{ name: 'report.pdf', type: 'application/pdf' }]);
    const reply = messages[1]!;
    expect(reply.codeBlocks).toEqual([
      { language: 'python', code: 'def growth(a, b):\n    return (b - a) / a' },
    ]);
    expect(reply.text).toContain(
      'Here is a summary:\n\n- Revenue grew 12%.\n- Costs were flat.\n- Hiring paused.',
    );
    expect(reply.text).toContain('```python\ndef growth(a, b):\n    return (b - a) / a\n```');
    expect(reply.text).not.toMatch(/ChatGPT said|Copy/);
  });

  it('diagnostics name the selector that matched', () => {
    const report = runDiagnostics(a(), document, '0.0.0');
    const composer = report.groups.find((g) => g.group === 'composer')!;
    expect(composer.status).toBe('ok');
    expect(composer.winner).toBe(
      'form[data-chatgpt-composer] div.ProseMirror[contenteditable="true"]',
    );
    expect(formatDiagnostics(report)).not.toContain('Summarise'); // no chat text in reports
  });
});

describe('ChatGPT (legacy DOM fallback)', () => {
  beforeEach(() => loadFixture('chatgpt-legacy.html'));

  it('falls back to #prompt-textarea and data-message-author-role', async () => {
    const a = adapter('https://chatgpt.com/');
    expect(a.findComposer()?.id).toBe('prompt-textarea');
    expect(a.getComposerText()).toBe('');
    const messages = await a.getMessages();
    expect(messages.map((m) => [m.role, m.text])).toEqual([
      ['user', 'Hello there'],
      ['assistant', 'Hi! Here\'s code:\n\n```js\nconsole.log("hi");\n```'],
    ]);
    const report = runDiagnostics(a, document, '0.0.0');
    expect(report.groups.find((g) => g.group === 'composer')!.checks[0]!.matches).toBe(0);
  });
});

describe('Claude', () => {
  beforeEach(() => loadFixture('claude.html'));
  const a = () => adapter('https://claude.ai/chat/1');

  it('finds the composer by its label and reads an empty editor as empty', () => {
    expect(a().findComposer()?.getAttribute('aria-label')).toBe('Write your prompt to Claude');
    expect(a().getComposerText()).toBe('');
  });

  it('captures the conversation without action-bar text', async () => {
    const messages = await a().getMessages();
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1]!.text).toBe(
      'Soft rain on the roof,\n\nthe gutter hums an old song,\n\npuddles hold the sky.\n\n```bash\necho "rain" | tr a-z A-Z\n```',
    );
    expect(messages[1]!.codeBlocks).toEqual([
      { language: 'bash', code: 'echo "rain" | tr a-z A-Z' },
    ]);
    expect(messages[1]!.text).not.toContain('Copy');
  });
});

describe('Gemini', () => {
  beforeEach(() => loadFixture('gemini.html'));
  const a = () => adapter('https://gemini.google.com/app/1');

  it('finds the Quill composer', () => {
    expect(a().findComposer()?.classList.contains('ql-editor')).toBe(true);
    expect(a().getComposerText()).toBe('');
  });

  it('uses message-content so the hidden "Gemini said" label is excluded', async () => {
    const messages = await a().getMessages();
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[0]!.text).toBe('What is in this photo?\n\nAnswer briefly.');
    expect(messages[1]!.text).not.toContain('Gemini said');
    expect(messages[1]!.codeBlocks[0]!.code).toBe('SELECT *\nFROM cats\nWHERE sill = true;');
    expect(a().getAttachmentsMeta()).toEqual([{ name: 'photo.png', type: 'image/png' }]);
  });
});
