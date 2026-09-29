import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'eval-prompts',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
