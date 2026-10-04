/// <reference types="node" />
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildInputs, climateWeeks, photosFromSession, runRd, weekOfYear, weeksToHarvest } from '../engine/rd/run';
import type { RdParams } from '../engine/rd/types';
import type { SeeResult } from '../engine/types';
import { deletePath, loadPack, setPath } from './helpers';

const params = JSON.parse(readFileSync('public/models/riesgo-v1/params.json', 'utf8')) as RdParams;
const ok = (classId: SeeResult extends infer T ? (T extends { classId: infer C } ? C : never) : never, confidence = 0.9): SeeResult =>
  ({ status: 'ok', classId, confidence, probs: [] }) as SeeResult;
const NOW = new Date(Date.UTC(2026, 9, 3)); // 3 de octubre de 2026

describe('integración app -> RIESGO y DECISIÓN', () => {
  it('semanas a cosecha y semana del año', () => {
    expect(weekOfYear(new Date(Date.UTC(2026, 0, 1)))).toBe(1);
    expect(weekOfYear(new Date(Date.UTC(2026, 11, 31)))).toBe(52);
    // Demo de Colombia: cosecha en 4,5,6,10,11,12 -> desde el 3 de octubre, el 1 de noviembre (29 días).
    expect(weeksToHarvest(NOW, [4, 5, 6, 10, 11, 12])).toBeCloseTo(29 / 7, 6);
    expect(weeksToHarvest(NOW, [])).toBeNull();
  });

  it('clima: semanas desde hoy, fracción final y lluvia reportada por el productor', () => {
    const z = Array.from({ length: 52 }, (_, i) => [i, -i, i % 2 ? 0.5 : -0.5]);
    const w = climateWeeks(z, NOW, 2.5, true);
    expect(w.map(([, d]) => d)).toEqual([1, 1, 0.5]);
    expect(w[0]![0]).toEqual([39, -39, 1]);       // semana 40 del año (índice 39); lluvia >= +1 por "llovió mucho"
    expect(w[1]![0]).toEqual([40, -40, -0.5]);
  });

  it('las fotos dudosas no entran al modelo', () => {
    const r = photosFromSession([ok('roya'), { status: 'unsure', reason: 'low_confidence' }], [0.05]);
    expect(r[0]).toEqual({ clase: 'roya', p_clase: 0.9, severidad: 0.05, p_calidad: 1 });
    expect(r[1]!.p_clase).toBe(0);
  });

  it('nunca inventa: sin precio (real ni de demostración) no hay entradas', () => {
    const p = loadPack('colombia-andina');
    setPath(p, 'economics.price_per_kg.value', null);
    deletePath(p, 'demo_values.economics.price_per_kg');
    expect(buildInputs(p, [ok('roya')], { areaHa: 2, now: NOW, heavyRain: false })).toBeNull();
  });

  it('recorrido completo con el paquete de Colombia: riesgo, alternativas, banderas y datos de demostración', () => {
    const pack = loadPack('colombia-andina');
    const results = [...Array.from({ length: 6 }, () => ok('roya')), ...Array.from({ length: 4 }, () => ok('sana'))];
    const inputs = buildInputs(pack, results, { areaHa: 2, now: NOW, heavyRain: true })!;
    expect(inputs.usedDemoData).toBe(true);
    expect(inputs.y0Kg).toBe(2000);
    const out = runRd(params, inputs);
    expect(out.chains.roya!.n_censored).toBe(6);   // sin segmentación: censuradas, no se inventa la severidad
    expect(out.risk.ell.p10).toBeLessThanOrEqual(out.risk.ell.p50);
    expect(out.risk.ell.p50).toBeLessThanOrEqual(out.risk.ell.p90);
    expect(out.risk.banderas).toContain('parametros_prior');
    expect(out.decision!.alternativas.some((a) => a.id === 'nada')).toBe(true);
    expect(out.decision!.recomendacion).toBeNull();     // parámetros prior: nunca una recomendación única
    expect(out.autoRecommendation).toBe(false);          // regla de parada §7 (ver informe de calibración)
  });

  it('todas sanas: no hay cadena de enfermedad ni decisión', () => {
    const inputs = buildInputs(loadPack('colombia-andina'), [ok('sana'), ok('sana')], { areaHa: 2, now: NOW, heavyRain: false })!;
    const out = runRd(params, inputs);
    expect(out.decision).toBeNull();
    expect(out.risk.ell.p90).toBe(0);
  });
});
