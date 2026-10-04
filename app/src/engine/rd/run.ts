// Conecta la app con los modelos de RIESGO y DECISIÓN: convierte el estado de la revisión y el paquete activo en las
// entradas del manual (§1.1, §2.5, §3.5). Funciones puras; el cálculo pesado corre en rdWorker.ts.
import type { Pack } from '../../packs/schema';
import { resolve } from '../resolve';
import type { SeeResult } from '../types';
import { adapt } from './adapter';
import { climateFor, type ClimateChoice, type LatLon } from './location';
import { decide } from './decision';
import type { Week } from './markov';
import { runRisk } from './risk';
import type { Action, ChainCounts, DecisionOut, Disease, Econ, PhotoObs, Profile, RdParams, RiskOut } from './types';

/** Fotos de la revisión -> contrato §1.1. La severidad viene del segmentador (M2: síntoma ÷ hoja, igual que BRACOL);
 *  si no hay segmentador la hoja entra censurada. Las dudosas (regla "no estoy segura") no entran: p_clase = 0.
 *  Las fotos que llegan aquí ya pasaron el control de calidad (las malas se repitieron), por eso p_calidad = 1. */
export function photosFromSession(results: readonly SeeResult[], severities: readonly (number | null)[] = []): PhotoObs[] {
  return results.map((r, i) =>
    r.status === 'ok'
      ? { clase: r.classId, p_clase: r.confidence, severidad: severities[i] ?? r.severity?.fraction ?? null, p_calidad: 1 }
      : { clase: 'unsure', p_clase: 0, severidad: null, p_calidad: 0 },
  );
}

/** Semana del año 1..52 (la misma división que el clima semanal del paquete). */
export function weekOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const day = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000);
  return Math.min(Math.floor(day / 7) + 1, 52);
}

/** Semanas desde hoy hasta el inicio del próximo mes de cosecha (meses 1..12). null si no hay calendario. */
export function weeksToHarvest(now: Date, harvestMonths: readonly number[]): number | null {
  if (!harvestMonths.length) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let best = Infinity;
  for (const m of harvestMonths) {
    for (const y of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
      const t = Date.UTC(y, m - 1, 1);
      if (t > today) best = Math.min(best, (t - today) / (7 * 86400000));
    }
  }
  return Number.isFinite(best) ? best : null;
}

/** Clima semanal (anomalías del lugar) desde hoy hasta la cosecha. Si llovió mucho esta semana, la anomalía de lluvia
 *  de la primera semana es al menos +1 desviación (dato del productor, no del modelo). */
export function climateWeeks(weeklyZ: readonly number[][], now: Date, horizonWeeks: number, heavyRain: boolean): Week[] {
  const out: Week[] = [];
  let left = horizonWeeks;
  let wk = weekOfYear(now);
  while (left > 1e-9) {
    const z = (weeklyZ[(wk - 1) % 52] ?? [0, 0, 0]).slice();
    if (out.length === 0 && heavyRain) z[2] = Math.max(z[2] ?? 0, 1);
    const d = Math.min(1, left);
    out.push([z, d]);
    left -= d;
    wk = (wk % 52) + 1;
  }
  return out;
}

type Resolved<T> = { value: T; usedDemo: boolean };
function get<T>(pack: Pack, path: string, check: (v: unknown) => v is T): Resolved<T> | null {
  const r = resolve(pack, path);
  return r.found && check(r.value) ? { value: r.value, usedDemo: r.usedDemo } : null;
}
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumArr = (v: unknown): v is number[] => Array.isArray(v) && v.every(isNum);
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export type RdInputs = {
  photos: PhotoObs[];
  weeks: Week[];
  y0Kg: number;
  catalog: Action[];
  profile: Profile;
  econ: Econ;
  usedDemoData: boolean;
  /** Punto de clima usado (el más cercano por GPS o el del paquete). Solo el nombre: la ubicación no sale del teléfono. */
  climate: ClimateChoice;
};

