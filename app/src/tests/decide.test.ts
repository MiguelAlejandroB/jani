import { describe, expect, it } from 'vitest';
import { decide } from '../engine/decide';
import { deletePath, loadPack, setPath } from './helpers';

describe('decide', () => {
  const pack = loadPack('colombia-andina');
  const run = (risk: 'LOW' | 'MEDIUM' | 'HIGH') => decide({ dominant: 'roya', risk, areaHa: 2 }, pack);

  it('D1: HIGH -> TREAT', () => {
    expect(run('HIGH')).toEqual({
      suggestion: 'TREAT',
      kpis: { expectedLossKg: [300, 700], treatmentCostKg: 40, breakEvenKg: 40, netBenefitKg: [160, 660], confidence: 'high' },
      usedDemoData: true,
      phrase: 'act_cheaper',
    });
  });

  it('D2: MEDIUM -> CONSULT', () => {
    expect(run('MEDIUM')).toEqual({
      suggestion: 'CONSULT',
      kpis: { expectedLossKg: [100, 300], treatmentCostKg: 40, breakEvenKg: 40, netBenefitKg: [-40, 260], confidence: 'low' },
      usedDemoData: true,
      phrase: 'consult',
    });
  });

  it('D3: LOW -> WAIT', () => {
    expect(run('LOW')).toEqual({
      suggestion: 'WAIT',
      kpis: { expectedLossKg: [0, 100], treatmentCostKg: 40, breakEvenKg: 40, netBenefitKg: [-140, 60], confidence: 'medium' },
      usedDemoData: true,
      phrase: 'wait_ok',
    });
  });

  it('D4: sin precio -> CONSULT sin kpis', () => {
    const p = loadPack('colombia-andina');
    setPath(p, 'economics.price_per_kg.value', null);
    deletePath(p, 'demo_values.economics.price_per_kg');
    const r = decide({ dominant: 'roya', risk: 'HIGH', areaHa: 2 }, p);
    expect(r.suggestion).toBe('CONSULT');
    expect(r.phrase).toBe('consult');
    expect(r.kpis).toBeUndefined();
  });

  it('paquete suajili devuelve kpis con demo', () => {
    const r = decide({ dominant: 'roya', risk: 'HIGH', areaHa: 2 }, loadPack('noor-africa-oriental'));
    expect(r.kpis).toBeDefined();
    expect(r.usedDemoData).toBe(true);
  });

  it('neto totalmente negativo -> WAIT con confianza alta', () => {
    const p = loadPack('colombia-andina');
    setPath(p, 'demo_values.economics.treatments.roya.0.cost_per_ha', 40000000);
    const r = decide({ dominant: 'roya', risk: 'HIGH', areaHa: 2 }, p);
    expect(r).toMatchObject({ suggestion: 'WAIT', phrase: 'wait_ok', kpis: { confidence: 'high' } });
  });
});
