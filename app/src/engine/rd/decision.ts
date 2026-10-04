// Modelo de DECISIÓN (manual §3): dos épocas, utilidad exponencial, en KILOS equivalentes. Puerto de jani_rd/decision.py.
// Números aleatorios comunes: cada partícula usa la misma secuencia en todas las acciones.
import { eligibility } from './catalog';
import { ratesFor, step, transition, type Mat4, type Week } from './markov';
import { particleStream } from './rng';
import { applyImmediate, betaSample, damageParams, lossFromPi, weightedQuantile } from './risk';
import { DISEASES, type Action, type Alternative, type ChainCounts, type DecisionOut, type Disease, type Econ, type Profile, type RdParams, type RiskOut } from './types';

const EFFECT_SALT = 5;
const NADA: Action = {
  id: 'nada',
  aplica_a: [],
  nivel_min: 0,
  efecto: { d_a: null, kappa: null, duracion_semanas: 0 },
  costos: { directo_por_ha: 0, jornales_por_ha: 0, cert_penalizacion: 0, calidad_delta: 0 },
  restricciones: {},
  evidencia: 'criterio_experto',
};

/** Equivalente cierto CE_θ = −(1/θ)·log Σ w·exp(−θx) (log-sum-exp); θ→0 da la media. */
export function ce(values: readonly number[], weights: readonly number[], theta: number): number {
  const tot = weights.reduce((a, b) => a + b, 0);
  if (theta <= 1e-12) {
    let s = 0;
    values.forEach((x, i) => (s += weights[i]! * x));
    return s / tot;
  }
  const a = values.map((x) => -theta * x);
  const mx = Math.max(...a);
  let s = 0;
  a.forEach((ai, i) => (s += weights[i]! * Math.exp(ai - mx)));
  s /= tot;
  return -(mx + Math.log(s)) / theta;
}

export function cvarLower(values: readonly number[], weights: readonly number[], alpha: number): number {
  const order = values.map((_, i) => i).sort((x, y) => values[x]! - values[y]!);
  const tot = weights.reduce((a, b) => a + b, 0);
  const need = alpha * tot;
  let acc = 0;
  let s = 0;
  for (const i of order) {
    const take = Math.min(weights[i]!, need - acc);
    if (take <= 0) break;
    s += take * values[i]!;
    acc += take;
  }
  return acc > 0 ? s / acc : values[order[0]!]!;
}

/** a domina a b (segundo orden): ∫ (F_b − F_a) ≥ 0 en todo x, estricto en algún x. */
export function ssdDominates(xa: readonly number[], wa: readonly number[], xb: readonly number[], wb: readonly number[], tol = 1e-9): boolean {
  const ta = wa.reduce((a, b) => a + b, 0);
  const tb = wb.reduce((a, b) => a + b, 0);
  const ev: [number, number, number][] = [
    ...xa.map((x, i) => [x, wa[i]! / ta, 0] as [number, number, number]),
    ...xb.map((x, i) => [x, 0, wb[i]! / tb] as [number, number, number]),
  ];
  ev.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  let Fa = 0;
  let Fb = 0;
  let integral = 0;
  let prev: number | null = null;
  let strict = false;
  for (const [x, da, db] of ev) {
    if (prev !== null && x > prev) {
      integral += (Fb - Fa) * (x - prev);
      if (integral < -tol) return false;
      if (integral > tol) strict = true;
    }
    Fa += da;
    Fb += db;
    prev = x;
  }
  return strict;
}

function matmul(A: Mat4, B: Mat4): Mat4 {
  const C: Mat4 = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let x = 0;
      for (let m = 0; m < 4; m++) x += A[i]![m]! * B[m]![j]!;
      C[i]![j] = x;
    }
  return C;
}

