import { describe, expect, it } from 'vitest';
import { resolve } from '../engine/resolve';
import { deletePath, loadPack, setPath } from './helpers';

describe('resolve', () => {
  it('valor real con fuente válida -> usedDemo false', () => {
    const p = loadPack('colombia-andina');
    setPath(p, 'economics.price_per_kg', { value: 18000, date: '2026-01', source: 'FNC 2026' });
    expect(resolve(p, 'economics.price_per_kg')).toEqual({ found: true, value: 18000, usedDemo: false });
  });

  it('real con source TODO y demo presente -> demo, usedDemo true', () => {
    const p = loadPack('colombia-andina');
    expect(resolve(p, 'economics.price_per_kg')).toEqual({ found: true, value: 20000, usedDemo: true });
  });

  it('ausente en real y demo -> found false', () => {
    const p = loadPack('colombia-andina');
    deletePath(p, 'demo_values.economics.price_per_kg');
    expect(resolve(p, 'economics.price_per_kg')).toEqual({ found: false });
  });

  it('desenvuelve {value, source}', () => {
    const p = loadPack('colombia-andina');
    setPath(p, 'economics.typical_yield_kg_per_ha', { value: 850, source: 'Cenicafé' });
    expect(resolve(p, 'economics.typical_yield_kg_per_ha')).toEqual({ found: true, value: 850, usedDemo: false });
  });

  it('sin source en la cadena -> real', () => {
    const p = loadPack('colombia-andina');
    expect(resolve(p, 'risk_rules.points.rainy_month')).toEqual({ found: true, value: 1, usedDemo: false });
    expect(resolve(p, 'risk_rules.thresholds.high')).toMatchObject({ found: true, usedDemo: false });
  });

  it('la fuente se hereda del ancestro más cercano', () => {
    const p = loadPack('colombia-andina');
    setPath(p, 'economics.loss_share_by_risk.roya.high', [0.2, 0.4]);
    expect(resolve(p, 'economics.loss_share_by_risk.roya.high')).toMatchObject({ usedDemo: true, value: [0.15, 0.35] });
    setPath(p, 'economics.loss_share_by_risk.roya.source', 'Cenicafé');
    expect(resolve(p, 'economics.loss_share_by_risk.roya.high')).toEqual({ found: true, value: [0.2, 0.4], usedDemo: false });
  });

  it('índice de arreglo y objeto con campo nulo -> demo completo', () => {
    const p = loadPack('colombia-andina');
    expect(resolve(p, 'economics.treatments.roya.0')).toEqual({
      found: true,
      value: { id: 't1', label_phrase: 'treatment_generic', cost_per_ha: 400000, residual_risk: 'low' },
      usedDemo: true,
    });
  });

  it('calendario real con TODO cae a demo; arreglo con null es ausente', () => {
    const p = loadPack('colombia-andina');
    expect(resolve(p, 'calendar.rainy_months')).toEqual({ found: true, value: [4, 5, 10, 11], usedDemo: true });
    setPath(p, 'calendar.source', 'IDEAM');
    setPath(p, 'calendar.rainy_months', [4, null]);
    expect(resolve(p, 'calendar.rainy_months')).toMatchObject({ usedDemo: true });
  });

  it('ruta inexistente -> found false', () => {
    expect(resolve(loadPack('colombia-andina'), 'no.existe.0')).toEqual({ found: false });
  });
});
