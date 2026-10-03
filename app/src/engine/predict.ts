import type { Pack } from '../packs/schema';
import { resolve } from './resolve';
import type { PredictInput, PredictResult } from './types';

/** Umbral de la spec §5 (el nombre del factor es `affected_share_over_30pct`). */
const AFFECTED_SHARE_THRESHOLD = 0.3;

function num(pack: Pack, path: string): { ok: true; value: number; demo: boolean } | { ok: false; path: string } {
  const r = resolve(pack, path);
  if (!r.found || typeof r.value !== 'number') return { ok: false, path };
  return { ok: true, value: r.value, demo: r.usedDemo };
}

/** Función pura: puntos de riesgo según `risk_rules` y el calendario del paquete. */
export function predict(input: PredictInput, pack: Pack): PredictResult {
  const missing = (path: string): PredictResult => ({ level: 'CONSULT', reason: `missing:${path}` });
  let usedDemoData = false;

  const rainyRes = resolve(pack, 'calendar.rainy_months');
  if (!rainyRes.found || !Array.isArray(rainyRes.value)) return missing('calendar.rainy_months');
  const rainy = rainyRes.value as unknown[];
  usedDemoData ||= rainyRes.usedDemo;

  const active: Array<[string, boolean]> = [
    ['affected_share_over_30pct', input.affectedShare > AFFECTED_SHARE_THRESHOLD],
    ['rainy_month', rainy.includes(input.month)],
    ['user_reports_heavy_rain', input.heavyRainThisWeek],
    ['no_treatment_last_60_days', !input.treatedLast60Days],
  ];

  let points = 0;
  const factors: string[] = [];
  for (const [name, on] of active) {
    const p = num(pack, `risk_rules.points.${name}`);
    if (!p.ok) return missing(p.path);
    usedDemoData ||= p.demo;
    if (on) {
      points += p.value;
      factors.push(name);
    }
  }

  const medium = num(pack, 'risk_rules.thresholds.medium');
  if (!medium.ok) return missing(medium.path);
  const high = num(pack, 'risk_rules.thresholds.high');
  if (!high.ok) return missing(high.path);
  usedDemoData ||= medium.demo || high.demo;

  const level = points >= high.value ? 'HIGH' : points >= medium.value ? 'MEDIUM' : 'LOW';
  return { level, points, factors, usedDemoData };
}
