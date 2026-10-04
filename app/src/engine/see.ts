import { inputSize, runModel } from './infer';
import { applyUnsureRule, softmax } from './modelCard';
import type { ModelCard } from './modelCard';
import { assessQuality, imageToRgba, QUALITY_SIZE } from './quality';
import { checkLeaf, severityLevel, type SegCard } from './segment';
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

/** seg: ficha del segmentador; si está, primero se comprueba que haya una hoja y se mide la severidad. */
export async function see(image: ImageBitmap, card: ModelCard, opts?: { size?: number; seg?: SegCard | null }): Promise<SeeResult> {
  const size = opts?.size ?? QUALITY_SIZE;
  const rgba = imageToRgba(image, size);
  if (assessQuality(rgba, size, size) === 'bad_photo') return { status: 'unsure', reason: 'bad_photo' };
  if (card.recommended_file !== null) {
    // Modo real. 1) Segmentador: si no hay hoja, se pide otra foto (el clasificador no la ve).
    const seg = opts?.seg;
    let severity: { fraction: number; level: string } | undefined;
    if (seg && seg.recommended_file !== null) {
      const [, segW] = inputSize(seg);
      const leaf = await checkLeaf(imageToRgba(image, segW), rgba, size, seg, new URL(`./models/leafseg-v1/${seg.recommended_file}`, document.baseURI).href);
      if (leaf.gate === 'not_leaf') return { status: 'unsure', reason: 'bad_photo', noLeaf: true };
      severity = { fraction: leaf.stats.severity, level: severityLevel(leaf.stats.severity, seg) };
    }
    // 2) Clasificador: la imagen se estira a la entrada del modelo y se infiere con ONNX.
    const [inH, inW] = inputSize(card);
    const input = inH === size && inW === size ? rgba : imageToRgba(image, inW);
    const logits = await runModel(input, card, new URL(`./models/arabica-v1/${card.recommended_file}`, document.baseURI).href);
    const result = applyUnsureRule(softmax(logits, card.temperature), card, card.classes);
    return result.status === 'ok' && severity ? { ...result, severity } : result;
  }

  const outcome = nextSimOutcome();
  const probs = simulatedProbs(outcome, card.classes);
  if (probs === null) return { status: 'unsure', reason: 'bad_photo' };
  if (outcome === 'low_confidence' || outcome === 'low_margin') return { status: 'unsure', reason: outcome, probs };
  return applyUnsureRule(probs, card, card.classes);
}