function split(weeks: readonly Week[], delta: number): [Week[], Week[]] {
  const w0: Week[] = [];
  const w1: Week[] = [];
  let t = 0;
  for (const [w, d] of weeks) {
    if (t >= delta) w1.push([w, d]);
    else if (t + d <= delta) w0.push([w, d]);
    else {
      w0.push([w, delta - t]);
      w1.push([w, t + d - delta]);
    }
    t += d;
  }
  return [w0, w1];
}

function argmaxFirst<T>(items: readonly T[], f: (x: T) => number): T {
  let best = items[0]!;
  let bv = f(best);
  for (let i = 1; i < items.length; i++) {
    const v = f(items[i]!);
    if (v > bv) {
      bv = v;
      best = items[i]!;
    }
  }
  return best;
}

type Costs = { directo: number; dinero: number; laboral: number };

class Ctx {
  readonly n: number;
  readonly w: number[];
  readonly totalWeeks: number;
  readonly delta: number;
  readonly w0: Week[];
  readonly w1: Week[];
  readonly price: number[];
  readonly y0: number[];
  readonly theta: number;
  readonly diseases: Disease[];
  readonly primary: Disease | null;
  readonly dp: RdParams['decision'];

  constructor(
    readonly r: RiskOut,
    readonly chains: Partial<Record<Disease, ChainCounts>>,
    readonly profile: Profile,
    readonly econ: Econ,
    readonly p: RdParams,
    readonly seed: number,
  ) {
    this.dp = p.decision;
    this.n = r.weights.length;
    this.w = r.weights;
    this.totalWeeks = r.weeks.reduce((a, [, d]) => a + d, 0);
    this.delta = Math.min(this.dp.delta_weeks, this.totalWeeks);
    [this.w0, this.w1] = split(r.weeks, this.delta);
    const sd = this.dp.price_sd * (1 + this.dp.price_age_widen_per_week * (econ.price_age_weeks ?? 0));
    this.price = [];
    for (let i = 0; i < this.n; i++) this.price.push(econ.price_med * Math.exp(sd * particleStream(seed, i, 1).normal() - 0.5 * sd * sd));
    this.y0 = r.y0;
    this.theta = this.dp.theta_r[profile.aversion ?? this.dp.theta_default]! / Math.max(weightedQuantile(this.y0, this.w, 0.5), 1e-9);
    this.diseases = DISEASES.filter((k) => chains[k]);
    this.primary = this.diseases.length ? argmaxFirst(this.diseases, (k) => meanEll(r, k)) : null;
  }

  moneyCost(a: Action, atT1 = false): [number, number] {
    const c = a.costos;
    const harvest = atT1 ? this.econ.harvest_season_t1 : this.econ.harvest_season_t0;
    const wage = this.econ.wage * (harvest ? this.dp.harvest_wage_factor : 1);
    return [c.directo_por_ha * this.econ.area_ha, c.jornales_por_ha * this.econ.area_ha * wage];
  }

  financeCost(money: number, months: number): number {
    const financed = Math.max(0, money - (this.profile.caja ?? 0));
    const own = money - financed;
    return financed * this.econ.monthly_rate * months + own * this.dp.own_capital_rate_monthly * months;
  }

  costs(a: Action, atT1 = false): Costs {
    if (a.id === 'nada') return { directo: 0, dinero: 0, laboral: 0 };
    const [direct, labor] = this.moneyCost(a, atT1);
    const weeksLeft = this.totalWeeks - (atT1 ? this.delta : 0);
    const months = Math.max(weeksLeft, 0) / 4.345;
    const fin = this.financeCost(direct + labor, months);
    const pm = this.econ.price_med;
    return { directo: direct / pm, dinero: fin / pm, laboral: labor / pm };
  }

