// The product's capsule builder (packages/core, M7) behind the harness's CapsuleBuilder contract.
// Core is loaded with jiti because the harness runs under Node's type stripping, which cannot
// resolve the core package's extensionless imports.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import type { CapsuleBuilder } from './capsule.ts';
import type { Message } from './types.ts';

interface CoreCapsule {
  buildCapsule(
    messages: readonly Message[],
    opts: { mode: 'full' | 'capsule' | 'hybrid'; lastTurns?: number; budgetTokens?: number },
  ): { text: string; tokens: number; cut: string[] };
}

const coreEntry = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../core/src/index.ts',
);

let core: Promise<CoreCapsule> | undefined;
export const loadCoreCapsule = (): Promise<CoreCapsule> =>
  (core ??= createJiti(import.meta.url).import<CoreCapsule>(coreEntry));

export const capsuleBuilder: CapsuleBuilder = {
  id: 'tessera-hybrid-capsule-v1',
  async build(messages, { lastTurns }) {
    const { buildCapsule } = await loadCoreCapsule();
    // No budget pressure in the benchmark: it measures what the capsule keeps, not trimming.
    const r = buildCapsule(messages, { mode: 'hybrid', lastTurns, budgetTokens: 1_000_000 });
    return { text: r.text, generationTokens: 0 };
  },
};

export default capsuleBuilder;
