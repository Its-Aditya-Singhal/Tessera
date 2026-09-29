import type { AttachmentMeta, Message, Role, SiteId } from '@tessera/core';

export type { AttachmentMeta, Message, Role, SiteId };

export interface SiteAdapter {
  id: SiteId;
  matches(url: URL): boolean;
  findComposer(): HTMLElement | null;
  getComposerText(): string;
  /** Resolves true only if the site accepted the text (read back, send enabled, survives a re-render). */
  setComposerText(text: string): Promise<boolean>;
  onComposerChange(cb: (text: string) => void): () => void;
  getMessages(): Promise<Message[]>;
  /** Names and types of files attached in the conversation. Never the content. */
  getAttachmentsMeta(): AttachmentMeta[];
  newChatUrl(): string;
}

/**
 * Everything site-specific lives in one of these. When a site changes its DOM,
 * the fix should be an edit to that site's config file and its fixture.
 *
 * Every selector field is an ordered fallback list: the first selector that
 * matches wins, and diagnostics report which ones failed.
 */
export interface SiteConfig {
  id: SiteId;
  label: string;
  /** Hostnames this config handles (exact match). */
  hosts: string[];
  /** Optional path check, e.g. the mock page lives under /mock-chat. */
  pathPrefix?: string;
  newChatUrl: string;
  selectors: {
    composer: string[];
    sendButton: string[];
    userTurn: string[];
    assistantTurn: string[];
    /** Inside a turn: attachment chips/thumbnails. */
    attachment: string[];
    /** Scrollable element holding the conversation, for lazy-loading older turns. */
    scrollContainer: string[];
    /** Inside a turn: elements that are UI chrome, not message content (copy buttons, labels). */
    ignoreInMessage: string[];
  };
}

export type SelectorGroup = keyof SiteConfig['selectors'];
