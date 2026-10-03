import { CLASS_IDS, type ClassId, type SeeResult } from './types';

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
  known_limits?: unknown;
  limits?: unknown;
};

/** Error de ficha: `errors` lista los campos inválidos. */
export class ModelCardError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`invalid_model_card: ${errors.join(', ')}`);
    this.name = 'ModelCardError';
    this.errors = errors;
  }
}

/** Cambia por null los tokens sueltos NaN / Infinity / -Infinity (json.dump de Python), sin tocar el interior de las cadenas. */
function nullifyNonFinite(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? '';
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += text[i + 1] ?? '';
        i++;
      } else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    const m = /^(-?Infinity|NaN)(?![A-Za-z0-9_])/.exec(text.slice(i, i + 10));
    if (m) {
      out += 'null';
      i += m[0].length - 1;
      continue;
    }
    out += ch;
  }
  return out;
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isNums = (a: unknown, n: number): a is number[] => Array.isArray(a) && a.length === n && a.every(isNum);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Valida lo que el motor usa de la ficha. Devuelve los campos inválidos. */
export function validateModelCard(json: unknown): { ok: true; card: ModelCard } | { ok: false; errors: string[] } {
  if (!isObj(json)) return { ok: false, errors: ['card'] };
  const errors: string[] = [];
  const classes = json.classes;
  if (!Array.isArray(classes) || classes.length === 0 || !classes.every((c) => (CLASS_IDS as readonly unknown[]).includes(c))) errors.push('classes');
  const input = isObj(json.input) ? json.input : {};
  if (typeof input.name !== 'string' || input.name === '') errors.push('input.name');
  if (!isNums(input.shape, 4) || !input.shape.every((n) => Number.isInteger(n) && n > 0)) errors.push('input.shape');
  if (!isNums(input.mean, 3)) errors.push('input.mean');
  if (!isNums(input.std, 3) || !input.std.every((n) => n > 0)) errors.push('input.std');
  const output = isObj(json.output) ? json.output : {};
  if (typeof output.name !== 'string' || output.name === '') errors.push('output.name');
  if (!isNum(json.temperature) || json.temperature <= 0) errors.push('temperature');
  const rule = isObj(json.unsure_rule) ? json.unsure_rule : {};
  if (!isNum(rule.min_confidence)) errors.push('unsure_rule.min_confidence');
  if (!isNum(rule.min_margin)) errors.push('unsure_rule.min_margin');
  if (json.recommended_file !== null && (typeof json.recommended_file !== 'string' || json.recommended_file === '')) errors.push('recommended_file');
  if (errors.length) return { ok: false, errors };
  return { ok: true, card: { ...json, files: isObj(json.files) ? json.files : {}, metrics: isObj(json.metrics) ? json.metrics : {}, size_mb: isObj(json.size_mb) ? json.size_mb : {} } as ModelCard };
}

/** Texto de model_card.json -> ficha validada. Lanza ModelCardError si no sirve. */
export function parseModelCard(text: string): ModelCard {
  let json: unknown;
  try {
    json = JSON.parse(nullifyNonFinite(text));
  } catch {
    throw new ModelCardError(['json']);
  }
  const v = validateModelCard(json);
  if (!v.ok) throw new ModelCardError(v.errors);
  return v.card;
}

export async function loadModelCard(baseUrl = './models/arabica-v1/'): Promise<ModelCard> {
  const res = await fetch(`${baseUrl}model_card.json`);
  if (!res.ok) throw new Error('model_card_unavailable');
  return parseModelCard(await res.text());
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
