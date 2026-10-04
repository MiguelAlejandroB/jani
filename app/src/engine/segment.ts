import { runRaw } from './infer';
import { ModelCardError, nullifyNonFinite } from './modelCard';
import { laplacianVariance, toGray } from './quality';

/** Ficha del segmentador hoja/síntoma (public/models/leafseg-v1/model_card.json). */
export type SegCard = {
  id?: string;
  classes: string[];
  input: { name: string; shape: number[]; mean: number[]; std: number[] };
  output: { name: string };
  severity: { levels: { key: string; max_fraction: number }[] };
  /** min_green_fraction y max_texture_var son opcionales: si faltan, ese filtro no se aplica. */
  leaf_gate: { min_leaf_fraction: number; min_green_fraction?: number; max_texture_var?: number };
  recommended_file: string | null;
};

export type MaskStats = {
  /** (hoja + síntoma) / píxeles totales. */
  leafFraction: number;
  /** síntoma / (hoja + síntoma). */
  severity: number;
  /** Fracción de píxeles "hoja" verdosos (G > R y G > B). */
  greenFraction: number;
};

export type LeafCheck = { gate: 'ok' | 'not_leaf'; stats: MaskStats; textureVar: number };

const FONDO = 0;
const HOJA = 1;
const SINTOMA = 2;

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isNums = (a: unknown, n: number): a is number[] => Array.isArray(a) && a.length === n && a.every(isNum);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Texto de la ficha -> ficha validada. Lanza ModelCardError con los campos inválidos. */
export function parseSegCard(text: string): SegCard {
  let json: unknown;
  try {
    json = JSON.parse(nullifyNonFinite(text));
  } catch {
    throw new ModelCardError(['json']);
  }
  if (!isObj(json)) throw new ModelCardError(['card']);
  const errors: string[] = [];
  const c = json.classes;
  if (!Array.isArray(c) || c[FONDO] !== 'fondo' || c[HOJA] !== 'hoja' || c[SINTOMA] !== 'sintoma') errors.push('classes');
  const input = isObj(json.input) ? json.input : {};
  if (typeof input.name !== 'string' || input.name === '') errors.push('input.name');
  if (!isNums(input.shape, 4) || !input.shape.every((n) => Number.isInteger(n) && n > 0)) errors.push('input.shape');
  if (!isNums(input.mean, 3)) errors.push('input.mean');
  if (!isNums(input.std, 3) || !input.std.every((n) => n > 0)) errors.push('input.std');
  const output = isObj(json.output) ? json.output : {};
  if (typeof output.name !== 'string' || output.name === '') errors.push('output.name');
  const sev = isObj(json.severity) ? json.severity : {};
  const levels = sev.levels;
  if (!Array.isArray(levels) || levels.length === 0 || !levels.every((l) => isObj(l) && typeof l.key === 'string' && isNum(l.max_fraction))) errors.push('severity.levels');
  const gate = isObj(json.leaf_gate) ? json.leaf_gate : {};
  if (!isNum(gate.min_leaf_fraction)) errors.push('leaf_gate.min_leaf_fraction');
  if (gate.min_green_fraction !== undefined && !isNum(gate.min_green_fraction)) errors.push('leaf_gate.min_green_fraction');
  if (gate.max_texture_var !== undefined && !isNum(gate.max_texture_var)) errors.push('leaf_gate.max_texture_var');
  if (json.recommended_file !== null && (typeof json.recommended_file !== 'string' || json.recommended_file === '')) errors.push('recommended_file');
  if (errors.length) throw new ModelCardError(errors);
  return json as SegCard;
}

export async function loadSegCard(baseUrl = './models/leafseg-v1/'): Promise<SegCard> {
  const res = await fetch(`${baseUrl}model_card.json`);
  if (!res.ok) throw new Error('seg_card_unavailable');
  return parseSegCard(await res.text());
}

/** Logits NCHW [1, nClasses, H, W] -> clase por píxel. */
export function argmaxMask(logits: ArrayLike<number>, nClasses: number, nPixels: number): Uint8Array {
  const mask = new Uint8Array(nPixels);
  for (let i = 0; i < nPixels; i++) {
    let best = 0;
    let bestV = logits[i] ?? -Infinity;
    for (let k = 1; k < nClasses; k++) {
      const v = logits[k * nPixels + i] ?? -Infinity;
      if (v > bestV) {
        bestV = v;
        best = k;
      }
    }
    mask[i] = best;
  }
  return mask;
}

/** Estadísticas de la máscara; `rgba` es la misma imagen que entró al modelo (un píxel por elemento de la máscara). */
export function maskStats(mask: Uint8Array, rgba: Uint8ClampedArray): MaskStats {
  let hoja = 0;
  let sintoma = 0;
  let green = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === HOJA) {
      hoja++;
      const r = rgba[i * 4] ?? 0;
      const g = rgba[i * 4 + 1] ?? 0;
      const b = rgba[i * 4 + 2] ?? 0;
      if (g > r && g > b) green++;
    } else if (mask[i] === SINTOMA) sintoma++;
  }
  const leaf = hoja + sintoma;
  if (leaf === 0 || mask.length === 0) return { leafFraction: 0, severity: 0, greenFraction: 0 };
  return { leafFraction: leaf / mask.length, severity: sintoma / leaf, greenFraction: hoja === 0 ? 0 : green / hoja };
}

/** Primer nivel de la ficha cuyo max_fraction cubre la fracción (niveles en orden creciente). */
export function severityLevel(fraction: number, card: SegCard): string {
  const levels = card.severity.levels;
  for (const l of levels) if (fraction <= l.max_fraction) return l.key;
  return levels[levels.length - 1]?.key ?? '';
}

/** ¿Hay una hoja? Umbrales de card.leaf_gate; textureVar = varianza del Laplaciano de la foto en gris. */
export function leafGate(stats: MaskStats, textureVar: number, card: SegCard): 'ok' | 'not_leaf' {
  const g = card.leaf_gate;
  if (stats.leafFraction < g.min_leaf_fraction) return 'not_leaf';
  if (g.min_green_fraction !== undefined && stats.greenFraction < g.min_green_fraction) return 'not_leaf';
  if (g.max_texture_var !== undefined && textureVar > g.max_texture_var) return 'not_leaf';
  return 'ok';
}

/**
 * Segmenta y decide si la foto muestra una hoja.
 * segRgba: imagen estirada a la entrada del segmentador; qualityRgba: la misma a qualitySize x qualitySize.
 */
export async function checkLeaf(segRgba: Uint8ClampedArray, qualityRgba: Uint8ClampedArray, qualitySize: number, card: SegCard, modelUrl: string): Promise<LeafCheck> {
  const [, , h = 0, w = 0] = card.input.shape;
  const logits = await runRaw(segRgba, card, modelUrl);
  if (logits.length !== card.classes.length * h * w) throw new Error('seg_output_shape');
  const stats = maskStats(argmaxMask(logits, card.classes.length, h * w), segRgba);
  const textureVar = laplacianVariance(toGray(qualityRgba), qualitySize, qualitySize);
  return { gate: leafGate(stats, textureVar, card), stats, textureVar };
}
