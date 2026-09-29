// A toy stand-in for the M7 capsule builder, used by `--fake` smoke runs and tests so the
// hybrid condition's plumbing can be exercised. It is NOT the product's capsule and its
// numbers must never be reported as hybrid-capsule results.

import type { CapsuleBuilder } from './capsule.ts';
import { renderTranscript } from './render.ts';
import { fence } from './dataset/spec.ts';

export const toyCapsuleBuilder: CapsuleBuilder = {
  id: 'toy-capsule (harness test only)',
  build(messages, { lastTurns }) {
    const firstUser = messages.find((m) => m.role === 'user')?.text ?? '';
    const code = messages.flatMap((m) => m.codeBlocks).map((b) => fence(b.language, b.code));
    const recent = messages.slice(-lastTurns * 2);
    const text = [
      `Goal: ${firstUser}`,
      code.length ? `Code and artifacts (verbatim):\n\n${code.join('\n\n')}` : '',
      `Last ${lastTurns} turns (verbatim):\n\n${renderTranscript(recent)}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    return { text, generationTokens: 0 };
  },
};
