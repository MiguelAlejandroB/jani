"""Modelo de RIESGO (manual §2): capas M (medición), D (dinámica), L (daño), U (incertidumbre) + envoltura conforme.

Salida: partículas con peso (la "creencia" que usa DECISIÓN) y resúmenes P10/P50/P90, CVaR10, P(ℓ > ℓ*).
Varias enfermedades: una cadena por enfermedad y pérdida combinada 1 − ℓ = ∏ (1 − ℓ_k) (supuesto A12).
"""
import math
from . import markov
from .rng import Rng

EPS = 1e-6
DISEASE_ORDER = ("roya", "minador", "phoma", "cercospora")


def particle_stream(seed, i, salt):
    """Secuencia aleatoria fija para la partícula i (números aleatorios comunes entre escenarios y acciones)."""
    return Rng((seed * 1000003 + i * 7919 + salt * 104729) & 0xFFFFFFFF)


def predicted_obs(pi, lam):
    """(Λᵀ π)_ŝ = Σ_s π_s Λ[s, ŝ]."""
    return [sum(pi[s] * lam[s][j] for s in range(4)) for j in range(4)]


def log_lik(pi, counts, lam):
    """Verosimilitud atemperada (§2.2): (m_eff/m) · [Σ_s n̂_s log(Λᵀπ)_s + n_cens · log Σ_{ŝ≥1} (Λᵀπ)_ŝ]."""
    if counts.m == 0:
        return 0.0
    q = predicted_obs(pi, lam)
    ll = sum(n * math.log(max(q[s], 1e-300)) for s, n in enumerate(counts.n) if n)
    if counts.n_censored:
        ll += counts.n_censored * math.log(max(q[1] + q[2] + q[3], 1e-300))
    return (counts.m_eff / counts.m) * ll


def weighted_quantile(values, weights, q):
    order = sorted(range(len(values)), key=lambda i: values[i])
    tot = sum(weights)
    acc = 0.0
    for i in order:
        acc += weights[i]
        if acc >= q * tot - 1e-12:
            return values[i]
    return values[order[-1]]


def cvar_upper(values, weights, alpha):
    """Media de los valores en la peor cola de probabilidad alpha (para pérdidas: la cola alta)."""
    order = sorted(range(len(values)), key=lambda i: -values[i])
    tot = sum(weights)
    need = alpha * tot
    acc = 0.0
    s = 0.0
    for i in order:
        take = min(weights[i], need - acc)
        if take <= 0:
            break
        s += take * values[i]
        acc += take
    return s / acc if acc > 0 else values[order[0]]


def systematic_resample(weights, rng):
    n = len(weights)
    tot = sum(weights)
    step = tot / n
    u0 = rng.u() * step
    idx, acc, j = [], weights[0], 0
    for i in range(n):
        target = u0 + i * step
        while acc < target and j < n - 1:
            j += 1
            acc += weights[j]
        idx.append(j)
    return idx


def beta_sample(rng, mu, kappa):
    mu = min(max(mu, EPS), 1 - EPS)
    return rng.beta(mu * kappa, (1 - mu) * kappa)


def init_particles(counts, params, rng, n):
    """Pasos 1–3 de §2.3: π0 ~ Dirichlet(α0), parámetros de los draws posteriores, pesos por la capa M, ESS."""
    k = counts.disease
    pri = params["prior_pi0"]
    alpha = [pri["strength"] * x for x in pri["regional"][k]]
    draws = params["draws"][k]
    S = len(draws["log_tau"])
    lam = params["lambda"]
    parts = []
    for i in range(n):
        pi0 = rng.dirichlet(alpha)
        d = int(rng.u() * S)
        parts.append({"pi0": pi0, "d": d, "logw": log_lik(pi0, counts, lam)})
    mx = max(p["logw"] for p in parts)
    w = [math.exp(p["logw"] - mx) for p in parts]
    tot = sum(w)
    w = [x / tot for x in w]
    ess = 1.0 / sum(x * x for x in w)
    flags = []
    if ess < 0.2 * n:
        flags.append("ess_bajo")
        idx = systematic_resample(w, rng)
        parts = [dict(parts[i]) for i in idx]
        w = [1.0 / n] * n
    for p, x in zip(parts, w):
        p["w"] = x
    return parts, ess, flags


def damage_params(params, disease, d):
    dr = params["draws"][disease]
    gamma_s = [-x for x in dr["log_tau"][d]]          # γ_s = −log τ_s
    return gamma_s, dr["gamma_w"][d], [0.0] + list(dr["g"][d]), dr["kappa"][d]


def harvest_pi(part, params, disease, weeks, action=None):
    """π en cosecha para una partícula; action = {'d': d_a, 'kappa': κ_a, 'kappa_weeks': ...} opcional (DECISIÓN)."""
    gamma_s, gamma_w, _, _ = damage_params(params, disease, part["d"])
    pi = part["pi0"]
    if action:
        pi = apply_immediate(pi, action.get("d", 0.0))
        return markov.propagate(pi, gamma_s, gamma_w, weeks, action.get("kappa", 0.0), action.get("kappa_weeks", 0.0))
    return markov.propagate(pi, gamma_s, gamma_w, weeks)


