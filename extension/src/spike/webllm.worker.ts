import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

// Hosts WebLLM off the offscreen document's main thread. The handler owns the engine.
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);
