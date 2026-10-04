"""Pipeline de calibración (manual §2.4): estima Λ, τ_s, γ_w, g, κ, Ŷ0 y el ancho conforme Q̂.

Truco de identificación (§2.4): la dinámica (τ_s, γ_w) se estima con visitas repetidas, sin cosecha; el daño g se
estima con la última visita antes de cosecha (Δ ≈ 0), donde la dinámica casi no influye.
"""
import math

import numpy as np
from scipy.optimize import least_squares, minimize

from .calib_math import transition_np
from .params import g_from_increments, increments_from_g


# ---------------- Λ ----------------
def estimate_lambda(counts, a=1.0):
    """Λ̂[s, ŝ] = (n_sŝ + a) / (n_s + 4a). Devuelve (Λ̂, niveles bloqueados por Λ̂[s,s] <= 0,5)."""
    counts = np.asarray(counts, float)
    lam = (counts + a) / (counts.sum(1, keepdims=True) + 4 * a)
    blocked = [s for s in range(4) if lam[s, s] <= 0.5]
    return lam, blocked


# ---------------- Dinámica (τ_s, γ_w) ----------------
def _softmax_rows(x):
    x = np.concatenate([np.zeros((x.shape[0], 1)), x], 1)
    x = x - x.max(1, keepdims=True)
    e = np.exp(x)
    return e / e.sum(1, keepdims=True)


def fit_dynamics(lots, Lam, prior_log_tau, prior_sd, gw_sd=1.0, S=200, seed=0, rounds=4):
    """MAP de (log τ_0..2, γ_w) con la verosimilitud de conteos por visita (Λ conocida) y π inicial por lote como
    parámetro de estorbo. Cada visita muestrea hojas nuevas, así que los conteos de visitas distintas son
    condicionalmente independientes dada la trayectoria de π del lote.
    Optimización por bloques: (a) parámetros globales con los π iniciales fijos; (b) π inicial de cada lote con los
    globales fijos (problemas pequeños e independientes). Incertidumbre: aproximación de Laplace en los globales."""
    Lam = np.asarray(Lam)
    J = len(lots)
    W = max(max(t for t, _ in L["visits"]) for L in lots) + 1
    Z = np.stack([L["z"][:W] for L in lots])                 # (J, W, F)
    F = Z.shape[2]
    counts = np.zeros((J, W, 4))
    for j, L in enumerate(lots):
        for t, c in L["visits"]:
            counts[j, t] += c
    prior_log_tau = np.asarray(prior_log_tau, float)
    prior_sd = np.asarray(prior_sd, float)

    def loglik_lots(log_tau, gw, lp, rows=slice(None)):
        pi = _softmax_rows(lp)
        Zr, Cr = Z[rows], counts[rows]
        ll = np.zeros(pi.shape[0])
        for t in range(W):
            q = pi @ Lam
            ll += (Cr[:, t] * np.log(np.clip(q, 1e-300, None))).sum(1)
            rates = np.exp(-log_tau[None, :] + (Zr[:, t] @ gw)[:, None])
            pi = np.einsum("ni,nij->nj", pi, transition_np(rates, 1.0))
        return ll

    def prior_term(g):
        return 0.5 * (((g[:3] - prior_log_tau) / prior_sd) ** 2).sum() + 0.5 * ((g[3:] / gw_sd) ** 2).sum()

    # Arranque: π inicial = proporción corregida de la primera visita (aprox. válida si la visita es temprana).
    lp = np.zeros((J, 3))
    for j, L in enumerate(lots):
        pi0 = np.clip(pi_from_counts(L["visits"][0][1], Lam), 1e-4, None)
        lp[j] = np.log(pi0[1:] / pi0[0])
    g = np.concatenate([prior_log_tau, np.zeros(F)])
    for _ in range(rounds):
        res = minimize(lambda x: -loglik_lots(x[:3], x[3:], lp).sum() + prior_term(x), g, method="BFGS")
        g = res.x
        for j in range(J):
            rj = minimize(lambda x: -loglik_lots(g[:3], g[3:], x[None, :], rows=slice(j, j + 1))[0], lp[j], method="BFGS")
            lp[j] = rj.x
    final = minimize(lambda x: -loglik_lots(x[:3], x[3:], lp).sum() + prior_term(x), g, method="BFGS")
    g = final.x
    H = _num_hessian(lambda x: -loglik_lots(x[:3], x[3:], lp).sum() + prior_term(x), g)
    cov = _safe_inv(H)
    rng = np.random.default_rng(seed)
    draws = rng.multivariate_normal(g, cov, size=S)
    return {"log_tau": g[:3], "gamma_w": g[3:], "cov": cov, "draws_log_tau": draws[:, :3], "draws_gamma_w": draws[:, 3:],
            "converged": bool(final.success or np.linalg.norm(final.jac) < 1e-2), "nll": float(final.fun)}


