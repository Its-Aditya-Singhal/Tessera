import type { SiteConfig } from '../types';

// claude.ai serves a plain `textarea#static-composer-input` before hydration and
// swaps in a ProseMirror editor afterwards. Writing into the static textarea is
// lost on hydration, so it is deliberately not a composer fallback.
export const claudeConfig: SiteConfig = {
  id: 'claude',
  label: 'Claude',
  hosts: ['claude.ai'],
  newChatUrl: 'https://claude.ai/new',
  selectors: {
    composer: [
      '[data-testid="chat-input"] div.ProseMirror[contenteditable="true"]',
      'div.ProseMirror[contenteditable="true"][aria-label="Write your prompt to Claude"]',
      'fieldset div.ProseMirror[contenteditable="true"]',
      'div.ProseMirror[contenteditable="true"]',
    ],
    sendButton: [
      'button[aria-label="Send message"]',
      'button[aria-label="Send Message"]',
      'fieldset button[type="submit"]',
    ],
    userTurn: ['[data-testid="user-message"]'],
    assistantTurn: ['.font-claude-response', '.font-claude-message', '[data-is-streaming] .grid'],
    attachment: ['[data-testid="file-thumbnail"]', '[data-testid*="attachment"]', 'img[alt]'],
    scrollContainer: ['div[class*="overflow-y-scroll"]', 'div[class*="overflow-y-auto"]', 'main'],
    ignoreInMessage: ['button', '[aria-hidden="true"]', '.sr-only'],
  },
};
