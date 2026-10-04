// Modelo de RIESGO (manual §2): capas M, D, L, U + envoltura conforme. Puerto de jani_rd/risk.py (vectores dorados).
import { propagate, type Week } from './markov';
import { Rng, particleStream } from './rng';
import { DISEASES, type ChainCounts, type Disease, type Particle, type RdParams, type RiskOut } from './types';

const EPS = 1e-6;

export function predictedObs(pi: readonly number[], lam: readonly number[][]): number[] {
  return [0, 1, 2, 3].map((j) => {
    let s = 0;
    for (let i = 0; i < 4; i++) s += pi[i]! * lam[i]![j]!;
    return s;
  });
}

export function logLik(pi: readonly number[], c: ChainCounts, lam: readonly number[][]): number {
  if (c.m === 0) return 0;
  const q = predictedObs(pi, lam);
  let ll = 0;
  c.n.forEach((n, s) => {
    if (n) ll += n * Math.log(Math.max(q[s]!, 1e-300));
  });
  if (c.n_censored) ll += c.n_censored * Math.log(Math.max(q[1]! + q[2]! + q[3]!, 1e-300));
  return (c.m_eff / c.m) * ll;
}

function orderBy(values: readonly number[], sign: 1 | -1): number[] {
  return values.map((_, i) => i).sort((a, b) => sign * (values[a]! - values[b]!));
}

export function weightedQuantile(values: readonly number[], weights: readonly number[], q: number): number {
  const order = orderBy(values, 1);
  const tot = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (const i of order) {
    acc += weights[i]!;
    if (acc >= q * tot - 1e-12) return values[i]!;
  }
  return values[order[order.length - 1]!]!;
}

/** Media de la cola alta de probabilidad alpha (para pérdidas). */
export function cvarUpper(values: readonly number[], weights: readonly number[], alpha: number): number {
  const order = orderBy(values, -1);
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

function systematicResample(weights: readonly number[], rng: Rng): number[] {
  const n = weights.length;
  const tot = weights.reduce((a, b) => a + b, 0);
  const stp = tot / n;
  const u0 = rng.u() * stp;
  const idx: number[] = [];
  let acc = weights[0]!;
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = u0 + i * stp;
    while (acc < target && j < n - 1) {
      j++;
      acc += weights[j]!;
    }
    idx.push(j);
  }
  return idx;
}

export function betaSample(rng: Rng, mu: number, kappa: number): number {
  const m = Math.min(Math.max(mu, EPS), 1 - EPS);
  return rng.beta(m * kappa, (1 - m) * kappa);
}

export function damageParams(params: RdParams, k: Disease, d: number) {
  const dr = params.draws[k];
  return {
    gammaS: dr.log_tau[d]!.map((x) => -x),
    gammaW: dr.gamma_w[d]!,
    g: [0, ...dr.g[d]!],
    kappa: dr.kappa[d]!,
  };
}

export function applyImmediate(pi: readonly number[], dA: number): number[] {
  if (dA <= 0) return pi.slice();
  return [pi[0]! + dA * pi[1]!, (1 - dA) * pi[1]! + dA * pi[2]!, (1 - dA) * pi[2]! + dA * pi[3]!, (1 - dA) * pi[3]!];
}

export function lossFromPi(piT: readonly number[], g: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < 4; i++) s += piT[i]! * g[i]!;
  return Math.min(Math.max(s, EPS), 1 - EPS);
}

function initParticles(c: ChainCounts, params: RdParams, rng: Rng, n: number) {
  const k = c.disease;
  const alpha = params.prior_pi0.regional[k].map((x) => params.prior_pi0.strength * x);
  const S = params.draws[k].log_tau.length;
  const lam = params.lambda;
  let parts: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const pi0 = rng.dirichlet(alpha);
    const d = Math.floor(rng.u() * S);
    parts.push({ pi0, d, logw: logLik(pi0, c, lam), w: 0 });
  }
  const mx = Math.max(...parts.map((p) => p.logw));
  let w = parts.map((p) => Math.exp(p.logw - mx));
  const tot = w.reduce((a, b) => a + b, 0);
  w = w.map((x) => x / tot);
  const ess = 1 / w.reduce((a, x) => a + x * x, 0);
  const flags: string[] = [];
  if (ess < 0.2 * n) {
    flags.push('ess_bajo');
    const idx = systematicResample(w, rng);
    parts = idx.map((i) => ({ ...parts[i]! }));
    w = new Array<number>(n).fill(1 / n);
  }
  parts.forEach((p, i) => (p.w = w[i]!));
  return { parts, ess, flags };
}

