import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __TESSERA_E2E__: 'false' },
  test: {
    name: 'extension',
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  },
});
