import { describe, expect, it } from 'vitest';
import type { Alternative, DecisionOut } from '../engine/rd/types';
import { altChoice, altViews, catalogIndex, flagPhrases, kg, riskLevel, tenths, whyPhrase } from '../screens/rdView';
import { loadPack } from './helpers';

const alt = (id: string, ce: number | null, extra: Partial<Alternative> = {}): Alternative => ({
  id,
  viable_hoy: true,
  razon_no_viable: null,
  margen: ce === null ? null : { ce, esperado: ce, cvar10: ce, p_negativo: 0.1 },
  perdida_pct: { p50: 0.1, p90: 0.2 },
  costos: { directo: 0, dinero: 0, laboral: 0, certificacion: 0, calidad: 0 },
  ...extra,
});

const decision = (alternativas: Alternative[], mostradas: string[], extra: Partial<DecisionOut> = {}): DecisionOut =>
  ({ alternativas, mostradas, recomendacion: null, recomendar_remedir: false, ...extra }) as DecisionOut;

describe('rdView: nivel de riesgo desde las bandas del paquete de parámetros', () => {
  it('bajo, medio y alto según p_sobre_umbral', () => {
    expect(riskLevel(0.1, [0.33, 0.66], [])).toBe('LOW');
    expect(riskLevel(0.33, [0.33, 0.66], [])).toBe('MEDIUM');
    expect(riskLevel(0.65, [0.33, 0.66], [])).toBe('MEDIUM');
    expect(riskLevel(0.66, [0.33, 0.66], [])).toBe('HIGH');
  });
  it('sin bandas o con detector no corregible: consultar (no inventa umbrales)', () => {
    expect(riskLevel(0.1, undefined, [])).toBe('CONSULT');
    expect(riskLevel(0.1, [0.33, 0.66], ['detector_no_corregible'])).toBe('CONSULT');
    expect(riskLevel(Number.NaN, [0.33, 0.66], [])).toBe('CONSULT');
  });
});

describe('rdView: cifras', () => {
  it('kg enteros a partir de la fracción de pérdida', () => {
    expect(kg(0.1234, 2000)).toBe(247);
    expect(kg(0, 2000)).toBe(0);
  });
  it('décimos entre 0 y 10', () => {
    expect(tenths(0.34)).toBe(3);
    expect(tenths(0.96)).toBe(10);
    expect(tenths(1.2)).toBe(10);
    expect(tenths(-0.1)).toBe(0);
  });
});

describe('rdView: frases de banderas y razones', () => {
  it('mapea banderas conocidas, sin repetir, e ignora las demás', () => {
    expect(flagPhrases(['parametros_prior', 'ess_bajo', 'muestra_insuficiente', 'otra', 'detector_no_corregible', 'clima_fuera_de_rango'])).toEqual([
      'flag_prior',
      'flag_sample',
      'flag_detector',
      'flag_climate',
    ]);
  });
  it('razones no viables', () => {
    expect(whyPhrase('liquidez')).toBe('why_liquidity');
    expect(whyPhrase('certificacion')).toBe('why_cert');
    expect(whyPhrase('plazo')).toBe('why_deadline');
    expect(whyPhrase('jornales')).toBe('why_labor');
    expect(whyPhrase(null)).toBeNull();
    expect(whyPhrase('otra')).toBeNull();
  });
});

describe('rdView: alternativas', () => {
  const catalog = catalogIndex(loadPack('colombia-andina'));

  it('el catálogo del paquete da frase e ícono', () => {
    expect(catalog.get('poda_selectiva')).toEqual({ frase: 'alt_cultural', icono: '✂️' });
  });

  it('solo las mostradas (+ nada), viables por ce desc y luego no viables', () => {
    const d = decision(
      [
        alt('nada', 100),
        alt('cobre', 150),
        alt('poda_selectiva', 300),
        alt('fungicida_sistemico', 400, { viable_hoy: false, razon_no_viable: 'liquidez' }),
        alt('biologico', 500),
      ],
      ['cobre', 'poda_selectiva', 'fungicida_sistemico'],
    );
    const v = altViews(d, 2000, catalog);
    expect(v.map((a) => a.id)).toEqual(['poda_selectiva', 'cobre', 'nada', 'fungicida_sistemico']);
    expect(v[3]).toMatchObject({ viable: false, why: 'why_liquidity' });
  });

  it('cifras por tarjeta: pérdida, costo visible, ganancia frente a nada, veces mejor y costos ocultos', () => {
    const d = decision(
      [
        alt('nada', 100, { perdida_pct: { p50: 0.2, p90: 0.3 } }),
        alt('fungicida_sistemico', 160.4, {
          perdida_pct: { p50: 0.05, p90: 0.1 },
          costos: { directo: 30.2, dinero: 4.4, laboral: 10, certificacion: 0, calidad: 0 },
          p_mejor_que_nada: 0.74,
        }),
      ],
      ['fungicida_sistemico'],
      { recomendacion: 'fungicida_sistemico' },
    );
    const [f, n] = altViews(d, 2000, catalog);
    expect(f).toMatchObject({
      id: 'fungicida_sistemico',
      icon: '💧',
      phrase: 'alt_fungicide',
      lossKg: 100,
      costKg: 45,
      netKg: 60,
      timesBetter: 7,
      hidden: { labor: true, money: true, cert: false },
      suggested: true,
    });
    expect(n).toMatchObject({ id: 'nada', icon: '⏳', phrase: 'alt_wait', lossKg: 400, costKg: 0, netKg: null, timesBetter: null, suggested: false });
  });

  it('acción sin margen: sin ganancia ni orden por encima de las que sí tienen', () => {
    const d = decision([alt('nada', 10), alt('cobre', null)], ['cobre']);
    const v = altViews(d, 1000, catalog);
    expect(v.map((a) => a.id)).toEqual(['nada', 'cobre']);
    expect(v[1]!.netKg).toBeNull();
  });

  it('elegir: nada o volver a revisar -> esperar; una acción -> tratar', () => {
    expect(altChoice('nada')).toBe('WAIT');
    expect(altChoice('remeasure')).toBe('WAIT');
    expect(altChoice('cobre')).toBe('TREAT');
  });
});
