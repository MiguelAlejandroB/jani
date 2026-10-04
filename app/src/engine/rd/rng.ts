// Generador aleatorio reproducible, idéntico bit a bit al de la referencia en Python
// (training/riesgo_decision/jani_rd/rng.py): mulberry32 + Box-Muller (un valor) + Marsaglia-Tsang.

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  u(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ ((t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  normal(): number {
    const u1 = this.u();
    const u2 = this.u();
    return Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2);
  }

  gamma(shape: number): number {
    if (shape <= 0) throw new Error('shape debe ser > 0');
    if (shape < 1) {
      const g = this.gamma(shape + 1);
      return g * (1 - this.u()) ** (1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      const x = this.normal();
      let v = 1 + c * x;
      if (v <= 0) continue;
      v = v * v * v;
      const uu = 1 - this.u();
      if (Math.log(uu) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
    }
  }

  beta(a: number, b: number): number {
    const x = this.gamma(a);
    const y = this.gamma(b);
    return x / (x + y);
  }

  dirichlet(alpha: readonly number[]): number[] {
    const g = alpha.map((a) => this.gamma(a));
    const s = g.reduce((acc, x) => acc + x, 0);
    return g.map((x) => x / s);
  }

  categorical(probs: readonly number[]): number {
    let tot = 0;
    for (const p of probs) tot += p;
    const r = this.u() * tot;
    let acc = 0;
    for (let i = 0; i < probs.length; i++) {
      acc += probs[i] ?? 0;
      if (r < acc) return i;
    }
    return probs.length - 1;
  }
}

/** Secuencia fija para la partícula i (números aleatorios comunes entre escenarios y acciones). */
export function particleStream(seed: number, i: number, salt: number): Rng {
  // (seed·1000003 + i·7919 + salt·104729) mod 2^32, exacto (sin perder precisión con números grandes).
  const m = 4294967296;
  const a = ((seed % m) * 1000003) % m;
  const b = (i * 7919) % m;
  const c = (salt * 104729) % m;
  return new Rng((a + b + c) % m);
}
