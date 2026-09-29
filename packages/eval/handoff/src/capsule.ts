// The hybrid capsule condition depends on the capsule builder that milestone M7 adds to
// packages/core. Until then the runner takes any implementation of this interface, loaded
// from the module named in the config, and reports the condition as not run when none is set.

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Message } from './types.ts';

export interface CapsuleOptions {
  /** How many of the most recent turns to include verbatim. */
  lastTurns: number;
}

export interface CapsuleResult {
  /** The text that would be placed in the target chatbox. */
  text: string;
  /** Tokens spent by any model the builder used (0 for the model-free default capsule). */
  generationTokens?: number;
}

export interface CapsuleBuilder {
  readonly id: string;
  build(messages: readonly Message[], opts: CapsuleOptions): Promise<CapsuleResult> | CapsuleResult;
}

/**
 * Loads a builder from a module path (relative to the config file's directory).
 * The module must export `capsuleBuilder` or a default export implementing CapsuleBuilder.
 */
export async function loadCapsuleBuilder(
  modulePath: string,
  baseDir: string,
): Promise<CapsuleBuilder> {
  const mod = (await import(pathToFileURL(resolve(baseDir, modulePath)).href)) as {
    capsuleBuilder?: CapsuleBuilder;
    default?: CapsuleBuilder;
  };
  const builder = mod.capsuleBuilder ?? mod.default;
  if (!builder || typeof builder.build !== 'function') {
    throw new Error(
      `${modulePath} does not export a CapsuleBuilder as \`capsuleBuilder\` or default`,
    );
  }
  return builder;
}