def _num_hessian(f, x, h=1e-3):
    n = len(x)
    H = np.zeros((n, n))
    fx = f(x)
    for i in range(n):
        for j in range(i, n):
            e_i = np.zeros(n); e_i[i] = h
            e_j = np.zeros(n); e_j[j] = h
            H[i, j] = H[j, i] = (f(x + e_i + e_j) - f(x + e_i - e_j) - f(x - e_i + e_j) + f(x - e_i - e_j)) / (4 * h * h)
    return H


def _safe_inv(H):
    w, V = np.linalg.eigh((H + H.T) / 2)
    w = np.clip(w, 1e-6, None)
    return (V / w) @ V.T


# ---------------- π corregido por el detector ----------------
def pi_from_counts(counts, Lam, iters=200):
    """MLE de π con conteos detectados y Λ (EM). Con Λ = I es la proporción observada."""
    Lam = np.asarray(Lam)
    c = np.asarray(counts, float)
    pi = np.full(4, 0.25)
    for _ in range(iters):
        q = pi @ Lam
        resp = (pi[:, None] * Lam) / np.clip(q[None, :], 1e-300, None)   # P(real s | detectado ŝ)
        pi = (resp * c[None, :]).sum(1)
        pi = pi / pi.sum()
    return pi


# ---------------- Daño g y rendimiento potencial (panel) ----------------
def fit_damage_panel(rows, Lam, g_prior=(0.02, 0.10, 0.30), S=200, seed=0):
    """log Y_jt = α_j + δ_{c,t} + log(1 − μ_jt(g)) + u. μ_jt = π̂_jt · [0, g1, g2, g3], g monótona por construcción.
    Errores por bootstrap de lotes (agrupado por lote). Devuelve g, κ (momentos), α, δ y draws de g."""
    lots = sorted({r["lot"] for r in rows})
    cells = sorted({(r["coop"], r["season"]) for r in rows})
    li = {l: i for i, l in enumerate(lots)}
    ci = {c: i for i, c in enumerate(cells)}
    pis = np.array([pi_from_counts(r["counts"], Lam) for r in rows])
    logY = np.log([r["Y"] for r in rows])
    L_idx = np.array([li[r["lot"]] for r in rows])
    C_idx = np.array([ci[(r["coop"], r["season"])] for r in rows])

    def fit(sel):
        nl, nc = len(lots), len(cells)

        def resid(x):
            a = x[:3]
            alpha = x[3:3 + nl]
            delta = np.concatenate([[0.0], x[3 + nl:3 + nl + nc - 1]])
            g = np.array([0.0, *g_from_increments(*a)])
            mu = np.clip(pis[sel] @ g, 1e-6, 1 - 1e-6)
            return logY[sel] - (alpha[L_idx[sel]] + delta[C_idx[sel]] + np.log(1 - mu))

        x0 = np.concatenate([increments_from_g(*g_prior), np.full(nl, logY.mean()), np.zeros(nc - 1)])
        r = least_squares(resid, x0)
        return r.x

    x = fit(np.arange(len(rows)))
    g = g_from_increments(*x[:3])
    nl = len(lots)
    alpha = x[3:3 + nl]
    delta = np.concatenate([[0.0], x[3 + nl:]])
    y0_hat = np.exp(alpha[L_idx] + delta[C_idx])
    mu = np.clip(pis @ np.array([0.0, *g]), 1e-6, 1 - 1e-6)
    ell_hat = 1 - np.exp(logY) / y0_hat
    var_res = float(np.var(ell_hat - mu))
    kappa = max(2.0, float(np.mean(mu * (1 - mu)) / max(var_res, 1e-9) - 1))
    rng = np.random.default_rng(seed)
    draws = []
    for _ in range(S):
        boot_lots = rng.choice(len(lots), size=len(lots), replace=True)
        sel = np.concatenate([np.where(L_idx == b)[0] for b in boot_lots])
        try:
            xb = fit(sel)
            draws.append(g_from_increments(*xb[:3]))
        except Exception:
            continue
    return {"g": g, "kappa": kappa, "y0_hat": y0_hat, "draws_g": np.array(draws)}


# ---------------- Conforme ----------------
def conformal_q(q10, q90, y, alpha=0.2):
    """Q̂ = cuantil ⌈(n+1)(1−α)⌉/n de S_i = max(q10_i − Y_i, Y_i − q90_i) (CQR)."""
    s = np.maximum(np.asarray(q10) - y, np.asarray(y) - np.asarray(q90))
    n = len(s)
    k = min(n, math.ceil((n + 1) * (1 - alpha)))
    return float(np.sort(s)[k - 1])
