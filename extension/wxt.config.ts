import { defineConfig } from 'wxt';
import { MOCK_MATCHES } from './src/matches';

/** Only the e2e build (TESSERA_E2E=1) injects into the local mock chat page. */
const E2E = process.env.TESSERA_E2E === '1';

export default defineConfig({
  imports: false,
  outDir: E2E ? '.output-e2e' : '.output',
  zip: { artifactTemplate: 'tessera-{{version}}-{{browser}}.zip' },
  vite: () => ({
    define: {
      __TESSERA_E2E__: JSON.stringify(E2E),
    },
    worker: { format: 'es' },
  }),
  manifest: {
    name: 'Tessera',
    description:
      'A local-first layer for AI chatbots: sharper prompts, scrubbed secrets, and context you can carry between chats.',
    permissions: ['offscreen'],
    // Tier 3 (a local model server such as Ollama) is requested at runtime, never at install.
    optional_host_permissions: ['http://localhost/*', 'http://127.0.0.1/*'],
    action: { default_title: 'Tessera' },
    commands: {
      'toggle-panel': {
        suggested_key: { default: 'Alt+Shift+O' },
        description: 'Open or close the Tessera panel',
      },
    },
    content_security_policy: {
      // WebLLM compiles WebAssembly; nothing else is relaxed.
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      if (!E2E) return;
      manifest.name = 'Tessera (e2e build)';
      for (const cs of manifest.content_scripts ?? []) {
        cs.matches = [...(cs.matches ?? []), ...MOCK_MATCHES];
      }
    },
  },
});
