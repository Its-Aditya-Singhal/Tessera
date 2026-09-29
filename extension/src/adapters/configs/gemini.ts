import type { SiteConfig } from '../types';

// Gemini renders with Angular custom elements. `<message-content>` holds the answer
// without the visually hidden "Gemini said" label that `<model-response>` includes.
// Source: github.com/Kohzadi2023/virtual-company-roundtable/pull/28 (2026-09-22)
export const geminiConfig: SiteConfig = {
  id: 'gemini',
  label: 'Gemini',
  hosts: ['gemini.google.com'],
  newChatUrl: 'https://gemini.google.com/app',
  selectors: {
    composer: [
      'rich-textarea .ql-editor[contenteditable="true"]',
      'div.ql-editor[contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]',
    ],
    sendButton: ['button.send-button', 'button[aria-label="Send message"]'],
    // The whole <user-query> (not just .query-text) so attachment previews are found too.
    userTurn: ['user-query', '.query-text'],
    assistantTurn: ['model-response message-content', 'message-content', 'model-response'],
    attachment: ['user-query-file-preview', '[data-test-id*="file"]', 'img[alt]'],
    scrollContainer: ['infinite-scroller', '#chat-history', 'main'],
    ignoreInMessage: ['button', '[aria-hidden="true"]', '.cdk-visually-hidden', 'mat-icon'],
  },
};
