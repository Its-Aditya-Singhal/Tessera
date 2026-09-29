import type { Page } from '@playwright/test';
import { MOCK_URL, expect, test } from './fixtures';

const panel = (page: Page) => page.locator('tessera-root');
const mockText = (page: Page) =>
  page.evaluate(() => (window as unknown as { __mock: { getText(): string } }).__mock.getText());

async function openWith(page: Page, prompt: string) {
  await page.goto(MOCK_URL);
  await page.locator('tessera-root .fab').click();
  await expect(panel(page).locator('.panel')).toBeVisible();
  await panel(page).locator('#t-text').fill(prompt);
}

// CI has no on-device model, so these exercise the rules-only tier end to end.
test('rules-only optimize shows hints and imports the scrubbed original', async ({ page }) => {
  await openWith(page, 'write something about my project, email me at priya.sharma@example.com');
  await expect(panel(page).locator('.chip')).toHaveText('Could be clearer');
  await panel(page).locator('.optimize').click();
  await expect(panel(page).locator('.verdict')).toContainText('could be clearer');
  await expect(panel(page).locator('.notes')).toContainText('No on-device model');
  await expect(panel(page).locator('.privacy')).toContainText('[EMAIL_1]');
  await panel(page).locator('.scrubbed').click();
  await expect(panel(page).locator('.status')).toHaveClass(/ok/);
  const text = await mockText(page);
  expect(text).toContain('[EMAIL_1]');
  expect(text).not.toContain('priya.sharma');
});

test('asks a question for a prompt with nothing to point at', async ({ page }) => {
  await openWith(page, 'fix it');
  await panel(page).locator('.optimize').click();
  await expect(panel(page).locator('.verdict.ask')).toBeVisible();
  await panel(page).locator('input.q').first().fill('the failing login test in auth.spec.ts');
  await panel(page).locator('.answer').click();
  await expect(panel(page).locator('#t-text')).toHaveValue(/failing login test/);
});

test('warns about a pasted secret and scrubs it on request', async ({ page }) => {
  await page.goto(MOCK_URL);
  const key = 'sk-proj-' + 'Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb7cDe0fGh3i';
  await page.locator('#composer .editor').click();
  await page.keyboard.type(`use this key ${key}`);
  await page.evaluate((k) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', k);
    document
      .querySelector('#composer .editor')!
      .dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
  }, key);
  const toast = panel(page).locator('.toast');
  await expect(toast).toContainText('looks like it contains a secret');
  await toast.locator('.scrub').click();
  await expect(toast).toContainText('Replaced 1 value');
  const text = await mockText(page);
  expect(text).not.toContain(key);
  expect(text).toMatch(/use this key \[API_KEY_1\]/);
});

test('flags an underspecified prompt in the chatbox with a dot on the button', async ({ page }) => {
  await page.goto(MOCK_URL);
  await page.locator('#composer .editor').click();
  await page.keyboard.type('make stuff better somehow');
  await expect(page.locator('tessera-root .fab')).toHaveClass(/hint/, { timeout: 5_000 });
});