  eligible(a: Action, atT1 = false): [boolean, boolean, string | null] {
    const weeks = this.totalWeeks - (atT1 ? this.delta : 0);
    const maxLevel: Partial<Record<Disease, number>> = {};
    for (const k of this.diseases) {
      const c = this.chains[k]!;
      const lv = [0, 1, 2, 3].filter((s) => c.n[s]! > 0);
      maxLevel[k] = Math.max(...lv, c.n_censored ? 1 : 0);
    }
    return eligibility(a, {
      diseases: this.diseases,
      maxLevel,
      weeksToHarvest: weeks,
      profile: this.profile,
      areaHa: this.econ.area_ha,
      costMoney: (x) => {
        const [d, l] = this.moneyCost(x, atT1);
        return d + l;
      },
    });
  }

  effectDraws(a: Action, i: number): [number, number] {
    const ef = a.efecto;
    if (!ef.d_a || !ef.kappa) return [0, 0];
    const r = particleStream(this.seed, i, EFFECT_SALT);
    return [r.beta(ef.d_a.a, ef.d_a.b), r.beta(ef.kappa.a, ef.kappa.b)];
  }

  // Rendimiento (resultado idéntico salvo redondeo ~1e-16; verificado con los vectores dorados):
  //  - parámetros de daño precalculados por (enfermedad, juego de parámetros d);
  //  - matrices "sin acción" de cada semana por (enfermedad, d), compartidas por todas las partículas con ese d;
  //  - producto acumulado de esas matrices desde cada semana de w1 hasta la cosecha: cuando se acaba el efecto de
  //    la acción, el resto del camino es UNA multiplicación en vez de una por semana.
  private readonly dpCache: (ReturnType<typeof damageParams> | undefined)[] = [];
  private readonly plainCache: (Mat4 | undefined)[][] = [];
  private readonly suffixCache: (Mat4[] | undefined)[] = [];
  private readonly weekId = new Map<Week, number>();

  private dpOf(k: Disease, d: number) {
    const key = DISEASES.indexOf(k) * 100000 + d;
    return this.dpCache[key] ?? (this.dpCache[key] = damageParams(this.p, k, d));
  }

  private plain(k: Disease, d: number, wk: Week): Mat4 {
    let id = this.weekId.get(wk);
    if (id === undefined) this.weekId.set(wk, (id = this.weekId.size));
    const key = DISEASES.indexOf(k) * 100000 + d;
    const row = this.plainCache[key] ?? (this.plainCache[key] = []);
    const dp = this.dpOf(k, d);
    return row[id] ?? (row[id] = transition(ratesFor(dp.gammaS, dp.gammaW, wk[0]), wk[1]));
  }

  /** suffix[s] = P_s · P_{s+1} · … · P_last (semanas de w1, sin acción); suffix[len] = identidad. */
  private suffix(k: Disease, d: number): Mat4[] {
    const key = DISEASES.indexOf(k) * 100000 + d;
    let suf = this.suffixCache[key];
    if (suf) return suf;
    const n = this.w1.length;
    suf = new Array<Mat4>(n + 1);
    suf[n] = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    for (let s = n - 1; s >= 0; s--) suf[s] = matmul(this.plain(k, d, this.w1[s]!), suf[s + 1]!);
    this.suffixCache[key] = suf;
    return suf;
  }

  private propagateFast(k: Disease, d: number, pi: readonly number[], weeks: readonly Week[], kappa: number, kappaWeeks: number): number[] {
    const dp = this.dpOf(k, d);
    const useSuffix = weeks === this.w1;
    let t = 0;
    let out = pi.slice();
    for (let s = 0; s < weeks.length; s++) {
      const wk = weeks[s]!;
      const w = wk[0];
      const dt = wk[1];
      if (dt <= 0) continue;
      const on = Math.max(0, Math.min(dt, kappaWeeks - t));
      if (on === 0 && useSuffix) return step(out, this.suffix(k, d)[s]!);
      if (on > 0) out = step(out, transition(ratesFor(dp.gammaS, dp.gammaW, w, kappa), on));
      const off = dt - on;
      if (off > 0) out = step(out, on === 0 ? this.plain(k, d, wk) : transition(ratesFor(dp.gammaS, dp.gammaW, w), off));
      t += dt;
    }
    return out;
  }

