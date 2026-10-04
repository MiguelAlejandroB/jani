// Cliente del worker de RIESGO + DECISIÓN. Si el navegador no tiene Web Workers, calcula en el hilo principal.
import { loadRdParams, runRd, type RdInputs, type RdResult } from './run';
import type { RdParams } from './types';

let paramsPromise: Promise<RdParams> | null = null;
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: RdResult) => void; reject: (e: Error) => void }>();

export function getRdParams(): Promise<RdParams> {
  if (!paramsPromise) {
    paramsPromise = loadRdParams().catch((e: unknown) => {
      paramsPromise = null; // permite reintentar
      throw e;
    });
  }
  return paramsPromise;
}

function getWorker(): Worker | null {
  if (worker || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('./rdWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: RdResult; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok && e.data.result) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error ?? 'rd_failed'));
    };
  } catch {
    worker = null;
  }
  return worker;
}

export async function computeRd(inputs: RdInputs, seed = 1): Promise<RdResult> {
  const params = await getRdParams();
  const w = getWorker();
  if (!w) return runRd(params, inputs, seed);
  const id = nextId++;
  return new Promise<RdResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, params, inputs, seed });
  });
}
