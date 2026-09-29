import type { Page } from '@playwright/test';
import { MOCK_URL, expect, test } from './fixtures';

const panel = (page: Page) => page.locator('tessera-root');

async function openPanel(page: Page) {
  await page.locator('tessera-root .fab').click();
  await expect(panel(page).locator('.panel')).toBeVisible();
}

async function importText(page: Page, value: string) {
  await panel(page).locator('#t-text').fill(value);
  await panel(page).locator('.import').click();
  await expect(panel(page).locator('.status')).not.toHaveText(/Import…/, { timeout: 10_000 });
}

const mockText = (page: Page) =>
  page.evaluate(() => (window as unknown as { __mock: { getText(): string } }).__mock.getText());
const sendEnabled = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __mock: { isSendEnabled(): boolean } }).__mock.isSendEnabled(),
  );

const SAMPLE = 'Explain this code:\n```js\nconst x = "a  b";\n```\nதமிழில் பதில் சொல்லுங்கள் 👍';

test('mounts the button in a shadow root next to the composer', async ({ page }) => {
  await page.goto(MOCK_URL);
  await expect(page.locator('tessera-root .fab')).toBeVisible();
  // Page CSS must not leak in: the host has no light-DOM children.
  expect(await page.locator('tessera-root').evaluate((el) => el.children.length)).toBe(0);
});

test('imports into a ProseMirror-style editor via execCommand, and it survives re-render', async ({
  page,
}) => {
  await page.goto(MOCK_URL);
  await openPanel(page);
  await importText(page, SAMPLE);
  await expect(panel(page).locator('.status')).toHaveClass(/ok/);
  await page.waitForTimeout(400); // several re-render ticks of the mock editor
  expect(await mockText(page)).toBe(SAMPLE);
  expect(await sendEnabled(page)).toBe(true);
  await expect(panel(page).locator('.diag')).toContainText('accepted via exec-command');
});

test('undo restores the previous chatbox text', async ({ page }) => {
  await page.goto(MOCK_URL);
  await page.locator('#composer .editor').click();
  await page.keyboard.type('original prompt');
  expect(await mockText(page)).toBe('original prompt');
  await openPanel(page);
  await importText(page, 'replacement prompt');
  expect(await mockText(page)).toBe('replacement prompt');
  await panel(page).locator('.undo').click();
  await expect(panel(page).locator('.status')).toContainText('Undo done');
  expect(await mockText(page)).toBe('original prompt');
});

test('uses the native value setter for a controlled textarea', async ({ page }) => {
  await page.goto(`${MOCK_URL}?editor=textarea`);
  await openPanel(page);
  await importText(page, SAMPLE);
  await expect(panel(page).locator('.status')).toHaveClass(/ok/);
  expect(await mockText(page)).toBe(SAMPLE);
  await expect(panel(page).locator('.diag')).toContainText('accepted via textarea-setter');
});

test('falls back to a synthetic paste when the editor ignores typed input', async ({ page }) => {
  await page.goto(`${MOCK_URL}?editor=paste-only`);
  await openPanel(page);
  await importText(page, SAMPLE);
  await expect(panel(page).locator('.status')).toHaveClass(/ok/);
  expect(await mockText(page)).toBe(SAMPLE);
  await expect(panel(page).locator('.diag')).toContainText('accepted via paste');
});

test('reports a rejection instead of claiming success', async ({ page }) => {
  await page.goto(`${MOCK_URL}?editor=broken`);
  await openPanel(page);
  await importText(page, 'will not stick');
  await expect(panel(page).locator('.status')).toHaveClass(/bad/);
  expect(await mockText(page)).toBe('');
  await expect(panel(page).locator('.diag')).toContainText('Last import: rejected');
});

test('Escape closes the panel and the shortcut is registered', async ({ page, serviceWorker }) => {
  await page.goto(MOCK_URL);
  await openPanel(page);
  await panel(page).locator('#t-text').press('Escape');
  await expect(panel(page).locator('.panel')).toBeHidden();
  const commands = await serviceWorker.evaluate(() => chrome.commands.getAll());
  expect(commands.find((c) => c.name === 'toggle-panel')?.shortcut).toMatch(/Alt\+Shift\+O/);
});

test('the service worker toggles the panel in the active tab', async ({ page, serviceWorker }) => {
  await page.goto(MOCK_URL);
  await expect(page.locator('tessera-root .fab')).toBeVisible();
  await serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true });
    await chrome.tabs.sendMessage(tab!.id!, { type: 'tessera/toggle-panel' });
  });
  await expect(panel(page).locator('.panel')).toBeVisible();
});

test('captures messages with roles, verbatim code and lazy-loaded history', async ({ page }) => {
  await page.goto(`${MOCK_URL}?history=12`);
  await expect(page.locator('tessera-root .fab')).toBeVisible();
  const result = await page.evaluate(
    () =>
      new Promise<{
        messages: {
          role: string;
          text: string;
          codeBlocks: { language: string; code: string }[];
          attachments: { name: string }[];
        }[];
        complete: boolean;
      }>((resolve) => {
        window.addEventListener('message', (ev) => {
          if (ev.data?.source === 'tessera-e2e-result') resolve(ev.data.result);
        });
        window.postMessage({ source: 'tessera-e2e', cmd: 'capture' }, '*');
      }),
  );
  expect(result.complete).toBe(true);
  expect(result.messages).toHaveLength(14);
  expect(result.messages[0]!.text).toBe('Older message 1');
  const answer = result.messages.at(-1)!;
  expect(answer.role).toBe('assistant');
  expect(answer.codeBlocks).toEqual([
    { language: 'python', code: 'items = [1, 2, 3]\nprint(items[::-1])  # [3, 2, 1]\n' },
  ]);
  expect(answer.text).not.toContain('Copy');
  expect(result.messages.at(-2)!.attachments).toEqual([{ name: 'data.csv', type: 'text/csv' }]);
});

test('says when older history could not all be loaded', async ({ page }) => {
  await page.goto(`${MOCK_URL}?history=40`);
  await expect(page.locator('tessera-root .fab')).toBeVisible();
  const result = await page.evaluate(
    () =>
      new Promise<{ complete: boolean; note: string }>((resolve) => {
        window.addEventListener('message', (ev) => {
          if (ev.data?.source === 'tessera-e2e-result') resolve(ev.data.result);
        });
        window.postMessage({ source: 'tessera-e2e', cmd: 'capture', maxScrolls: 2 }, '*');
      }),
  );
  expect(result.complete).toBe(false);
  expect(result.note).toMatch(/Older messages may not have loaded/);
});
