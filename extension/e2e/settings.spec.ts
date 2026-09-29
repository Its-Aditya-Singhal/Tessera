import { expect, test } from './fixtures';

test('settings page shows the engine status and saves changes', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(page.getByRole('heading', { name: 'Tessera settings' })).toBeVisible();
  // No model is ready in CI, so the extension must say it runs on rules only.
  await expect(page.getByText('In use:')).toContainText('Rules only', { timeout: 20_000 });
  await page.getByLabel('Off', { exact: false }).first().check();
  await page.reload();
  await expect(page.locator('input[name="mode"][value="off"]')).toBeChecked();
});

test('welcome page opens on install', async ({ context }) => {
  const welcome =
    context.pages().find((p) => p.url().endsWith('/welcome.html')) ??
    (await context.waitForEvent('page', {
      predicate: (p) => p.url().endsWith('/welcome.html'),
      timeout: 10_000,
    }));
  await expect(welcome.getByRole('heading', { name: 'Welcome to Tessera' })).toBeVisible();
});
