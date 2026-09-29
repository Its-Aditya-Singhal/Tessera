// Runs every (conversation, condition, question) triple through the target model and scores it.

import {
  buildContext,
  ConditionUnavailable,
  type BuiltContext,
  type ConditionDeps,
} from './conditions.ts';
import { HANDOFF_PREAMBLE } from './render.ts';
import { contextCarries, normalize, scoreAnswer } from './scoring.ts';
import { bootstrapProportion, mean, type Proportion } from './stats.ts';
import { approxTokens } from './tokens.ts';
import type {
  ChatMessage,
  ChatModel,
  ConditionId,
  Conversation,
  Position,
  Question,
  QuestionKind,
} from './types.ts';

export const ANSWER_INSTRUCTIONS =
  "Answer the user's question briefly. If you do not know the answer, say so instead of guessing. " +
  'When asked for code or a file, reproduce it exactly in a fenced code block.';

export function answerMessages(context: string | null, question: string): ChatMessage[] {
  if (context === null) {
    return [
      { role: 'system', content: ANSWER_INSTRUCTIONS },
      { role: 'user', content: `Question: ${question}` },
    ];
  }
  return [
    { role: 'system', content: `${HANDOFF_PREAMBLE}\n\n${ANSWER_INSTRUCTIONS}` },
    {
      role: 'user',
      content: `<handoff_context>\n${context}\n</handoff_context>\n\nQuestion: ${question}`,
    },
  ];
}

export function judgeMessages(q: Question, answer: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You grade answers. Reply with exactly YES if the candidate answer states the expected answer ' +
        '(paraphrase is fine), otherwise NO. If the candidate gives several conflicting answers, reply NO.',
    },
    {
      role: 'user',
      content: `Question: ${q.question}\nExpected answer: ${q.accept[0] ?? ''}\nCandidate answer:\n${answer}`,
    },
  ];
}

export interface QuestionRecord {
  conversationId: string;
  questionId: string;
  condition: ConditionId;
  kind: QuestionKind;
  position: Position;
  answer: string;
  correct: boolean;
  stale?: boolean;
  codeExact?: boolean;
  codeLoose?: boolean;
  /** Set only when a judge model is configured and the strict check failed on a fact or decision. */
  judgedCorrect?: boolean;
  contextCarries: boolean;
  promptTokensApprox: number;
  promptTokensReported?: number;
  completionTokensReported?: number;
}

export interface ContextRecord {
  conversationId: string;
  condition: ConditionId;
  contextTokens: number;
  generationTokens: number;
  transcriptTokens: number;
}

export interface ConditionSummary {
  condition: ConditionId;
  status: 'ran' | 'not-run';
  reason?: string;
  conversations: number;
  factRetention?: Proportion;
  decisionRetention?: Proportion;
  staleDecisions?: Proportion;
  codeExact?: Proportion;
  codeLoose?: Proportion;
  /** fact + decision retention counting judge rescues; present only with a judge. */
  judgedRetention?: Proportion;
  byPosition?: Record<Position, Proportion>;
  /** Model-free: share of questions whose answer survives in the context itself. */
  contextCoverage?: Proportion;
  meanContextTokens?: number | null;
  meanGenerationTokens?: number | null;
  /** Context tokens as a share of the full transcript. */
  meanCompression?: number | null;
  meanPromptTokensReported?: number | null;
}

export interface RunOptions {
  conversations: readonly Conversation[];
  conditions: readonly ConditionId[];
  target: ChatModel;
  judge?: ChatModel;
  deps: ConditionDeps;
  bootstrap: { iterations: number; seed: number };
  onProgress?: (msg: string) => void;
}

export interface RunOutput {
  summaries: ConditionSummary[];
  questions: QuestionRecord[];
  contexts: ContextRecord[];
}

