// packages/core targets any JS runtime (browser, worker, Node) and so uses no DOM or Node lib.
// These are the few globals every one of those runtimes provides.
declare function setTimeout(cb: () => void, ms?: number): unknown;
declare function clearTimeout(handle: unknown): void;
interface AbortSignal {
  readonly aborted: boolean;
}
