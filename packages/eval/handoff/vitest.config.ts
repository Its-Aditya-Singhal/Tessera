import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'eval-handoff',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
