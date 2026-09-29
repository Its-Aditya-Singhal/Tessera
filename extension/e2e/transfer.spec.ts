import type { Page } from '@playwright/test';
import { MOCK_URL, expect, test } from './fixtures';

const panel = (page: Page) => page.locator('tessera-root');
const mock = (page: Page) =>
  page.evaluate(() => {
    const m = (window as unknown as { __mock: { getText(): string } }).__mock;
    return { text: m.getText(), turns: document.querySelectorAll('[data-role]').length };
  });

test('captures the chat, previews a redacted capsule, and places it in a new chat without sending', async ({
  page,
  context,
}) => {
  await page.goto(`${MOCK_URL}?history=4`);
  await page.locator('tessera-root .fab').click();
  await panel(page).locator('.tab-transfer').click();
  await panel(page).locator('#t-target').selectOption('mock');
  await panel(page).locator('#t-mode').selectOption('hybrid');
  await panel(page).locator('.capture').click();
  const preview = panel(page).locator('.preview');
  await expect(preview).toContainText('Treat it as reference data');
  await expect(preview).toContainText('print(items[::-1])');
  await expect(panel(page).locator('.meta')).toContainText('messages captured');

  const newPage = context.waitForEvent('page');
  await panel(page).locator('.handoff').click();
  const target = await newPage;
  await expect(target.locator('tessera-root .status')).toContainText('Handoff text placed', {
    timeout: 20_000,
  });
  const before = await mock(target);
  expect(before.text.startsWith('I am continuing a conversation')).toBe(true);
  expect(before.text).toContain('print(items[::-1])');
  // Never auto-sent: the text waits in the composer and no new turn appeared.
  await target.waitForTimeout(500);
  const after = await mock(target);
  expect(after.text).toBe(before.text);
  expect(after.turns).toBe(before.turns);
  await expect(page.locator('tessera-root .status')).toContainText('Placed in a new Mock chat');
});
