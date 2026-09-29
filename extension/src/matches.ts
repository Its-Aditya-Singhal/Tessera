/**
 * Sites the content script runs on. These double as Tessera's only host access,
 * so keep this list to the supported chatbots. See docs/permissions.md.
 */
export const CHATBOT_MATCHES = [
  'https://chatgpt.com/*',
  'https://chat.openai.com/*',
  'https://claude.ai/*',
  'https://gemini.google.com/*',
];

/** Only the e2e build injects into the local mock chat page. */
export const MOCK_MATCHES = ['http://localhost/*', 'http://127.0.0.1/*'];