  piAt(k: Disease, i: number, piStart: readonly number[], weeks: readonly Week[], a: Action | null): number[] {
    const d = this.r.per_disease[k]!.particles[i]!.d;
    if (!a || !a.aplica_a.includes(k)) return this.propagateFast(k, d, piStart, weeks, 0, 0);
    const [dA, kappa] = this.effectDraws(a, i);
    return this.propagateFast(k, d, applyImmediate(piStart, dA), weeks, kappa, a.efecto.duracion_semanas);
  }

  margin(i: number, pisT: Partial<Record<Disease, number[]>>, actions: readonly Action[]): [number, number] {
    let keep = 1;
    for (const k of this.diseases) {
      const part = this.r.per_disease[k]!.particles[i]!;
      const dp = this.dpOf(k, part.d);
      const mu = lossFromPi(pisT[k]!, dp.g);
      const ell = betaSample(particleStream(this.seed, i, 3 + DISEASES.indexOf(k)), mu, dp.kappa);
      keep *= 1 - ell;
    }
    let q = 1;
    let cert = 0;
    for (const a of actions) {
      q *= 1 + a.costos.calidad_delta;
      if (this.profile.certificaciones?.length) cert += a.costos.cert_penalizacion;
    }
    const revenue = (this.y0[i]! * keep * this.price[i]! * q * (1 - Math.min(cert, 1))) / this.econ.price_med;
    return [revenue, 1 - keep];
  }

  observe(i: number, piT1: Partial<Record<Disease, number[]>>): number {
    if (!this.primary) return 0;
    const r = particleStream(this.seed, i, 2);
    const lam = this.p.lambda;
    const pi = piT1[this.primary]!;
    const q = [0, 1, 2, 3].map((j) => {
      let s = 0;
      for (let s0 = 0; s0 < 4; s0++) s += pi[s0]! * lam[s0]![j]!;
      return s;
    });
    let high = 0;
    for (let t = 0; t < this.dp.m1; t++) if (r.categorical(q) >= 2) high++;
    const frac = high / this.dp.m1;
    const [lo, hi] = this.dp.obs_bins;
    return frac < lo ? 0 : frac < hi ? 1 : 2;
  }
}

function meanEll(r: RiskOut, k: Disease): number {
  return r.per_disease[k]!.particles.reduce((a, p) => a + p.w * (p.ell ?? 0), 0);
}

type Result = {
  action: Action;
  V: number;
  VNoObs: number;
  M: number[];
  L: number[];
  costs0: Costs;
  nodes: Map<number, { prob: number; a1: string }>;
  MByA1: Map<string, number[]>;
  c0Kg: number;
  obs: number[];
};

function valueAtTheta(r: Result, w: readonly number[], theta: number): number {
  const nodes = new Map<number, number[]>();
  r.obs.forEach((o, i) => {
    if (!nodes.has(o)) nodes.set(o, []);
    nodes.get(o)!.push(i);
  });
  const vals: number[] = [];
  const probs: number[] = [];
  for (const idx of nodes.values()) {
    const wo = idx.map((i) => w[i]!);
    let best = -Infinity;
    for (const m of r.MByA1.values()) best = Math.max(best, ce(idx.map((i) => m[i]!), wo, theta));
    vals.push(best);
    probs.push(wo.reduce((a, b) => a + b, 0));
  }
  return -r.c0Kg + ce(vals, probs, theta);
}

