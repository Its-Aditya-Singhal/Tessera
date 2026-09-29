import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'node e2e/server.mjs',
    url: 'http://127.0.0.1:4173/mock-chat/',
    reuseExistingServer: !process.env.CI,
  },
});
