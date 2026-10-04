// Vista de los resultados de RIESGO y DECISIÓN: funciones puras (sin React) que convierten la salida del modelo en lo
// que muestran las pantallas. Ningún umbral vive aquí: las bandas vienen del paquete de parámetros (params.display).
import type { Pack } from '../packs/schema';
import { resolve } from '../engine/resolve';
import type { Choice } from '../engine/types';
import type { DecisionOut } from '../engine/rd/types';

export type ViewLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CONSULT';

/** Nivel según P(pérdida > umbral) y las bandas [b0, b1]. Sin bandas o con detector no corregible: consultar. */
export function riskLevel(pOver: number, bands: readonly [number, number] | undefined, banderas: readonly string[]): ViewLevel {
  if (!bands || !Number.isFinite(pOver) || banderas.includes('detector_no_corregible')) return 'CONSULT';
  if (pOver < bands[0]) return 'LOW';
  if (pOver < bands[1]) return 'MEDIUM';
  return 'HIGH';
}

/** Fracción de la cosecha -> kg enteros. */
export const kg = (fraction: number, y0Kg: number): number => Math.round(fraction * y0Kg);

/** Probabilidad -> "N de 10" (0..10). */
export const tenths = (p: number): number => Math.min(10, Math.max(0, Math.round(p * 10)));

const FLAG_PHRASE: Record<string, string> = {
  parametros_prior: 'flag_prior',
  ess_bajo: 'flag_sample',
  muestra_insuficiente: 'flag_sample',
  detector_no_corregible: 'flag_detector',
  clima_fuera_de_rango: 'flag_climate',
};

/** Banderas del modelo -> claves de frase, sin repetir; las desconocidas no se muestran. */
export function flagPhrases(banderas: readonly string[]): string[] {
  const out: string[] = [];
  for (const b of banderas) {
    const k = FLAG_PHRASE[b];
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

const WHY_PHRASE: Record<string, string> = { liquidez: 'why_liquidity', certificacion: 'why_cert', plazo: 'why_deadline', jornales: 'why_labor' };
export const whyPhrase = (razon: string | null | undefined): string | null => (razon ? (WHY_PHRASE[razon] ?? null) : null);

export type CatalogEntry = { frase?: string; icono?: string };

/** Frase e ícono de cada acción del catálogo del paquete activo (real o de demostración). */
export function catalogIndex(pack: Pack | null): Map<string, CatalogEntry> {
  const m = new Map<string, CatalogEntry>();
  if (!pack) return m;
  const r = resolve(pack, 'economics.catalog.items');
  if (!r.found || !Array.isArray(r.value)) return m;
  for (const it of r.value as unknown[]) {
    if (typeof it !== 'object' || it === null) continue;
    const o = it as { id?: unknown; frase?: unknown; icono?: unknown };
    if (typeof o.id !== 'string') continue;
    m.set(o.id, { ...(typeof o.frase === 'string' ? { frase: o.frase } : {}), ...(typeof o.icono === 'string' ? { icono: o.icono } : {}) });
  }
  return m;
}

export const NADA = 'nada';
export const REMEASURE = 'remeasure';

export type AltView = {
  id: string;
  icon: string;
  phrase: string;
  lossKg: number | null;
  costKg: number;
  /** Ganancia frente a no hacer nada (kg); null para `nada` o sin margen. */
  netKg: number | null;
  /** De cada 10 veces sale mejor que no hacer nada; null si no aplica. */
  timesBetter: number | null;
  hidden: { labor: boolean; money: boolean; cert: boolean };
  viable: boolean;
  why: string | null;
  suggested: boolean;
};

/** Tarjetas de alternativas: las mostradas (+ nada siempre); viables por margen.ce desc, luego las no viables. */
export function altViews(d: DecisionOut, y0Kg: number, catalog: ReadonlyMap<string, CatalogEntry>): AltView[] {
  const ceNada = d.alternativas.find((a) => a.id === NADA)?.margen?.ce ?? null;
  const shown = d.alternativas.filter((a) => a.id === NADA || d.mostradas.includes(a.id));
  const rank = (ce: number | null | undefined) => (typeof ce === 'number' ? ce : -Infinity);
  const sorted = [...shown].sort((a, b) => Number(b.viable_hoy) - Number(a.viable_hoy) || rank(b.margen?.ce) - rank(a.margen?.ce));
  return sorted.map((a) => {
    const isNada = a.id === NADA;
    const c = a.costos;
    const cat = catalog.get(a.id);
    const ce = a.margen?.ce;
    return {
      id: a.id,
      icon: isNada ? '⏳' : (cat?.icono ?? '•'),
      phrase: isNada ? 'alt_wait' : (cat?.frase ?? ''),
      lossKg: a.perdida_pct ? kg(a.perdida_pct.p50, y0Kg) : null,
      costKg: c ? Math.round(c.directo + c.laboral + c.dinero) : 0,
      netKg: !isNada && typeof ce === 'number' && ceNada !== null ? Math.round(ce - ceNada) : null,
      timesBetter: !isNada && typeof a.p_mejor_que_nada === 'number' ? tenths(a.p_mejor_que_nada) : null,
      hidden: { labor: (c?.laboral ?? 0) > 0, money: (c?.dinero ?? 0) > 0, cert: (c?.certificacion ?? 0) > 0 },
      viable: a.viable_hoy,
      why: a.viable_hoy ? null : whyPhrase(a.razon_no_viable),
      suggested: d.recomendacion === a.id,
    };
  });
}

/** Alternativa elegida -> elección registrada en el caso. */
export const altChoice = (id: string): Choice => (id === NADA || id === REMEASURE ? 'WAIT' : 'TREAT');