/** Salida del contrato §3.5 (en kilos equivalentes). */
export function decide(
  risk: RiskOut,
  chains: Partial<Record<Disease, ChainCounts>>,
  catalog: readonly Action[],
  profile: Profile,
  econ: Econ,
  params: RdParams,
  seed = 7,
): DecisionOut {
  const cx = new Ctx(risk, chains, profile, econ, params, seed);
  const { n, w } = cx;
  const acts0: Action[] = [NADA];
  const info = new Map<string, { viable: boolean; why: string | null }>();
  for (const a of catalog) {
    const [applies, viable, why] = cx.eligible(a);
    if (applies) {
      info.set(a.id, { viable, why });
      if (viable) acts0.push(a);
    }
  }
  const acts1: Action[] = [NADA, ...catalog.filter((a) => {
    const [ap, vi] = cx.eligible(a, true);
    return ap && vi;
  })];

  const results = new Map<string, Result>();
  for (const a0 of acts0) {
    const P1: Partial<Record<Disease, number[]>>[] = [];
    for (let i = 0; i < n; i++) {
      const row: Partial<Record<Disease, number[]>> = {};
      for (const k of cx.diseases) row[k] = cx.piAt(k, i, risk.per_disease[k]!.particles[i]!.pi0, cx.w0, a0.id !== 'nada' ? a0 : null);
      P1.push(row);
    }
    const obs = P1.map((pi, i) => cx.observe(i, pi));
    const costs0 = cx.costs(a0);
    const c0Kg = costs0.directo + costs0.dinero + costs0.laboral;
    const M = new Map<string, number[]>();
    const L = new Map<string, number[]>();
    for (const a1 of acts1) {
      const c1v = cx.costs(a1, true);
      const c1 = c1v.directo + c1v.dinero + c1v.laboral;
      const ms: number[] = [];
      const ls: number[] = [];
      for (let i = 0; i < n; i++) {
        const pisT: Partial<Record<Disease, number[]>> = {};
        for (const k of cx.diseases) pisT[k] = cx.piAt(k, i, P1[i]![k]!, cx.w1, a1.id !== 'nada' ? a1 : null);
        const [rev, ell] = cx.margin(i, pisT, [a0, a1].filter((x) => x.id !== 'nada'));
        ms.push(rev - c1);
        ls.push(ell);
      }
      M.set(a1.id, ms);
      L.set(a1.id, ls);
    }
    const nodes = new Map<number, { idx: number[]; prob: number; a1: string; V: number }>();
    for (const o of [0, 1, 2]) {
      const idx: number[] = [];
      obs.forEach((x, i) => {
        if (x === o) idx.push(i);
      });
      if (!idx.length) continue;
      const wo = idx.map((i) => w[i]!);
      const best = argmaxFirst(acts1, (a1) => ce(idx.map((i) => M.get(a1.id)![i]!), wo, cx.theta));
      nodes.set(o, { idx, prob: wo.reduce((a, b) => a + b, 0), a1: best.id, V: ce(idx.map((i) => M.get(best.id)![i]!), wo, cx.theta) });
    }
    const nodeList = [...nodes.values()];
    const Vt0 = -c0Kg + ce(nodeList.map((x) => x.V), nodeList.map((x) => x.prob), cx.theta);
    const bestNoObs = argmaxFirst(acts1, (a1) => ce(M.get(a1.id)!, w, cx.theta));
    const VNoObs = -c0Kg + ce(M.get(bestNoObs.id)!, w, cx.theta);
    const policy = new Array<string>(n);
    for (const nd of nodeList) for (const i of nd.idx) policy[i] = nd.a1;
    results.set(a0.id, {
      action: a0,
      V: Vt0,
      VNoObs,
      M: policy.map((a1, i) => M.get(a1)![i]! - c0Kg),
      L: policy.map((a1, i) => L.get(a1)![i]!),
      costs0,
      nodes: new Map([...nodes.entries()].map(([o, nd]) => [o, { prob: nd.prob, a1: nd.a1 }])),
      MByA1: M,
      c0Kg,
      obs,
    });
  }

  const all = [...results.values()];
  const VStar = Math.max(...all.map((r) => r.V));
  const VStarNoObs = Math.max(...all.map((r) => r.VNoObs));
  const base = results.get('nada')!;
  const y0Mean = cx.w.reduce((a, wi, i) => a + wi * cx.y0[i]!, 0);
  const alts: Alternative[] = [];
  for (const [id, r] of results) {
    const a = r.action;
    let better = 0;
    let esperado = 0;
    let pNeg = 0;
    for (let i = 0; i < n; i++) {
      if (r.M[i]! > base.M[i]! + 1e-12) better += w[i]!;
      esperado += w[i]! * r.M[i]!;
      if (r.M[i]! < 0) pNeg += w[i]!;
    }
    alts.push({
      id,
      evidencia: a.evidencia,
      viable_hoy: true,
      razon_no_viable: null,
      margen: { ce: r.V, esperado, cvar10: cvarLower(r.M, w, 0.1), p_negativo: pNeg },
      perdida_pct: { p50: weightedQuantile(r.L, w, 0.5), p90: weightedQuantile(r.L, w, 0.9) },
      costos: {
        ...r.costs0,
        certificacion: id === 'nada' || !profile.certificaciones?.length ? 0 : a.costos.cert_penalizacion * y0Mean,
        calidad: id === 'nada' ? 0 : -a.costos.calidad_delta * y0Mean,
      },
      costo_oportunidad: VStar - r.V,
      p_mejor_que_nada: better,
      domina_a: [],
      dominada_por: null,
      no_se_justifica: id !== 'nada' && better < cx.dp.f3_min_prob_better,
    });
  }
  for (const [id, inf] of info)
    if (!inf.viable) alts.push({ id, evidencia: catalog.find((a) => a.id === id)?.evidencia, viable_hoy: false, razon_no_viable: inf.why, margen: null });

  const viable = alts.filter((x) => x.viable_hoy);
  for (const a of viable)
    for (const b of viable) {
      if (a === b) continue;
      if (ssdDominates(results.get(a.id)!.M, w, results.get(b.id)!.M, w)) {
        a.domina_a!.push(b.id);
        if (b.dominada_por === null && b.id !== 'nada') b.dominada_por = a.id;
      }
    }
  viable.sort((x, y) => y.margen!.ce - x.margen!.ce);
  const shown = viable.filter((x) => x.id === 'nada' || x.dominada_por === null).slice(0, cx.dp.max_shown + 1);
  const flags = new Set(risk.banderas);
  let recomendacion: string | null;
  let razon: string | null;
  if (viable.every((x) => x.margen!.p_negativo > 0.5)) [recomendacion, razon] = ['consultar', 'todas_con_perdida_probable'];
  else if (flags.has('parametros_prior') || flags.has('muestra_insuficiente'))
    [recomendacion, razon] = [null, flags.has('parametros_prior') ? 'parametros_prior' : 'muestra_insuficiente'];
  else [recomendacion, razon] = [viable[0]!.id, null];
  const cObs = (cx.dp.remeasure_labor_days * econ.area_ha * econ.wage) / econ.price_med;
  const voi = VStar - VStarNoObs;
  for (const x of viable) {
    if (x.id === 'nada') {
      x.costo_demora = 0;
      continue;
    }
    const later = base.MByA1.get(x.id);
    x.costo_demora = later ? results.get(x.id)!.V - ce(later, w, cx.theta) : null;
  }
  const sens = {
    theta_bajo: argmaxFirst(viable, (x) => valueAtTheta(results.get(x.id)!, w, cx.theta * 0.25)).id,
    theta_alto: argmaxFirst(viable, (x) => valueAtTheta(results.get(x.id)!, w, cx.theta * 4)).id,
  };
  const actNow = viable.filter((x) => x.id !== 'nada').map((x) => x.margen!.ce);
  return {
    alternativas: alts,
    mostradas: [...shown.map((x) => x.id), 'consultar'],
    recomendacion,
    razon_sin_recomendacion: razon,
    valor_de_esperar: base.V - (actNow.length ? Math.max(...actNow) : base.V),
    valor_de_remedir: voi,
    costo_remedir: cObs,
    recomendar_remedir: voi > cObs,
    sensibilidad: sens,
    theta: cx.theta,
    banderas: [...flags].sort(),
    unidad: 'kg',
  };
}
