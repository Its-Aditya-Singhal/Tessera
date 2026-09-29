// Shared types for the handoff-fidelity benchmark.

export type Role = 'user' | 'assistant';

// Message and CodeBlock mirror the shapes in @tessera/core (packages/core/src/types.ts), which the
// site adapters' getMessages() returns and the M7 capsule builder will consume. They are repeated
// here so the harness runs directly under Node without a build step.

export interface CodeBlock {
  language: string;
  code: string;
}

export interface Message {
  role: Role;
  text: string;
  codeBlocks: CodeBlock[];
  attachments: { name: string; type: string }[];
}

export type Position = 'early' | 'middle' | 'late';

export type QuestionKind = 'fact' | 'decision' | 'code';

export interface Question {
  id: string;
  kind: QuestionKind;
  question: string;
  /** Any of these (after normalisation) counts as a correct answer. Unused for code questions. */
  accept: string[];
  /** For superseded decisions: the earlier choice. Mentioning only this counts as stale. */
  stale?: string;
  /** For code questions: the exact block the answer must reproduce. */
  code?: CodeBlock;
  /** Index into Conversation.messages of the message that planted the answer (the final one, if revised). */
  plantedAt: number;
  position: Position;
}

export interface Conversation {
  id: string;
  domain: string;
  title: string;
  messages: Message[];
  questions: Question[];
}

export interface Dataset {
  version: number;
  seed: number;
  generator: string;
  conversations: Conversation[];
}

export type ConditionId = 'full' | 'hybrid' | 'summary' | 'none';

export const ALL_CONDITIONS: readonly ConditionId[] = ['full', 'hybrid', 'summary', 'none'];

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  text: string;
  /** Token counts reported by the model server, if it reports them. */
  promptTokens?: number;
  completionTokens?: number;
}

export interface ChatModel {
  readonly id: string;
  readonly fake: boolean;
  chat(messages: ChatMessage[]): Promise<ChatResult>;
}
