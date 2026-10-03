import type { ClassId, SeeResult } from './types';

export type ModelCard = {
  id?: string;
  classes: ClassId[];
  input: { name: string; shape: number[]; mean: number[]; std: number[] };
  output: { name: string };
  temperature: number;
  unsure_rule: { min_confidence: number; min_margin: number };
  files: Record<string, string | null>;
  recommended_file: string | null;
  metrics: Record<string, unknown>;
  size_mb: Record<string, number>;
};

export async function loadModelCard(baseUrl = './models/arabica-v1/'): Promise<ModelCard> {
  const res = await fetch(`${baseUrl}model_card.json`);
  if (!res.ok) throw new Error('model_card_unavailable');
  return (await res.json()) as ModelCard;
}

/** softmax(logits / temperature), estable numéricamente (resta el máximo). */
export function softmax(logits: ArrayLike<number>, temperature: number): number[] {
  const scaled = Array.from(logits, (v) => v / temperature);
  const max = Math.max(...scaled);
  const exps = scaled.map((v) => Math.exp(v - max));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / total);
}

export function applyUnsureRule(probs: number[], card: ModelCard, classes: readonly ClassId[]): SeeResult {
  let best = 0;
  for (let i = 1; i < probs.length; i++) if ((probs[i] ?? 0) > (probs[best] ?? 0)) best = i;
  const max = probs[best] ?? 0;
  const second = probs.reduce((m, p, i) => (i === best ? m : Math.max(m, p)), 0);
  if (max < card.unsure_rule.min_confidence) return { status: 'unsure', reason: 'low_confidence', probs };
  if (max - second < card.unsure_rule.min_margin) return { status: 'unsure', reason: 'low_margin', probs };
  const classId = classes[best];
  if (classId === undefined) throw new Error('class_index_out_of_range');
  return { status: 'ok', classId, confidence: max, probs };
}
