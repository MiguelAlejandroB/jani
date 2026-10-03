import { describe, expect, it } from 'vitest';
import { predict } from '../engine/predict';
import type { PredictInput } from '../engine/types';
import { deletePath, loadPack, setPath } from './helpers';

const base: PredictInput = { dominant: 'roya', affectedShare: 0.5, month: 10, heavyRainThisWeek: true, treatedLast60Days: false };

describe('predict', () => {
  const pack = loadPack('colombia-andina');

  it('P1: 5 puntos, HIGH, cuatro factores en orden, demo', () => {
    expect(predict(base, pack)).toEqual({
      level: 'HIGH',
      points: 5,
      factors: ['affected_share_over_30pct', 'rainy_month', 'user_reports_heavy_rain', 'no_treatment_last_60_days'],
      usedDemoData: true,
    });
  });

  it('P2: 2 puntos, MEDIUM', () => {
    const r = predict({ ...base, affectedShare: 0.4, month: 7, heavyRainThisWeek: false, treatedLast60Days: true }, pack);
    expect(r).toMatchObject({ level: 'MEDIUM', points: 2, factors: ['affected_share_over_30pct'] });
  });

  it('P3: 0 puntos, LOW', () => {
    const r = predict({ ...base, affectedShare: 0.2, month: 7, heavyRainThisWeek: false, treatedLast60Days: true }, pack);
    expect(r).toMatchObject({ level: 'LOW', points: 0, factors: [] });
  });

  it('P4: sin meses lluviosos reales ni demo -> CONSULT', () => {
    const p = loadPack('colombia-andina');
    setPath(p, 'calendar.rainy_months', null);
    deletePath(p, 'demo_values.calendar.rainy_months');
    expect(predict(base, p)).toEqual({ level: 'CONSULT', reason: 'missing:calendar.rainy_months' });
  });

  it('0.30 exacto no cuenta como sobre el umbral', () => {
    const r = predict({ ...base, affectedShare: 0.3, month: 7, heavyRainThisWeek: false, treatedLast60Days: true }, pack);
    expect(r).toMatchObject({ points: 0, level: 'LOW' });
  });

  it('puntos faltantes -> CONSULT con la ruta', () => {
    const p = loadPack('colombia-andina');
    setPath(p, 'risk_rules.thresholds.high', null);
    expect(predict(base, p)).toEqual({ level: 'CONSULT', reason: 'missing:risk_rules.thresholds.high' });
  });
});
