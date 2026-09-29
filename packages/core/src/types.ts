/** Chatbot sites Tessera has adapters for. `mock` is the local test page. */
export type SiteId = 'chatgpt' | 'claude' | 'gemini' | 'mock';

export type Role = 'user' | 'assistant';

export interface CodeBlock {
  /** Language hint from the page (e.g. `ts`), or empty when the page gives none. */
  language: string;
  /** The code exactly as the page shows it. Never reformatted. */
  code: string;
}

export interface AttachmentMeta {
  name: string;
  /** MIME type or a coarse kind such as `image` or `file` when the page does not expose one. */
  type: string;
}

export interface Message {
  role: Role;
  /** Plain text with code blocks rendered as Markdown fences. */
  text: string;
  codeBlocks: CodeBlock[];
  attachments: AttachmentMeta[];
}
