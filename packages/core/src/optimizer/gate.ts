/**
 * The prompt-quality gate (Tier 0, rules only). Decides whether a prompt is
 * already fine, worth improving, or too ambiguous to improve without asking.
 * Cheap enough to run on every keystroke; no model involved.
 */

export type GateVerdict = 'ok_as_is' | 'improve' | 'ask';

export interface GateSignals {
  words: number;
  hasTask: boolean;
  hasContext: boolean;
  hasConstraints: boolean;
  hasFormat: boolean;
  hasCode: boolean;
  /** A short instruction followed or preceded by pasted text (an article, a chat log). */
  hasMaterial: boolean;
  /** Pronouns or references with nothing to point at ("fix it", "make this better"). */
  danglingReference: boolean;
  /** Words like "something", "stuff", "etc", "somehow". */
  vagueWords: number;
  script: 'latin' | 'devanagari' | 'tamil' | 'mixed';
}

export interface GateResult {
  verdict: GateVerdict;
  /** 0..1, higher means better specified. */
  score: number;
  signals: GateSignals;
  /** Short, actionable suggestions (shown as live hints). */
  hints: string[];
  /** 1-2 clarifying questions when the verdict is `ask`. */
  questions: string[];
}

const TASK_WORDS =
  /\b(write|return|respond|reply|answer|output|explain|summari[sz]e|translate|fix|debug|refactor|create|make|build|generate|list|compare|analy[sz]e|review|rewrite|draft|describe|calculate|compute|find|design|convert|implement|optimi[sz]e|suggest|plan|outline|help|teach|solve|prove|classify|extract|edit|improve|give|tell|show|recommend|what|why|how|when|where|which|who|can you|could you|please)\b/i;
const TASK_WORDS_INDIC =
  /(बताओ|बताइए|लिखो|लिखिए|समझाओ|समझाइए|बनाओ|क्या|कैसे|क्यों|अनुवाद|सारांश|எழுது|எழுதுங்கள்|சொல்|விளக்க|என்ன|எப்படி|ஏன்|மொழிபெயர்|சுருக்க|\b(batao|bataiye|likho|likhiye|samjhao|samjhaiye|banao|kaise|kya|kyun|kyon|karo|kijiye)\b)/i;
const FORMAT_WORDS =
  /\b(bullet|bullets|list|table|json|yaml|csv|markdown|paragraphs?|sentences?|words?|lines?|steps?|format|headings?|code block|numbered|outline|tweet|email(?! me\b| us\b| address)|essay|haiku|poem|slides?|under \d+|at most \d+|no more than|in \d+|one-liner|short|brief|concise|detailed|show (the|your) (work|formula|steps|reasoning))\b|\banswer:|(पंक्तियों|बिंदु|வரிகள்|புள்ளி)/i;
