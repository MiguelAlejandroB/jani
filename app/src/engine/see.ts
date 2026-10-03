import { runModel } from './infer';
import { applyUnsureRule, softmax } from './modelCard';
import type { ModelCard } from './modelCard';
import { assessQuality, imageToRgba, QUALITY_SIZE } from './quality';
import type { ClassId, SeeResult } from './types';

export type SimOutcome = ClassId | 'low_confidence' | 'low_margin' | 'bad_photo';

const SIM_KEY = 'jani.sim';
const DEFAULT_PLAN: SimOutcome[] = ['roya'];

/** Plan simulado: JSON en localStorage['jani.sim']; por defecto ['roya']. */
export function getSimPlan(): SimOutcome[] {
  try {
    const raw = localStorage.getItem(SIM_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((x) => typeof x === 'string')) return parsed as SimOutcome[];
    }
  } catch {
    // sin localStorage o JSON inválido: plan por defecto
  }
  return DEFAULT_PLAN;
}

let simIndex = 0;

export function resetSim(): void {
  simIndex = 0;
}

export function nextSimOutcome(): SimOutcome {
  const plan = getSimPlan();
  const outcome = plan[simIndex % plan.length] ?? 'roya';
  simIndex++;
  return outcome;
}

/** Probabilidades simuladas; null para bad_photo. Clase X: 0.9 y el resto reparte 0.1. */
export function simulatedProbs(outcome: SimOutcome, classes: readonly ClassId[]): number[] | null {
  const n = classes.length;
  if (outcome === 'bad_photo') return null;
  if (outcome === 'low_confidence') return classes.map((_, i) => (i === 0 ? 0.5 : 0.5 / (n - 1)));
  if (outcome === 'low_margin') return classes.map((_, i) => (i === 0 ? 0.45 : i === 1 ? 0.4 : 0.15 / (n - 2)));
  return classes.map((c) => (c === outcome ? 0.9 : 0.1 / (n - 1)));
}

export async function see(image: ImageBitmap, card: ModelCard, opts?: { size?: number }): Promise<SeeResult> {
  const size = opts?.size ?? QUALITY_SIZE;
  const rgba = imageToRgba(image, size);
  if (assessQuality(rgba, size, size) === 'bad_photo') return { status: 'unsure', reason: 'bad_photo' };
  if (card.recommended_file !== null) {
    // Modo real: la imagen se estira a la entrada del modelo y se infiere con ONNX.
    const inH = card.input.shape[2] ?? QUALITY_SIZE;
    const inW = card.input.shape[3] ?? QUALITY_SIZE;
    const input = inH === size && inW === size ? rgba : imageToRgba(image, inW);
    const logits = await runModel(input, card, new URL(`./models/arabica-v1/${card.recommended_file}`, document.baseURI).href);
    return applyUnsureRule(softmax(logits, card.temperature), card, card.classes);
  }

  const outcome = nextSimOutcome();
  const probs = simulatedProbs(outcome, card.classes);
  if (probs === null) return { status: 'unsure', reason: 'bad_photo' };
  if (outcome === 'low_confidence' || outcome === 'low_margin') return { status: 'unsure', reason: outcome, probs };
  return applyUnsureRule(probs, card, card.classes);
}

