import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'eval',
    environment: 'node',
    include: ['handoff/test/**/*.test.ts'],
  },
});