/** Arma todas las entradas desde el paquete activo. null (=> CONSULT) si falta cualquier valor: nunca inventa. */
export function buildInputs(
  pack: Pack,
  results: readonly SeeResult[],
  opts: { areaHa: number; now: Date; heavyRain: boolean; severities?: (number | null)[]; profile?: Partial<Profile>; location?: LatLon | null },
): RdInputs | null {
  const yieldHa = get(pack, 'economics.typical_yield_kg_per_ha', isNum);
  const price = get(pack, 'economics.price_per_kg', isNum);
  const wage = get(pack, 'economics.assumptions.daily_wage', isNum);
  const rate = get(pack, 'economics.assumptions.monthly_interest', isNum);
  const harvest = get(pack, 'calendar.harvest_months', isNumArr);
  const catalog = get(pack, 'economics.catalog.items', isArr);
  const prof = isObj(pack.demo_values.productor) ? (pack.demo_values.productor as unknown as Profile) : null;
  const climate = climateFor(pack.climate_normals as Parameters<typeof climateFor>[0], opts.location ?? null);
  if (!yieldHa || !price || !wage || !rate || !harvest || !catalog || !prof || !climate || !(opts.areaHa > 0)) return null;
  const horizon = weeksToHarvest(opts.now, harvest.value);
  if (horizon === null) return null;
  const month = opts.now.getUTCMonth() + 1;
  const months = harvest.value;
  const inT1 = new Date(opts.now.getTime() + 21 * 86400000).getUTCMonth() + 1;
  return {
    photos: photosFromSession(results, opts.severities),
    weeks: climateWeeks(climate.weeklyZ, opts.now, horizon, opts.heavyRain),
    y0Kg: yieldHa.value * opts.areaHa,
    catalog: catalog.value as Action[],
    profile: { ...prof, ...opts.profile },
    econ: {
      price_med: price.value,
      price_age_weeks: 0,
      wage: wage.value,
      monthly_rate: rate.value,
      area_ha: opts.areaHa,
      harvest_season_t0: months.includes(month),
      harvest_season_t1: months.includes(inT1),
    },
    // El perfil del productor viene de la demostración mientras la persona no lo edite.
    usedDemoData: [yieldHa, price, wage, rate, harvest, catalog].some((x) => x.usedDemo) || !opts.profile,
    climate: climate.choice,
  };
}

export type RdResult = {
  chains: Partial<Record<Disease, ChainCounts>>;
  risk: Pick<RiskOut, 'ell' | 'Y' | 'banderas'>;
  decision: DecisionOut | null;
  usedDemoData: boolean;
  paramsVersion: string;
  autoRecommendation: boolean;
  climate: ClimateChoice;
  /** Cosecha esperada sin daño (kg) para pasar las fracciones de pérdida a kilos. */
  y0Kg: number;
  /** Bandas de visualización bajo/medio/alto (params.display); ausentes => la pantalla pide consultar. */
  riskBands?: [number, number];
};

/** Corre adaptador -> RIESGO -> DECISIÓN. Sin enfermedades vistas no hay riesgo que calcular. */
export function runRd(params: RdParams, inputs: RdInputs, seed = 1): RdResult {
  const chains = adapt(inputs.photos, params);
  const risk = runRisk(chains, params, inputs.weeks, inputs.y0Kg, seed);
  const decision = Object.keys(chains).length ? decide(risk, chains, inputs.catalog, inputs.profile, inputs.econ, params, seed + 6) : null;
  return {
    chains,
    risk: { ell: risk.ell, Y: risk.Y, banderas: risk.banderas },
    decision,
    usedDemoData: inputs.usedDemoData,
    paramsVersion: params.version,
    autoRecommendation: params.modo?.recomendacion_automatica ?? false,
    climate: inputs.climate,
    y0Kg: inputs.y0Kg,
    ...(params.display?.risk_bands ? { riskBands: params.display.risk_bands } : {}),
  };
}

export async function loadRdParams(baseUrl = './models/riesgo-v1/'): Promise<RdParams> {
  const res = await fetch(`${baseUrl}params.json`);
  if (!res.ok) throw new Error('rd_params_unavailable');
  return (await res.json()) as RdParams;
}
