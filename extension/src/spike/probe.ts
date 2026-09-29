import type { ProbeReport, PromptApiProbe, WebGpuProbe } from './types';

/* The Prompt API is not in TypeScript's DOM lib yet. */
interface LanguageModelLike {
  availability(opts?: unknown): Promise<string>;
  params?(): Promise<Record<string, unknown>>;
}

type Scope = typeof globalThis & {
  navigator?: Navigator & { deviceMemory?: number; getBattery?: unknown };
  LanguageModel?: LanguageModelLike;
};

export async function probeWebGpu(scope: Scope = globalThis as Scope): Promise<WebGpuProbe> {
  const gpu = scope.navigator?.gpu;
  if (!gpu) return { present: false, adapter: false };
  try {
    const adapter = await withTimeout(
      gpu.requestAdapter({ powerPreference: 'high-performance' }),
      10_000,
      'requestAdapter()',
    );
    if (!adapter) return { present: true, adapter: false, error: 'requestAdapter() returned null' };
    // `isFallbackAdapter` moved from the adapter to `adapter.info` in the spec; read both.
    const info = adapter.info as GPUAdapterInfo & { isFallbackAdapter?: boolean };
    const fallback =
      info.isFallbackAdapter ?? (adapter as { isFallbackAdapter?: boolean }).isFallbackAdapter;
    return {
      present: true,
      adapter: true,
      ...(info
        ? {
            adapterInfo: {
              vendor: info.vendor,
              architecture: info.architecture,
              device: info.device,
              description: info.description,
            },
          }
        : {}),
      ...(fallback !== undefined ? { isFallbackAdapter: fallback } : {}),
      shaderF16: adapter.features.has('shader-f16'),
      maxBufferSizeMB: Math.round(adapter.limits.maxBufferSize / (1024 * 1024)),
      compute: await computeSmokeTest(adapter),
    };
  } catch (err) {
    return { present: true, adapter: false, error: String(err) };
  }
}

/**
 * Checks Chrome's built-in model. Only calls `availability()` and `params()`,
 * which never trigger a download; `create()` would, so the probe never calls it.
 */
export async function probePromptApi(scope: Scope = globalThis as Scope): Promise<PromptApiProbe> {
  const lm = scope.LanguageModel;
  if (!lm) return { present: false };
  try {
    const availability = await withTimeout(
      lm.availability({
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      }),
      10_000,
      'LanguageModel.availability()',
    );
    let params: Record<string, unknown> | undefined;
    try {
      // `params()` returns a LanguageModelParams host object that cannot be structured-cloned; copy its fields.
      const raw = lm.params ? await lm.params() : undefined;
      params = raw ? plainFields(raw) : undefined;
    } catch {
      params = undefined;
    }
    return { present: true, availability, ...(params ? { params } : {}) };
  } catch (err) {
    return { present: true, error: String(err) };
  }
}

export async function probeContext(
  context: string,
  scope: Scope = globalThis as Scope,
): Promise<ProbeReport> {
  const [webgpu, promptApi, wasm] = await Promise.all([
    probeWebGpu(scope),
    probePromptApi(scope),
    probeWasm(),
  ]);
  const nav = scope.navigator;
  return {
    context,
    isSecureContext: Boolean(scope.isSecureContext),
    webgpu,
    promptApi,
    wasm,
    ...(nav?.deviceMemory !== undefined ? { deviceMemoryGB: nav.deviceMemory } : {}),
    ...(nav?.hardwareConcurrency !== undefined
      ? { hardwareConcurrency: nav.hardwareConcurrency }
      : {}),
    battery: typeof nav?.getBattery === 'function' ? 'present' : 'absent',
    userAgent: nav?.userAgent ?? '',
  };
}

export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

function plainFields(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ['defaultTopK', 'maxTopK', 'defaultTemperature', 'maxTemperature']) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === 'number' || typeof v === 'string') out[key] = v;
  }
  return out;
}

/** Doubles 64 numbers on the GPU and checks the result: proof that compute works in this context. */
// WebGPU flag values from the spec; TypeScript's DOM lib types the interfaces but not these globals.
const BUFFER = { MAP_READ: 0x1, COPY_SRC: 0x4, COPY_DST: 0x8, STORAGE: 0x80 } as const;
const MAP_READ_MODE = 0x1;

async function computeSmokeTest(adapter: GPUAdapter): Promise<NonNullable<WebGpuProbe['compute']>> {
  const t0 = performance.now();
  try {
    const device = await withTimeout(adapter.requestDevice(), 10_000, 'requestDevice()');
    try {
      const n = 64;
      const input = new Float32Array(Array.from({ length: n }, (_, i) => i));
      const storage = device.createBuffer({
        size: input.byteLength,
        usage: BUFFER.STORAGE | BUFFER.COPY_SRC | BUFFER.COPY_DST,
      });
      device.queue.writeBuffer(storage, 0, input);
      const readback = device.createBuffer({
        size: input.byteLength,
        usage: BUFFER.MAP_READ | BUFFER.COPY_DST,
      });
      const module = device.createShaderModule({
        code: `@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3<u32>) { data[id.x] = data[id.x] * 2.0; }`,
      });
      const pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module, entryPoint: 'main' },
      });
      const bind = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: storage } }],
      });
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(1);
      pass.end();
      enc.copyBufferToBuffer(storage, 0, readback, 0, input.byteLength);
      device.queue.submit([enc.finish()]);
      await withTimeout(readback.mapAsync(MAP_READ_MODE), 10_000, 'mapAsync()');
      const out = new Float32Array(readback.getMappedRange().slice(0));
      readback.unmap();
      const ok = out.every((v, i) => v === i * 2);
      return {
        ok,
        ms: Math.round(performance.now() - t0),
        ...(ok ? {} : { error: 'wrong result' }),
      };
    } finally {
      device.destroy();
    }
  } catch (err) {
    return { ok: false, ms: Math.round(performance.now() - t0), error: String(err) };
  }
}

/** Compiles the smallest valid module. Fails when the CSP lacks 'wasm-unsafe-eval'. */
async function probeWasm(): Promise<ProbeReport['wasm']> {
  try {
    await WebAssembly.compile(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
