"""Generador de datos sintéticos (manual §10): lotes, clima, dinámica real, detector con Λ, panel de rendimiento.

Con parámetros verdaderos conocidos permite comprobar que la calibración los recupera (criterio S2) y que la
cobertura conforme es la nominal. Usa numpy (es parte del pipeline de calibración, no del teléfono).
"""
import numpy as np
from .calib_math import transition_np


def simulate_climate(rng, weeks, n_feat=3, phi=0.6):
    z = np.zeros((weeks, n_feat))
    for t in range(1, weeks):
        z[t] = phi * z[t - 1] + np.sqrt(1 - phi ** 2) * rng.standard_normal(n_feat)
    return z


def simulate_visits(rng, J, log_tau, gamma_w, Lam, weeks=30, visits=(3, 6), m=40):
    """Visitas repetidas a J lotes (fechas irregulares). En cada visita se muestrean m hojas nuevas: nivel real ~ π_t,
    nivel detectado ~ Λ[nivel real]. Devuelve lista de lotes con clima semanal y conteos por visita."""
    Lam = np.asarray(Lam)
    lots = []
    for _ in range(J):
        z = simulate_climate(rng, weeks)
        pi = rng.dirichlet([6, 2, 1, 0.5])
        k = rng.integers(visits[0], visits[1] + 1)
        times = np.sort(rng.choice(np.arange(0, weeks), size=k, replace=False))
        obs = []
        t_prev = 0
        cur = pi.copy()
        for t in times:
            for w in range(t_prev, t):
                rates = np.exp(-np.asarray(log_tau) + z[w] @ np.asarray(gamma_w))
                cur = cur @ transition_np(rates[None, :], 1.0)[0]
            t_prev = t
            true_lv = rng.choice(4, size=m, p=cur / cur.sum())
            det = np.array([rng.choice(4, p=Lam[s]) for s in true_lv])
            obs.append((int(t), np.bincount(det, minlength=4)))
        lots.append({"z": z, "pi_start": pi, "visits": obs})
    return lots


def simulate_panel(rng, J, C, seasons, g, kappa, Lam, m=60, sd_alpha=0.25, sd_delta=0.1):
    """Panel lote × temporada con efectos fijos de lote y choques cooperativa-año. La última visita antes de cosecha
    (Δ ≈ 0) da la distribución de niveles; el rendimiento es Y = exp(α_j + δ_ct) · (1 − ℓ), ℓ ~ Beta(μκ, (1−μ)κ)."""
    Lam = np.asarray(Lam)
    g_full = np.array([0.0, *g])
    coop = rng.integers(0, C, size=J)
    alpha = np.log(1000) + sd_alpha * rng.standard_normal(J)
    delta = sd_delta * rng.standard_normal((C, seasons))
    rows = []
    for j in range(J):
        for t in range(seasons):
            pi = rng.dirichlet([3, 2, 1.5, 1])
            true_lv = rng.choice(4, size=m, p=pi)
            det = np.array([rng.choice(4, p=Lam[s]) for s in true_lv])
            mu = float(np.clip(pi @ g_full, 1e-6, 1 - 1e-6))
            ell = rng.beta(mu * kappa, (1 - mu) * kappa)
            Y = np.exp(alpha[j] + delta[coop[j], t]) * (1 - ell)
            rows.append({"lot": j, "coop": int(coop[j]), "season": t, "counts": np.bincount(det, minlength=4),
                         "pi_true": pi, "Y": Y, "mu_true": mu, "Y0_true": float(np.exp(alpha[j] + delta[coop[j], t]))})
    return rows


def simulate_confusion(rng, Lam, n_per_level=300):
    """Conjunto 'etiquetado por expertos': n unidades por nivel real con la salida del detector."""
    Lam = np.asarray(Lam)
    counts = np.zeros((4, 4), int)
    for s in range(4):
        det = rng.choice(4, size=n_per_level, p=Lam[s])
        counts[s] = np.bincount(det, minlength=4)
    return counts