/** chains: salida del adaptador. weeksZ: anomalías climáticas estandarizadas por semana hasta la cosecha. */
export function runRisk(
  chains: Partial<Record<Disease, ChainCounts>>,
  params: RdParams,
  weeksZ: readonly Week[],
  y0Kg: number,
  seed = 1,
  nParticles?: number,
): RiskOut {
  const n = nParticles ?? params.particles;
  const rng = new Rng(seed);
  const weeks: Week[] = weeksZ.map(([w, d]) => [w.slice(), d]);
  const flags = new Set<string>();
  if (weeks.some(([w]) => w.some((x) => Math.abs(x) > params.climate.range_sd))) flags.add('clima_fuera_de_rango');
  const perDisease: RiskOut['per_disease'] = {};
  const keys = DISEASES.filter((k) => chains[k]);
  for (const k of keys) {
    const cc = chains[k]!;
    cc.flags.forEach((f) => flags.add(f));
    const { parts, ess, flags: f } = initParticles(cc, params, rng, n);
    f.forEach((x) => flags.add(x));
    for (let s = 0; s < 4; s++) {
      // Solo niveles observados: una hoja censurada (">= 1", sin segmentador) no observó el nivel 3.
      if (cc.n[s]! > 0 && params.lambda[s]![s]! <= 0.5) flags.add('detector_no_corregible');
    }
    parts.forEach((p, i) => {
      const dp = damageParams(params, k, p.d);
      p.pi_T = propagate(p.pi0, dp.gammaS, dp.gammaW, weeks);
      p.mu = lossFromPi(p.pi_T, dp.g);
      p.ell = betaSample(particleStream(seed, i, 3 + DISEASES.indexOf(k)), p.mu, dp.kappa);
    });
    perDisease[k] = { particles: parts, ess };
  }
  const sdY = params.yield.sd_log;
  const y0: number[] = [];
  for (let i = 0; i < n; i++) y0.push(y0Kg * Math.exp(sdY * rng.normal() - 0.5 * sdY * sdY));
  let w: number[];
  let ell: number[];
  if (keys.length) {
    w = new Array<number>(n).fill(1);
    ell = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      let keep = 1;
      for (const k of keys) {
        const p = perDisease[k]!.particles[i]!;
        w[i]! *= p.w;
        keep *= 1 - p.ell!;
      }
      ell[i] = 1 - keep;
    }
    const tot = w.reduce((a, b) => a + b, 0);
    w = w.map((x) => x / tot);
  } else {
    w = new Array<number>(n).fill(1 / n);
    ell = new Array<number>(n).fill(0);
  }
  const Y = y0.map((y, i) => y * (1 - ell[i]!));
  const star = params.loss_threshold;
  const q = params.conformal.q_frac * y0Kg;
  const yq = [0.1, 0.5, 0.9].map((a) => weightedQuantile(Y, w, a)) as [number, number, number];
  let pOver = 0;
  w.forEach((x, i) => {
    if (ell[i]! > star) pOver += x;
  });
  evidenceFlags(params, keys).forEach((f) => flags.add(f));
  return {
    ell: {
      p10: weightedQuantile(ell, w, 0.1),
      p50: weightedQuantile(ell, w, 0.5),
      p90: weightedQuantile(ell, w, 0.9),
      cvar10: cvarUpper(ell, w, 0.1),
      p_sobre_umbral: pOver,
    },
    Y: { p10: yq[0], p50: yq[1], p90: yq[2], conforme: [Math.max(0, yq[0] - q), yq[2] + q] },
    banderas: [...flags].sort(),
    weights: w,
    ell_samples: ell,
    y0,
    per_disease: perDisease,
    weeks,
  };
}

function evidenceFlags(params: RdParams, keys: readonly Disease[]): string[] {
  const f: string[] = [];
  if (keys.some((k) => Object.values(params.evidence[k]).some((v) => v === 'prior'))) f.push('parametros_prior');
  if ((params.calibration_age_days ?? 0) > 365) f.push('calibracion_vieja');
  return f;
}
