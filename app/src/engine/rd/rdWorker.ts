/// <reference lib="webworker" />
// Web Worker: corre RIESGO + DECISIÓN fuera del hilo de la pantalla (unos segundos en un teléfono de gama baja).
import { runRd, type RdInputs } from './run';
import type { RdParams } from './types';

type Msg = { id: number; params: RdParams; inputs: RdInputs; seed: number };

self.onmessage = (e: MessageEvent<Msg>) => {
  const { id, params, inputs, seed } = e.data;
  try {
    self.postMessage({ id, ok: true, result: runRd(params, inputs, seed) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
