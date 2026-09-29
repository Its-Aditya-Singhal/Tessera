import type { SiteConfig } from '../types';

// ChatGPT redesigned its DOM around 2026-09-26: `#prompt-textarea` and
// `data-message-author-role` were removed. New selectors come first; the older
// ones stay as fallbacks for accounts still on the previous UI.
// Sources: github.com/WontakKim/claudex/pull/20, github.com/chetwerikoff/orchestrator-pack/issues/2178
export const chatgptConfig: SiteConfig = {
  id: 'chatgpt',
  label: 'ChatGPT',
  hosts: ['chatgpt.com', 'chat.openai.com'],
  newChatUrl: 'https://chatgpt.com/',
  selectors: {
    composer: [
      'form[data-chatgpt-composer] div.ProseMirror[contenteditable="true"]',
      'form[data-chatgpt-composer] [contenteditable="true"][role="textbox"]',
      '#prompt-textarea[contenteditable="true"]',
      'div.ProseMirror[contenteditable="true"]',
      'textarea#prompt-textarea',
    ],
    sendButton: [
      'form[data-chatgpt-composer] button[type="submit"][aria-label="Send"]',
      'form[data-chatgpt-composer] button[type="submit"]',
      'button[data-testid="send-button"]',
      '#composer-submit-button',
    ],
    userTurn: ['[data-chatgpt-search-unit-key$=":user"]', '[data-message-author-role="user"]'],
    assistantTurn: [
      '[data-chatgpt-search-unit-key$=":assistant"]',
      '[data-message-author-role="assistant"]',
    ],
    attachment: ['[data-testid*="attachment"]', '[data-testid*="file-thumbnail"]', 'img[alt]'],
    scrollContainer: ['main [data-scroll-root]', 'main div[class*="overflow-y-auto"]', 'main'],
    ignoreInMessage: [
      'button',
      '[aria-hidden="true"]',
      '.sr-only',
      '[data-testid$="turn-action-button"]',
    ],
  },
};
