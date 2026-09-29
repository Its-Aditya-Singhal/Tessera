// Loads @tessera/core from source. The harness runs under Node's type
// stripping, which cannot resolve the core package's extensionless imports, so
// jiti transpiles it on the fly. Only the optimizer entry points are typed here.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

export interface GateResultLike {
  verdict: 'ok_as_is' | 'improve' | 'ask';
  score: number;
  hints: string[];
  questions: string[];
}

export interface CoreLike {
  gatePrompt(text: string, opts?: { okThreshold?: number; askBelowWords?: number }): GateResultLike;
  optimizePrompt(
    prompt: string,
    opts: {
      generate?: (req: {
        system?: string;
        prompt: string;
        maxTokens?: number;
        temperature?: number;
        jsonSchema?: Record<string, unknown>;
      }) => Promise<string>;
      englishOutput?: boolean;
      force?: boolean;
    },
  ): Promise<{
    verdict: 'ok_as_is' | 'improve' | 'ask';
    optimizedRedacted?: string;
    questions: string[];
    redaction: { items: { enabled: boolean; placeholder: string; original: string }[] };
    templateVersion: string;
    session: { restore(text: string): string; clear(): void };
  }>;
  OPTIMIZER_TEMPLATE_VERSION: string;
}

const coreEntry = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../core/src/index.ts',
);

let cached: Promise<CoreLike> | undefined;

export function loadCore(): Promise<CoreLike> {
  cached ??= createJiti(import.meta.url).import<CoreLike>(coreEntry);
  return cached;
}