const CONSTRAINT_WORDS =
  /\b(must|should|without|avoid|don't|do not|only|exactly|at least|at most|limit|keep|include|exclude|use|using|in (python|javascript|typescript|js|ts|java|go|rust|c\+\+|sql|bash)|for (a|an) (beginner|expert|child|kid|student|manager|developer|non-technical)|audience|tone|formal|casual|beginner|expert|deadline|budget|to the nearest|no (prose|code|markdown|explanation|preamble|intro|jargon|emojis?))\b/i;
const CONTEXT_WORDS =
  /\b(i am|i'm|we are|we're|my|our|context|background|currently|because|so that|given|here is|here's|below|following|attached|this is for|i have|i need|i want|we need|working on|project|team|company|students?|customers?|users?)\b|(मेरा|मेरी|हम|मैं|என்|நான்|எங்கள்|mera|meri|main|hum)/i;
const VAGUE_WORDS =
  /\b(something|stuff|things?|etc|somehow|whatever|some kind of|kinda|sorta|better|good|nice|properly|correctly|asap)\b/gi;
const DANGLING =
  /^\s*(fix|improve|make|rewrite|check|explain|do|update|change|redo|finish|continue)\s+(it|this|that|these|those|them)\b|\b(fix|improve|explain|check) (it|this|that)\s*[.!?]?\s*$/i;

export function scriptOf(text: string): GateSignals['script'] {
  const dev = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  const tam = (text.match(/[஀-௿]/g) ?? []).length;
  const lat = (text.match(/[A-Za-z]/g) ?? []).length;
  const total = dev + tam + lat || 1;
  if (dev / total > 0.6) return 'devanagari';
  if (tam / total > 0.6) return 'tamil';
  if (lat / total > 0.9) return 'latin';
  return 'mixed';
}

export function signalsOf(text: string): GateSignals {
  const hasCode =
    /```|^( {4}|\t)\S/m.test(text) ||
    /[;{}]\s*$/m.test(text) ||
    /\bdef \w+\(|function \w+\(|=>/.test(text);
  // Code and pasted material say a lot about context but little about the ask; judge the instruction.
  const prose = text.replace(/```[\s\S]*?```/g, ' ').replace(/^( {4}|\t).*$/gm, ' ');
  const { instruction, hasMaterial } = splitMaterial(prose);
  const words = countWords(instruction);
  return {
    words,
    hasTask:
      TASK_WORDS.test(instruction) ||
      TASK_WORDS_INDIC.test(instruction) ||
      /\?\s*$/m.test(instruction),
    hasContext: CONTEXT_WORDS.test(instruction) || hasCode || hasMaterial || words >= 45,
    hasConstraints: CONSTRAINT_WORDS.test(instruction),
    hasFormat: FORMAT_WORDS.test(instruction),
    hasCode,
    hasMaterial,
    danglingReference: DANGLING.test(instruction) && !hasCode && !hasMaterial && words < 12,
    vagueWords: (instruction.match(VAGUE_WORDS) ?? []).length,
    script: scriptOf(instruction),
  };
}

const countWords = (t: string) => (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

/**
 * Separates a short instruction from pasted material ("summarize\n\n<article>"),
 * so a long paste does not make a two-word ask look well specified.
 */
export function splitMaterial(prose: string): { instruction: string; hasMaterial: boolean } {
  const paras = prose.split(/\n\s*\n/).filter((p) => p.trim());
  if (paras.length >= 2) {
    for (const [head, rest] of [
      [paras[0]!, paras.slice(1).join('\n\n')],
      [paras.at(-1)!, paras.slice(0, -1).join('\n\n')],
    ] as const) {
      const hw = countWords(head);
      if (hw <= 25 && countWords(rest) >= Math.max(20, hw * 2))
        return { instruction: head, hasMaterial: true };
    }
  }
  return { instruction: prose, hasMaterial: false };
}

export interface GateOptions {
  /** Score at or above which a prompt is left alone. Tuned in M6 (docs/benchmarks/gate.md). */
  okThreshold?: number;
  /** Prompts shorter than this many words with no task are treated as ambiguous. */
  askBelowWords?: number;
}

export const DEFAULT_GATE: Required<GateOptions> = { okThreshold: 0.6, askBelowWords: 4 };

export function scoreOf(s: GateSignals): number {
  let score = 0;
  if (s.hasTask) score += 0.3;
  if (s.hasContext) score += 0.2;
  if (s.hasConstraints) score += 0.2;
  if (s.hasFormat) score += 0.2;
  if (s.words >= 12) score += 0.1;
  if (s.words >= 30) score += 0.1;
  score -= Math.min(0.4, s.vagueWords * 0.15);
  if (s.danglingReference) score -= 0.3;
  return Math.max(0, Math.min(1, score));
}

export function gatePrompt(text: string, options: GateOptions = {}): GateResult {
  const opts = { ...DEFAULT_GATE, ...options };
  const signals = signalsOf(text);
  const score = scoreOf(signals);
  const hints: string[] = [];
  if (!signals.hasTask) hints.push('Say what you want done (explain, write, fix, compare…).');
  if (!signals.hasContext)
    hints.push('Add a line of context: who it is for or what you are working on.');
  if (!signals.hasConstraints)
    hints.push('Add any constraints (language, length, tone, what to avoid).');
  if (!signals.hasFormat)
    hints.push('Say what the answer should look like (list, table, code, length).');
  if (signals.danglingReference)
    hints.push('"It" or "this" has nothing to point at: paste or describe the thing.');
  if (signals.vagueWords > 1)
    hints.push('Replace vague words ("something", "better") with specifics.');

  const questions: string[] = [];
  let verdict: GateVerdict;
  if (!text.trim()) {
    verdict = 'ok_as_is';
  } else if (
    signals.danglingReference ||
    (signals.words < opts.askBelowWords &&
      !signals.hasTask &&
      !signals.hasCode &&
      !signals.hasMaterial)
  ) {
    verdict = 'ask';
    if (signals.danglingReference)
      questions.push('What does "it" or "this" refer to? Paste it or describe it.');
    else questions.push('What would you like done with this?');
    questions.push('What should a good answer look like (format, length, audience)?');
  } else if (score >= opts.okThreshold) {
    verdict = 'ok_as_is';
  } else {
    verdict = 'improve';
  }
  return {
    verdict,
    score: Math.round(score * 100) / 100,
    signals,
    hints: verdict === 'ok_as_is' ? [] : hints.slice(0, 3),
    questions: questions.slice(0, 2),
  };
}

/** Folds answers to the clarifying questions into the prompt, keeping the user's words intact. */
export function foldAnswers(prompt: string, qa: { question: string; answer: string }[]): string {
  const answered = qa.filter((x) => x.answer.trim());
  if (!answered.length) return prompt;
  return `${prompt.trimEnd()}\n\n${answered.map((x) => `${x.answer.trim()}`).join('\n')}`;
}
