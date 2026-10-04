// Capa D del modelo de RIESGO (manual §2.2): cadena de Markov que solo avanza, 4 estados, el 3 absorbente.
// Misma lógica que training/riesgo_decision/jani_rd/markov.py (forma cerrada; Taylor si dos tasas casi coinciden).

export type Mat4 = number[][];
export type Week = [number[], number]; // [anomalía climática estandarizada, Δ semanas]

const GAP = 1e-3;

function wellSeparated(r: readonly number[]): boolean {
  const scale = Math.max(Math.abs(r[0]!), Math.abs(r[1]!), Math.abs(r[2]!), 1e-300);
  for (let i = 0; i < r.length; i++) for (let j = 0; j < i; j++) if (!(Math.abs((r[i] ?? 0) - (r[j] ?? 0)) > GAP * scale)) return false;
  return true;
}

/** Término de la hipoexponencial para los estados lam[from..to] (sin crear arreglos: se llama millones de veces). */
function chainTerm(lam: readonly number[], from: number, to: number, delta: number): number {
  let prod = 1;
  for (let j = from; j < to; j++) prod *= lam[j]!;
  let s = 0;
  for (let i = from; i <= to; i++) {
    let den = 1;
    for (let j = from; j <= to; j++) if (j !== i) den *= lam[j]! - lam[i]!;
    s += Math.exp(-lam[i]! * delta) / den;
  }
  return prod * s;
}

export function generator(rates: readonly number[]): Mat4 {
  const Q = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
  rates.forEach((r, s) => {
    Q[s]![s] = -r;
    Q[s]![s + 1] = r;
  });
  return Q;
}

function taylorTransition(rates: readonly number[], delta: number): Mat4 {
  let norm = Math.max(...rates.map(Math.abs)) * delta;
  let sq = 0;
  while (norm > 0.5) {
    norm /= 2;
    sq++;
  }
  const h = delta / 2 ** sq;
  const Q = generator(rates);
  const A = Q.map((row) => row.map((x) => x * h));
  let E: Mat4 = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => (i === j ? 1 : 0)));
  let term: Mat4 = E.map((row) => row.slice());
  for (let k = 1; k <= 12; k++) {
    const t = term;
    term = [0, 1, 2, 3].map((i) =>
      [0, 1, 2, 3].map((j) => {
        if (j < i) return 0;
        let s = 0;
        for (let m = i; m <= j; m++) s += t[i]![m]! * A[m]![j]!;
        return s / k;
      }),
    );
    const tt = term;
    E = E.map((row, i) => row.map((x, j) => x + tt[i]![j]!));
  }
  for (let q = 0; q < sq; q++) {
    const e = E;
    E = [0, 1, 2, 3].map((i) =>
      [0, 1, 2, 3].map((j) => {
        if (j < i) return 0;
        let s = 0;
        for (let m = i; m <= j; m++) s += e[i]![m]! * e[m]![j]!;
        return s;
      }),
    );
  }
  return E.map((row) => {
    const tot = row.reduce((a, b) => a + b, 0);
    return row.map((x) => Math.max(0, x) / tot);
  });
}

/** expm(QΔ) para tasas (λ0, λ1, λ2): triangular superior, filas que suman 1. */
export function transition(rates: readonly number[], delta: number): Mat4 {
  if (!wellSeparated(rates)) return taylorTransition(rates, delta);
  const lam = [rates[0]!, rates[1]!, rates[2]!, 0];
  const P: Mat4 = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let a = 0; a < 3; a++) {
    const row = P[a]!;
    row[a] = Math.exp(-lam[a]! * delta);
    let acc = row[a]!;
    for (let b = a + 1; b < 3; b++) {
      row[b] = Math.max(0, chainTerm(lam, a, b, delta));
      acc += row[b]!;
    }
    row[3] = Math.max(0, 1 - acc);
  }
  P[3]![3] = 1;
  return P;
}

export function ratesFor(gammaS: readonly number[], gammaW: readonly number[], w: readonly number[], kappaAction = 0): number[] {
  let eff = 0;
  const n = Math.min(gammaW.length, w.length);
  for (let i = 0; i < n; i++) eff += gammaW[i]! * w[i]!;
  const k = 1 - kappaAction;
  return [k * Math.exp(gammaS[0]! + eff), k * Math.exp(gammaS[1]! + eff), k * Math.exp(gammaS[2]! + eff)];
}

export function step(pi: readonly number[], P: Mat4): number[] {
  const out = [0, 0, 0, 0];
  for (let j = 0; j < 4; j++) {
    let s = 0;
    for (let i = 0; i < 4; i++) s += pi[i]! * P[i]![j]!;
    out[j] = s;
  }
  return out;
}

/** π_T = π0 · ∏ expm(Q(w_i)Δ_i); el efecto sostenido κ_a dura kappaWeeks desde el inicio. */
export function propagate(
  pi: readonly number[],
  gammaS: readonly number[],
  gammaW: readonly number[],
  weeks: readonly Week[],
  kappaAction = 0,
  kappaWeeks = 0,
): number[] {
  let t = 0;
  let out = pi.slice();
  for (const [w, d] of weeks) {
    if (d <= 0) continue;
    const on = Math.max(0, Math.min(d, kappaWeeks - t));
    if (on > 0) out = step(out, transition(ratesFor(gammaS, gammaW, w, kappaAction), on));
    const off = d - on;
    if (off > 0) out = step(out, transition(ratesFor(gammaS, gammaW, w), off));
    t += d;
  }
  return out;
}