export async function runHandoffEval(opts: RunOptions): Promise<RunOutput> {
  const questions: QuestionRecord[] = [];
  const contexts: ContextRecord[] = [];
  const unavailable = new Map<ConditionId, string>();
  const log = opts.onProgress ?? (() => {});

  for (const [ci, conv] of opts.conversations.entries()) {
    const transcriptTokens = approxTokens(conv.messages.map((m) => m.text).join('\n'));
    for (const condition of opts.conditions) {
      if (unavailable.has(condition)) continue;
      let built: BuiltContext;
      try {
        built = await buildContext(condition, conv.messages, opts.deps);
      } catch (err) {
        if (err instanceof ConditionUnavailable) {
          unavailable.set(condition, err.message);
          log(`condition ${condition} not run: ${err.message}`);
          continue;
        }
        throw err;
      }
      contexts.push({
        conversationId: conv.id,
        condition,
        contextTokens: built.contextTokens,
        generationTokens: built.generationTokens,
        transcriptTokens,
      });

      for (const q of conv.questions) {
        const messages = answerMessages(built.text, q.question);
        const res = await opts.target.chat(messages);
        const score = scoreAnswer(res.text, q);
        const record: QuestionRecord = {
          conversationId: conv.id,
          questionId: q.id,
          condition,
          kind: q.kind,
          position: q.position,
          answer: res.text,
          ...score,
          contextCarries: built.text !== null && contextCarries(built.text, q),
          promptTokensApprox: approxTokens(messages.map((m) => m.content).join('\n')),
          ...(res.promptTokens !== undefined ? { promptTokensReported: res.promptTokens } : {}),
          ...(res.completionTokens !== undefined
            ? { completionTokensReported: res.completionTokens }
            : {}),
        };
        if (opts.judge && q.kind !== 'code') {
          record.judgedCorrect =
            score.correct ||
            normalize((await opts.judge.chat(judgeMessages(q, res.text))).text).startsWith('yes');
        }
        questions.push(record);
      }
    }
    log(`[${ci + 1}/${opts.conversations.length}] ${conv.id}`);
  }

  const summaries = opts.conditions.map((c) =>
    unavailable.has(c)
      ? {
          condition: c,
          status: 'not-run' as const,
          reason: unavailable.get(c) ?? '',
          conversations: 0,
        }
      : summarize(c, questions, contexts, opts.bootstrap, opts.judge !== undefined),
  );
  return { summaries, questions, contexts };
}

function proportion(
  records: readonly QuestionRecord[],
  hit: (r: QuestionRecord) => boolean,
  boot: { iterations: number; seed: number },
): Proportion {
  const byConv = new Map<string, [number, number]>();
  for (const r of records) {
    const g = byConv.get(r.conversationId) ?? [0, 0];
    g[0] += hit(r) ? 1 : 0;
    g[1] += 1;
    byConv.set(r.conversationId, g);
  }
  return bootstrapProportion([...byConv.values()], boot.iterations, boot.seed);
}

export function summarize(
  condition: ConditionId,
  all: readonly QuestionRecord[],
  allContexts: readonly ContextRecord[],
  boot: { iterations: number; seed: number },
  judged: boolean,
): ConditionSummary {
  const rs = all.filter((r) => r.condition === condition);
  const cs = allContexts.filter((c) => c.condition === condition);
  const facts = rs.filter((r) => r.kind === 'fact');
  const decisions = rs.filter((r) => r.kind === 'decision');
  const code = rs.filter((r) => r.kind === 'code');
  const recall = rs.filter((r) => r.kind !== 'code');
  const positions: Position[] = ['early', 'middle', 'late'];
  const reported = rs.flatMap((r) =>
    r.promptTokensReported !== undefined ? [r.promptTokensReported] : [],
  );
  return {
    condition,
    status: 'ran',
    conversations: cs.length,
    factRetention: proportion(facts, (r) => r.correct, boot),
    decisionRetention: proportion(decisions, (r) => r.correct, boot),
    staleDecisions: proportion(
      decisions.filter((r) => r.stale !== undefined),
      (r) => r.stale === true,
      boot,
    ),
    codeExact: proportion(code, (r) => r.codeExact === true, boot),
    codeLoose: proportion(code, (r) => r.codeLoose === true, boot),
    ...(judged
      ? { judgedRetention: proportion(recall, (r) => r.judgedCorrect === true, boot) }
      : {}),
    byPosition: Object.fromEntries(
      positions.map((p) => [
        p,
        proportion(
          rs.filter((r) => r.position === p),
          (r) => r.correct,
          boot,
        ),
      ]),
    ) as Record<Position, Proportion>,
    contextCoverage: proportion(rs, (r) => r.contextCarries, boot),
    meanContextTokens: mean(cs.map((c) => c.contextTokens)),
    meanGenerationTokens: mean(cs.map((c) => c.generationTokens)),
    meanCompression: mean(cs.map((c) => c.contextTokens / c.transcriptTokens)),
    meanPromptTokensReported: mean(reported),
  };
}
