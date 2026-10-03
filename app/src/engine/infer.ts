import * as ort from 'onnxruntime-web/wasm';
import type { ModelCard } from './modelCard';

let configured = false;

/** wasmPaths: carpeta ort/ servida por la app (relativa a document.baseURI); en node, dist de onnxruntime-web. */
function configure(): void {
  if (configured) return;
  configured = true;
  ort.env.wasm.numThreads = 1;
  if (typeof document !== 'undefined') {
    ort.env.wasm.wasmPaths = new URL('./ort/', document.baseURI).href;
  } else {
    ort.env.wasm.wasmPaths = new URL(/* @vite-ignore */ '../../node_modules/onnxruntime-web/dist/', import.meta.url).href;
  }
}

/** Alto y ancho de entrada (shape NCHW, ya validada al cargar la ficha). */
export function inputSize(card: ModelCard): [h: number, w: number] {
  const [, , h, w] = card.input.shape;
  if (h === undefined || w === undefined) throw new Error('input_shape');
  return [h, w];
}

/** RGBA (tamaño = shape[2]×shape[3]) -> Float32Array NCHW normalizado con mean/std del card. */
export function preprocess(rgba: Uint8ClampedArray, card: ModelCard): Float32Array {
  const [h, w] = inputSize(card);
  const plane = h * w;
  const [m0, m1, m2] = card.input.mean;
  const [s0, s1, s2] = card.input.std;
  if (m0 === undefined || m1 === undefined || m2 === undefined || s0 === undefined || s1 === undefined || s2 === undefined) throw new Error('input_norm');
  const mean = [m0, m1, m2] as const;
  const std = [s0, s1, s2] as const;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      const v = (rgba[i * 4 + c] ?? 0) / 255;
      out[c * plane + i] = (v - mean[c as 0 | 1 | 2]) / std[c as 0 | 1 | 2];
    }
  }
  return out;
}

const sessions = new Map<string, Promise<ort.InferenceSession>>();

/** Una sola sesión por URL, reutilizada. */
export function getSession(url: string): Promise<ort.InferenceSession> {
  let s = sessions.get(url);
  if (!s) {
    configure();
    s = ort.InferenceSession.create(url, { executionProviders: ['wasm'] });
    s.catch(() => sessions.delete(url));
    sessions.set(url, s);
  }
  return s;
}

export async function runModel(rgba: Uint8ClampedArray, card: ModelCard, modelUrl: string): Promise<number[]> {
  const session = await getSession(modelUrl);
  const input = new ort.Tensor('float32', preprocess(rgba, card), card.input.shape);
  const out = await session.run({ [card.input.name]: input });
  const logits = out[card.output.name];
  if (!logits) throw new Error('output_missing');
  const values = Array.from(logits.data as Float32Array);
  if (values.length !== card.classes.length) throw new Error('logits_length');
  return values;
}
