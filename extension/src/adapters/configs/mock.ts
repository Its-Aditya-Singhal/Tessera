import type { SiteConfig } from '../types';

/** The local mock chat page used by e2e tests (e2e/mock-site). Mirrors a ProseMirror-style site. */
export const mockConfig: SiteConfig = {
  id: 'mock',
  label: 'Mock chat',
  hosts: ['localhost', '127.0.0.1'],
  pathPrefix: '/mock-chat',
  newChatUrl: '/mock-chat/',
  selectors: {
    composer: ['#composer [contenteditable="true"]', '#composer textarea'],
    sendButton: ['#composer button[type="submit"]'],
    userTurn: ['[data-role="user"]'],
    assistantTurn: ['[data-role="assistant"]'],
    attachment: ['.attachment'],
    scrollContainer: ['#thread'],
    ignoreInMessage: ['button', '.sr-only'],
  },
};
