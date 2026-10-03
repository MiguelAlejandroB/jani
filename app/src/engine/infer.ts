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

/** RGBA (tamaño = shape[2]×shape[3]) -> Float32Array NCHW normalizado con mean/std del card. */
export function preprocess(rgba: Uint8ClampedArray, card: ModelCard): Float32Array {
  const h = card.input.shape[2] ?? 224;
  const w = card.input.shape[3] ?? 224;
  const plane = h * w;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      const v = (rgba[i * 4 + c] ?? 0) / 255;
      out[c * plane + i] = (v - (card.input.mean[c] ?? 0)) / (card.input.std[c] ?? 1);
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
  return Array.from(logits.data as Float32Array);
}
