/// <reference types="node" />
// @vitest-environment node
// Vectores dorados (manual §0.3 y §7-S5): la app en TypeScript reproduce la referencia en Python
// (training/riesgo_decision) con las mismas entradas: mismo generador aleatorio, mismo algoritmo.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adapt } from '../engine/rd/adapter';
import { decide } from '../engine/rd/decision';
import { transition, type Week } from '../engine/rd/markov';
import { Rng } from '../engine/rd/rng';
import { runRisk } from '../engine/rd/risk';
import type { Action, Econ, PhotoObs, Profile, RdParams } from '../engine/rd/types';

const params = JSON.parse(readFileSync('public/models/riesgo-v1/params.json', 'utf8')) as RdParams;
type GoldenCase = {
  name: string;
  photos: PhotoObs[];
  weeks: Week[];
  y0_kg: number;
  n: number;
  seed_risk: number;
  seed_decision: number;
  econ: Econ;
  profile: Profile;
  chains: Record<string, { n: number[]; n_censored: number; m: number; m_eff: number; flags: string[] }>;
  risk: { ell: Record<string, number>; Y: Record<string, number | number[]>; banderas: string[] };
  decision: {
    alternativas: Array<{ id: string; viable_hoy: boolean; razon_no_viable: string | null; margen: Record<string, number> | null; costo_oportunidad?: number; costos?: Record<string, number> }>;
    valor_de_remedir: number;
    costo_remedir: number;
    valor_de_esperar: number;
    recomendacion: string | null;
    sensibilidad: Record<string, string>;
    theta: number;
  };
};
const golden = JSON.parse(readFileSync('src/tests/fixtures/golden_rd.json', 'utf8')) as {
  params_version: string;
  rng: number[];
  transition: number[][];
  transition_equal_rates: number[][];
  catalog: Action[];
  cases: GoldenCase[];
};

const close = (a: number, b: number, rel = 1e-6) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));

describe('vectores dorados RIESGO + DECISIÓN (TypeScript = Python)', () => {
  it('usa el mismo paquete de parámetros con el que se generaron', () => {
    expect(params.version).toBe(golden.params_version);
  });

  it('generador aleatorio idéntico (uniformes, normales, gamma, beta)', () => {
    const r = new Rng(12345);
    const seq = [r.u(), r.u(), r.u(), r.u(), r.u(), r.normal(), r.normal(), r.normal(), r.gamma(0.7), r.gamma(3.2), r.beta(2, 5)];
    seq.forEach((x, i) => expect(close(x, golden.rng[i]!, 1e-9)).toBe(true));
  });

  it('matriz de transición (forma cerrada y tasas iguales)', () => {
    const a = transition([0.12, 0.31, 0.2], 1.5);
    const b = transition([0.3, 0.3, 0.3], 1);
    a.forEach((row, i) => row.forEach((x, j) => expect(close(x, golden.transition[i]![j]!, 1e-9)).toBe(true)));
    b.forEach((row, i) => row.forEach((x, j) => expect(close(x, golden.transition_equal_rates[i]![j]!, 1e-9)).toBe(true)));
  });

  for (const c of golden.cases) {
    it(`caso ${c.name}: adaptador, riesgo y decisión`, () => {
      const chains = adapt(c.photos, params);
      for (const [k, gc] of Object.entries(c.chains)) {
        const tc = chains[k as keyof typeof chains]!;
        expect(tc.n).toEqual(gc.n);
        expect(tc.n_censored).toBe(gc.n_censored);
        expect(tc.flags).toEqual(gc.flags);
      }
      const risk = runRisk(chains, params, c.weeks, c.y0_kg, c.seed_risk, c.n);
      for (const k of ['p10', 'p50', 'p90', 'cvar10', 'p_sobre_umbral']) expect(close(risk.ell[k as 'p10'], c.risk.ell[k]!)).toBe(true);
      for (const k of ['p10', 'p50', 'p90']) expect(close(risk.Y[k as 'p10'], c.risk.Y[k] as number)).toBe(true);
      expect(risk.banderas).toEqual(c.risk.banderas);

      const d = decide(risk, chains, golden.catalog, c.profile, c.econ, params, c.seed_decision);
      expect(close(d.theta, c.decision.theta)).toBe(true);
      expect(d.alternativas.map((a) => a.id)).toEqual(c.decision.alternativas.map((a) => a.id));
      d.alternativas.forEach((a, i) => {
        const g = c.decision.alternativas[i]!;
        expect(a.viable_hoy).toBe(g.viable_hoy);
        expect(a.razon_no_viable).toBe(g.razon_no_viable);
        if (g.margen) for (const k of ['ce', 'esperado', 'cvar10', 'p_negativo']) expect(close(a.margen![k as 'ce'], g.margen[k]!)).toBe(true);
        if (g.costos) for (const k of Object.keys(g.costos)) expect(close(a.costos![k as 'directo'], g.costos[k]!)).toBe(true);
        if (g.costo_oportunidad !== undefined) expect(close(a.costo_oportunidad!, g.costo_oportunidad, 1e-5)).toBe(true);
      });
      expect(close(d.valor_de_remedir, c.decision.valor_de_remedir, 1e-5)).toBe(true);
      expect(close(d.costo_remedir, c.decision.costo_remedir)).toBe(true);
      expect(close(d.valor_de_esperar, c.decision.valor_de_esperar, 1e-5)).toBe(true);
      expect(d.recomendacion).toBe(c.decision.recomendacion);
      expect(d.sensibilidad).toEqual(c.decision.sensibilidad);
    }, 60000);
  }
});
