import { chromium, test as base, type BrowserContext, type Worker } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import type { browser } from 'wxt/browser';

const extensionPath = fileURLToPath(new URL('../.output-e2e/chrome-mv3-e2e', import.meta.url));

/** The extension API inside `serviceWorker.evaluate` callbacks. */
declare global {
  const chrome: typeof browser;
}

export const MOCK_URL = 'http://127.0.0.1:4173/mock-chat/';

/** Launches Chromium with the e2e build of the extension loaded. Build it first: `pnpm build:e2e`. */
export const test = base.extend<{
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: !process.env.HEADED,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan',
        '--use-angle=swiftshader',
        '--use-webgpu-adapter=swiftshader',
      ],
    });
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(sw);
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

export const expect = test.expect;
