export interface WebGpuProbe {
  /** `navigator.gpu` exists in this context. */
  present: boolean;
  /** `requestAdapter()` returned an adapter. */
  adapter: boolean;
  adapterInfo?: { vendor: string; architecture: string; device: string; description: string };
  isFallbackAdapter?: boolean;
  shaderF16?: boolean;
  maxBufferSizeMB?: number;
  /** A tiny compute shader ran and returned the right numbers. */
  compute?: { ok: boolean; ms: number; error?: string };
  error?: string;
}

export interface PromptApiProbe {
  /** A `LanguageModel` global exists in this context. */
  present: boolean;
  /** Result of `LanguageModel.availability()`: unavailable | downloadable | downloading | available. */
  availability?: string;
  params?: Record<string, unknown>;
  error?: string;
}

export interface ProbeReport {
  context: string;
  isSecureContext: boolean;
  webgpu: WebGpuProbe;
  promptApi: PromptApiProbe;
  /** WebAssembly compiles under this context's CSP (WebLLM needs it). */
  wasm: { ok: boolean; error?: string };
  deviceMemoryGB?: number;
  hardwareConcurrency?: number;
  battery: 'present' | 'absent';
  userAgent: string;
}

export interface WebLlmSpikeResult {
  host: string;
  modelId: string;
  loadMs: number;
  firstTokenMs: number;
  tokens: number;
  tokensPerSecond: number;
  output: string;
  jsonMode: { ok: boolean; output?: string; error?: string };
}
