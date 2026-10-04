"""Capa D del modelo de RIESGO: cadena de Markov continua que solo avanza (manual §2.2).

Estados 0..3 (sana, leve, moderada, severa); 3 absorbente. Tasas λ_s(w) = exp(γ_s + γ_wᵀw), con γ_s = −log(τ_s)
(τ_s = semanas medias en el estado s en clima medio). La unidad de tiempo es la semana.

expm(QΔ) de una cadena de nacimiento puro de 4 estados tiene forma cerrada (distribución hipoexponencial); se usa
esa fórmula (barata en el teléfono). Si dos tasas casi coinciden (separación relativa < GAP) la forma cerrada pierde
precisión por cancelación y se usa escalado y cuadrado con Taylor. Ambos caminos se verifican contra una referencia.
"""
import math

N_STATES = 4


GAP = 1e-3   # separación relativa mínima entre tasas para usar la forma cerrada


def _well_separated(rates):
    scale = max(max(abs(x) for x in rates), 1e-300)
    return all(abs(rates[i] - rates[j]) > GAP * scale for i in range(len(rates)) for j in range(i))


def _chain_term(rates, delta):
    """P(pasar del primer estado al último de una cadena con esas tasas, en tiempo delta, y estar en el último).

    Para tasas r0..r_{k-1} (k pasos) y el estado de llegada con tasa r_k de salida:
    P = (∏_{j<k} r_j) · Σ_{i=0..k} e^{−r_i Δ} / ∏_{j≠i} (r_j − r_i)
    """
    k = len(rates) - 1
    prod = 1.0
    for j in range(k):
        prod *= rates[j]
    s = 0.0
    for i in range(k + 1):
        den = 1.0
        for j in range(k + 1):
            if j != i:
                den *= rates[j] - rates[i]
        s += math.exp(-rates[i] * delta) / den
    return prod * s


def transition(rates, delta):
    """Matriz 4×4 = expm(QΔ) para tasas (λ0, λ1, λ2). Triangular superior y filas que suman 1.
    Forma cerrada si las tasas están separadas; si dos casi coinciden (la fórmula cerrada pierde precisión por
    cancelación), escalado y cuadrado con Taylor."""
    if not _well_separated(list(rates)):
        return _taylor_transition(list(rates), delta)
    l0, l1, l2 = rates
    P = [[0.0] * 4 for _ in range(4)]
    lam = [l0, l1, l2, 0.0]
    for a in range(3):
        P[a][a] = math.exp(-lam[a] * delta)
        acc = P[a][a]
        for b in range(a + 1, 3):
            P[a][b] = max(0.0, _chain_term(lam[a:b + 1], delta))
            acc += P[a][b]
        P[a][3] = max(0.0, 1.0 - acc)
    P[3][3] = 1.0
    return P


def _taylor_transition(rates, delta):
    """expm(QΔ) por escalado y cuadrado (triangular superior 4×4), con filas renormalizadas a 1."""
    norm = max(abs(r) for r in rates) * delta
    sq = 0
    while norm > 0.5:
        norm /= 2
        sq += 1
    h = delta / (2 ** sq)
    Q = generator(rates)
    A = [[Q[i][j] * h for j in range(4)] for i in range(4)]
    E = [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]
    term = [row[:] for row in E]
    for k in range(1, 13):
        term = [[sum(term[i][m] * A[m][j] for m in range(i, j + 1)) / k if j >= i else 0.0 for j in range(4)] for i in range(4)]
        E = [[E[i][j] + term[i][j] for j in range(4)] for i in range(4)]
    for _ in range(sq):
        E = [[sum(E[i][m] * E[m][j] for m in range(i, j + 1)) if j >= i else 0.0 for j in range(4)] for i in range(4)]
    for i in range(4):
        tot = sum(E[i])
        E[i] = [max(0.0, x) / tot for x in E[i]]
    return E


def rates_for(gamma_s, gamma_w, w, kappa_action=0.0):
    """λ_s = (1 − κ_a) · exp(γ_s + γ_wᵀ w)."""
    eff = sum(g * x for g, x in zip(gamma_w, w))
    return [(1.0 - kappa_action) * math.exp(gs + eff) for gs in gamma_s]


def step(pi, P):
    return [sum(pi[i] * P[i][j] for i in range(4)) for j in range(4)]


def propagate(pi, gamma_s, gamma_w, weeks, kappa_action=0.0, kappa_weeks=0.0):
    """π_T = π0 · ∏_i expm(Q(w_i)·Δ_i). weeks = [(w_i, Δ_i), ...] en orden temporal.
    El efecto sostenido de una acción (κ_a) dura kappa_weeks semanas desde el inicio."""
    t = 0.0
    out = list(pi)
    for w, d in weeks:
        if d <= 0:
            continue
        on = max(0.0, min(d, kappa_weeks - t))   # parte del tramo con efecto
        if on > 0:
            out = step(out, transition(rates_for(gamma_s, gamma_w, w, kappa_action), on))
        off = d - on
        if off > 0:
            out = step(out, transition(rates_for(gamma_s, gamma_w, w), off))
        t += d
    return out


def expm_reference(Q, delta, order=18, squarings=8):
    """expm por escalado y cuadrado con Taylor (solo para verificar la forma cerrada en las pruebas)."""
    n = len(Q)
    A = [[Q[i][j] * delta / (2 ** squarings) for j in range(n)] for i in range(n)]
    E = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    term = [row[:] for row in E]
    for k in range(1, order + 1):
        term = [[sum(term[i][m] * A[m][j] for m in range(n)) / k for j in range(n)] for i in range(n)]
        E = [[E[i][j] + term[i][j] for j in range(n)] for i in range(n)]
    for _ in range(squarings):
        E = [[sum(E[i][m] * E[m][j] for m in range(n)) for j in range(n)] for i in range(n)]
    return E


def generator(rates):
    Q = [[0.0] * 4 for _ in range(4)]
    for s, r in enumerate(rates):
        Q[s][s] = -r
        Q[s][s + 1] = r
    return Q
