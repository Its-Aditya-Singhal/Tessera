import type { GenReq } from '../engine/types';
import { RedactionSession, type RedactionItem, type RedactionResult } from '../redaction/session';
import type { DetectOptions } from '../redaction/types';
import {
  foldAnswers,
  gatePrompt,
  type GateOptions,
  type GateResult,
  type GateVerdict,
} from './gate';
import { checkInvariants, isBlocking, type InvariantIssue } from './invariants';
import { parseOptimizerOutput } from './parse';
import {
  OPTIMIZER_SCHEMA,
  OPTIMIZER_TEMPLATE_VERSION,
  buildSystemPrompt,
  buildUserPrompt,
  retryNote,
} from './template';

export type Generate = (req: Omit<GenReq, 'signal'>) => Promise<string>;

export interface OptimizeOptions {
  /** A model call. Without it, the optimizer returns the rules verdict and hints only. */
  generate?: Generate;
  englishOutput?: boolean;
  redaction?: DetectOptions;
  gate?: GateOptions;
  /** Answers to clarifying questions from a previous `ask`. */
  answers?: { question: string; answer: string }[];
  /** Skip the gate and always ask the model (used by "Optimize anyway" and Regenerate). */
  force?: boolean;
}

export interface OptimizeOutcome {
  verdict: GateVerdict;
  /** Who decided: the rules gate, or a model. */
  source: 'rules' | 'model';
  gate: GateResult;
  /** Redaction of the user's prompt; the model only ever saw `redaction.text`. */
  redaction: RedactionResult;
  /** The rewrite with placeholders, or undefined when there is no rewrite. */
  optimizedRedacted?: string;
  changes: string[];
  questions: string[];
  /** Protected values the rewrite dropped. */
  issues: InvariantIssue[];
  /** Plain-language notes for the UI (fallbacks, warnings). */
  notes: string[];
  templateVersion: string;
  /** The session holding the placeholder mapping. Memory only; clear() it when done. */
  session: RedactionSession;
}

export async function optimizePrompt(
  prompt: string,
  options: OptimizeOptions = {},
): Promise<OptimizeOutcome> {
  const session = new RedactionSession(options.redaction ?? {});
  const withAnswers = options.answers?.length ? foldAnswers(prompt, options.answers) : prompt;
  const redaction = session.redact(withAnswers);
  const gate = gatePrompt(redaction.text, options.gate);
  const base: OptimizeOutcome = {
    verdict: gate.verdict,
    source: 'rules',
    gate,
    redaction,
    changes: [],
    questions: gate.questions,
    issues: [],
    notes: [],
    templateVersion: OPTIMIZER_TEMPLATE_VERSION,
    session,
  };
  const answered = Boolean(options.answers?.some((a) => a.answer.trim()));
  if (!options.force && !answered && gate.verdict !== 'improve') return base;
  if (!options.generate) {
    return {
      ...base,
      verdict: gate.verdict === 'ask' && !answered ? 'ask' : gate.verdict,
      notes: [
        'No on-device model is set up, so here are rule-based suggestions instead of a rewrite.',
      ],
    };
  }

  const req = {
    system: buildSystemPrompt({ englishOutput: Boolean(options.englishOutput) }),
    prompt: buildUserPrompt(redaction.text, gate),
    jsonSchema: OPTIMIZER_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: Math.min(1500, 200 + Math.ceil(redaction.text.length / 2)),
    temperature: 0.2,
  };
  let parsed = parseOptimizerOutput(await options.generate(req));
  if (!parsed)
    parsed = parseOptimizerOutput(
      await options.generate({ ...req, prompt: req.prompt + retryNote() }),
    );
  if (!parsed) {
    return {
      ...base,
      verdict: 'ok_as_is',
      source: 'model',
      notes: ['The model’s answer could not be read twice in a row, so nothing was changed.'],
    };
  }
  if (parsed.verdict === 'ask' && !answered) {
    return {
      ...base,
      verdict: 'ask',
      source: 'model',
      questions: parsed.questions.length ? parsed.questions : gate.questions,
    };
  }
  const optimized = parsed.optimized.trim();
  if (parsed.verdict === 'ok_as_is' || !optimized || optimized === redaction.text.trim()) {
    return {
      ...base,
      verdict: 'ok_as_is',
      source: 'model',
      notes: ['The model thinks your prompt is already clear.'],
    };
  }
  const issues = checkInvariants(redaction.text, optimized);
  const notes: string[] = [];
  if (issues.some(isBlocking)) {
    return {
      ...base,
      verdict: 'ok_as_is',
      source: 'model',
      issues,
      notes: [
        'The rewrite dropped code, a link or a hidden value, so it was rejected and nothing was changed.',
      ],
    };
  }
  if (issues.length)
    notes.push(
      'Check the highlighted values: the rewrite may have dropped some numbers or quoted text.',
    );
  if (optimized.length > redaction.text.length * 2.5 && redaction.text.length > 200)
    notes.push('The rewrite is much longer than your prompt.');
  return {
    ...base,
    verdict: 'improve',
    source: 'model',
    optimizedRedacted: optimized,
    changes: parsed.changes,
    questions: [],
    issues,
    notes,
  };
}

/**
 * The text to put in the chatbox. Items the user keeps hidden stay as
 * placeholders (they would otherwise reach the chatbot); items they switched
 * off get their real value back.
 */
export function finalText(textWithPlaceholders: string, items: readonly RedactionItem[]): string {
  let out = textWithPlaceholders;
  for (const it of items) {
    if (!it.enabled) out = out.split(it.placeholder).join(it.original);
  }
  return out;
}
