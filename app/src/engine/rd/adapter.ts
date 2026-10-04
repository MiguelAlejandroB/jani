// Adaptador de entrada (manual §1.2): salidas de M1 + M2 por foto -> conteos por nivel, una cadena por enfermedad.
// Hoja de la enfermedad k: nivel según su severidad; sana u otra enfermedad: nivel 0 para k;
// sin severidad (no hay modelo de segmentación): observación censurada "nivel >= 1" (no se inventa un nivel).
import { DISEASES, type ChainCounts, type Disease, type PhotoObs, type RdParams } from './types';

export function levelOf(severity: number, thresholds: readonly number[]): number {
  for (let s = 0; s < thresholds.length; s++) if (severity < thresholds[s]!) return s;
  return 3;
}

export function adapt(photos: readonly PhotoObs[], params: RdParams): Partial<Record<Disease, ChainCounts>> {
  const a = params.adapter;
  const valid = photos.filter((p) => (p.p_calidad ?? 1) >= a.p_quality_min && (p.p_clase ?? 0) >= a.p_class_min);
  const m = valid.length;
  const mEff = m / (1 + (a.units_per_plant - 1) * a.rho);
  const seen = DISEASES.filter((k) => valid.some((p) => p.clase === k));
  const out: Partial<Record<Disease, ChainCounts>> = {};
  for (const k of seen) {
    const cc: ChainCounts = { disease: k, n: [0, 0, 0, 0], n_censored: 0, m, m_eff: mEff, flags: [] };
    const th = params.levels.thresholds[k];
    for (const p of valid) {
      if (p.clase !== k) cc.n[0]! += 1;
      else if (p.severidad === null || p.severidad === undefined) cc.n_censored += 1;
      else cc.n[levelOf(p.severidad, th)]! += 1;
    }
    if (mEff < a.min_m_eff) cc.flags.push('muestra_insuficiente');
    out[k] = cc;
  }
  return out;
}
