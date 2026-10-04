"""Generador aleatorio reproducible, idéntico bit a bit al de la app (app/src/engine/rd/rng.ts).

mulberry32 para uniformes; Box-Muller (un valor por llamada) para normales; Marsaglia-Tsang para gammas.
Usar el mismo algoritmo en Python y TypeScript permite comparar salidas con "vectores dorados" (manual §0.3).
"""
import math

M32 = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    return (a * b) & M32


class Rng:
    def __init__(self, seed: int):
        self.s = seed & M32

    def u(self) -> float:
        """Uniforme en [0, 1)."""
        self.s = (self.s + 0x6D2B79F5) & M32
        t = self.s
        t = _imul(t ^ (t >> 15), t | 1)
        t = (t ^ ((t + _imul(t ^ (t >> 7), t | 61)) & M32)) & M32
        return ((t ^ (t >> 14)) & M32) / 4294967296.0

    def normal(self) -> float:
        u1 = self.u()
        u2 = self.u()
        return math.sqrt(-2.0 * math.log(1.0 - u1)) * math.cos(2.0 * math.pi * u2)

    def gamma(self, shape: float) -> float:
        """Gamma(shape, 1). Marsaglia-Tsang; para shape < 1 se usa el refuerzo G(a+1)·U^(1/a)."""
        if shape <= 0:
            raise ValueError("shape debe ser > 0")
        if shape < 1.0:
            g = self.gamma(shape + 1.0)
            return g * (1.0 - self.u()) ** (1.0 / shape)
        d = shape - 1.0 / 3.0
        c = 1.0 / math.sqrt(9.0 * d)
        while True:
            x = self.normal()
            v = 1.0 + c * x
            if v <= 0:
                continue
            v = v * v * v
            uu = 1.0 - self.u()
            if math.log(uu) < 0.5 * x * x + d - d * v + d * math.log(v):
                return d * v

    def beta(self, a: float, b: float) -> float:
        x = self.gamma(a)
        y = self.gamma(b)
        return x / (x + y)

    def dirichlet(self, alpha):
        g = [self.gamma(a) for a in alpha]
        s = sum(g)
        return [x / s for x in g]

    def categorical(self, probs) -> int:
        r = self.u() * sum(probs)
        acc = 0.0
        for i, p in enumerate(probs):
            acc += p
            if r < acc:
                return i
        return len(probs) - 1