def apply_immediate(pi, d_a):
    """π' = π · T_a, con T_a[s, s−1] = d_a (s ≥ 1), T_a[s, s] = 1 − d_a (§3.2): retira unidades afectadas."""
    if d_a <= 0:
        return list(pi)
    out = [0.0] * 4
    out[0] = pi[0] + d_a * pi[1]
    for s in (1, 2):
        out[s] = (1 - d_a) * pi[s] + d_a * pi[s + 1]
    out[3] = (1 - d_a) * pi[3]
    return out


def loss_from_pi(piT, g):
    return min(max(sum(p * gs for p, gs in zip(piT, g)), EPS), 1 - EPS)


def run_risk(chains, params, weeks_z, y0_kg, seed=1, n=None):
    """chains: {enfermedad: ChainCounts} del adaptador.
    weeks_z: [(anomalía climática estandarizada [tmax, hr, lluvia], Δ semanas)] desde hoy hasta la cosecha:
    cuánto se aleja cada semana de lo normal EN ESE LUGAR (z), igual que en la calibración (supuesto A5').
    y0_kg: rendimiento potencial esperado del lote (kg). Devuelve el dict de salida del contrato §2.5."""
    n = n or params["particles"]
    rng = Rng(seed)
    weeks = [(list(w), d) for w, d in weeks_z]
    flags = set()
    rng_sd = params["climate"]["range_sd"]
    if any(abs(x) > rng_sd for w, _ in weeks for x in w):
        flags.add("clima_fuera_de_rango")
    per_disease = {}
    for k, cc in chains.items():
        flags.update(cc.flags)
        parts, ess, f = init_particles(cc, params, rng, n)
        flags.update(f)
        lam = params["lambda"]
        for s in range(4):
            relevant = cc.n[s] > 0 or (s >= 1 and cc.n_censored > 0)
            if relevant and lam[s][s] <= 0.5:
                flags.add("detector_no_corregible")
        for i, p in enumerate(parts):
            _, _, g, kappa = damage_params(params, k, p["d"])
            p["pi_T"] = harvest_pi(p, params, k, weeks)
            p["mu"] = loss_from_pi(p["pi_T"], g)
            # Secuencia propia por partícula (la misma que usa DECISIÓN): resultados comparables entre escenarios.
            p["ell"] = beta_sample(particle_stream(seed, i, 3 + DISEASE_ORDER.index(k)), p["mu"], kappa)
        per_disease[k] = {"particles": parts, "ess": ess}
    sd_y = params["yield"]["sd_log"]
    y0 = [y0_kg * math.exp(sd_y * rng.normal() - 0.5 * sd_y * sd_y) for _ in range(n)]
    if per_disease:
        ks = list(per_disease)
        w = [1.0] * n
        ell = [0.0] * n
        for i in range(n):
            keep = 1.0
            for k in ks:
                p = per_disease[k]["particles"][i]
                w[i] *= p["w"]
                keep *= 1 - p["ell"]
            ell[i] = 1 - keep
        tot = sum(w)
        w = [x / tot for x in w]
    else:
        w, ell = [1.0 / n] * n, [0.0] * n
    Y = [y0[i] * (1 - ell[i]) for i in range(n)]
    star = params["loss_threshold"]
    q = params["conformal"]["q_frac"] * y0_kg
    yq = [weighted_quantile(Y, w, a) for a in (0.1, 0.5, 0.9)]
    out = {
        "ell": {"p10": weighted_quantile(ell, w, 0.1), "p50": weighted_quantile(ell, w, 0.5),
                "p90": weighted_quantile(ell, w, 0.9), "cvar10": cvar_upper(ell, w, 0.1),
                "p_sobre_umbral": sum(x for x, e in zip(w, ell) if e > star)},
        "Y": {"p10": yq[0], "p50": yq[1], "p90": yq[2], "conforme": [max(0.0, yq[0] - q), yq[2] + q]},
        "banderas": sorted(flags | evidence_flags(params, chains)),
        "evidencia": evidence_summary(params, chains),
        "weights": w, "ell_samples": ell, "y0": y0, "per_disease": per_disease, "weeks": weeks,
    }
    return out


def evidence_summary(params, chains):
    ev = {}
    for k in chains:
        ev[k] = params["evidence"][k]
    return {"por_enfermedad": ev, "lambda": params["lambda_evidence"], "conforme": params["conformal"]["evidence"]}


def evidence_flags(params, chains):
    f = set()
    if any(v == "prior" for k in chains for v in params["evidence"][k].values()):
        f.add("parametros_prior")
    if params.get("calibration_age_days", 0) > 365:
        f.add("calibracion_vieja")
    return f
