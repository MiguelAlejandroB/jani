"""Paquete de parámetros por defecto (manual §8): todo PRIOR hasta que la calibración lo reemplace.

Los valores agronómicos aquí son puntos de partida marcados como 'prior' (criterio técnico/literatura), nunca datos
propios. La calibración (calibrate.py / run_calibration.py) sustituye lo que se pueda estimar con datos y actualiza
'evidence'. La app muestra la bandera 'parametros_prior' mientras quede algo en prior.
"""
import math
from .rng import Rng

DISEASES = ("roya", "minador", "phoma", "cercospora")
FEATURES = ("tmax", "hr", "lluvia")


def _logit(p):
    return math.log(p / (1 - p))


# Priors por enfermedad (semanas medias en cada estado con clima normal; daño g(1..3) como fracción de la cosecha).
PRIORS = {
    # Roya: periodo latente 19–60 días según temperatura (Cenicafé; UFV). Epidemias severas: 30–50 % de pérdida
    # (Avelino et al. 2015); pérdidas primarias 26 % y secundarias 38 % por plagas y enfermedades (Cerda et al. 2017).
    "roya": {"tau": (8.0, 4.0, 6.0), "tau_sd": (0.5, 0.4, 0.4), "g": (0.02, 0.10, 0.30), "regional": (0.60, 0.25, 0.10, 0.05)},
    "minador": {"tau": (12.0, 6.0, 8.0), "tau_sd": (0.6, 0.6, 0.6), "g": (0.01, 0.05, 0.15), "regional": (0.70, 0.20, 0.07, 0.03)},
    "phoma": {"tau": (12.0, 5.0, 7.0), "tau_sd": (0.6, 0.6, 0.6), "g": (0.02, 0.08, 0.20), "regional": (0.75, 0.17, 0.06, 0.02)},
    "cercospora": {"tau": (12.0, 6.0, 8.0), "tau_sd": (0.6, 0.6, 0.6), "g": (0.01, 0.06, 0.18), "regional": (0.70, 0.20, 0.07, 0.03)},
}
G_SD = 0.35          # dispersión de los logits incrementales de g
GAMMA_W_SD = 0.3     # efecto del clima: N(0, 0.3) por variable (encogimiento fuerte, manual §2.4)
KAPPA_PRIOR = (30.0, 0.3)   # precisión Beta de la pérdida: mediana 30, log-sd 0.3


def g_from_increments(a1, a2, a3):
    sig = lambda x: 1 / (1 + math.exp(-x))
    g1 = sig(a1)
    g2 = g1 + (1 - g1) * sig(a2)
    g3 = g2 + (1 - g2) * sig(a3)
    return [g1, g2, g3]


def increments_from_g(g1, g2, g3):
    return [_logit(g1), _logit((g2 - g1) / (1 - g1)), _logit((g3 - g2) / (1 - g2))]


def prior_draws(disease, S=200, seed=11):
    pr = PRIORS[disease]
    rng = Rng(seed + DISEASES.index(disease))
    inc = increments_from_g(*pr["g"])
    out = {"log_tau": [], "gamma_w": [], "g": [], "kappa": []}
    for _ in range(S):
        out["log_tau"].append([math.log(t) + sd * rng.normal() for t, sd in zip(pr["tau"], pr["tau_sd"])])
        out["gamma_w"].append([GAMMA_W_SD * rng.normal() for _ in FEATURES])
        out["g"].append(g_from_increments(*[a + G_SD * rng.normal() for a in inc]))
        out["kappa"].append(KAPPA_PRIOR[0] * math.exp(KAPPA_PRIOR[1] * rng.normal()))
    return out


LAMBDA_PRIOR = [[0.85, 0.15, 0.0, 0.0], [0.10, 0.80, 0.10, 0.0], [0.0, 0.10, 0.80, 0.10], [0.0, 0.0, 0.15, 0.85]]


def default_params(S=200):
    return {
        "version": "prior-v1",
        "levels": {"thresholds": {k: [0.01, 0.10, 0.30] for k in DISEASES},
                   "source": "Manual §1.2: sana < 1 %, leve 1–10 %, moderada 10–30 %, severa > 30 % (a validar con extensión)"},
        "lambda": LAMBDA_PRIOR, "lambda_evidence": "prior",
        "adapter": {"p_class_min": 0.5, "p_quality_min": 0.2, "rho": 0.3, "units_per_plant": 1, "min_m_eff": 8},
        "prior_pi0": {"strength": 4.0, "regional": {k: list(PRIORS[k]["regional"]) for k in DISEASES}},
        "climate": {"features": list(FEATURES), "range_sd": 2.5,
                    "transfer": "anomalías respecto a lo normal del lugar (supuesto A5')"},
        "draws": {k: prior_draws(k, S) for k in DISEASES},
        "evidence": {k: {"tau0": "prior", "tau12": "prior", "gamma_w": "prior", "g": "prior", "kappa": "prior"} for k in DISEASES},
        "yield": {"sd_log": 0.25, "evidence": "prior"},
        "conformal": {"q_frac": 0.25, "evidence": "default"},
        "loss_threshold": 0.10,
        "particles": 1000,   # manual §2.3 sugiere ~2.000; 1.000 da cuantiles estables y cabe en un teléfono de gama baja
        "decision": {"delta_weeks": 3, "m1": 10, "obs_bins": [0.1, 0.3],
                     "theta_r": {"prudente": 3.0, "intermedio": 1.0, "arriesgado": 0.3}, "theta_default": "intermedio",
                     "remeasure_labor_days": 0.25, "harvest_wage_factor": 1.5, "price_sd": 0.12,
                     "price_age_widen_per_week": 0.01, "own_capital_rate_monthly": 0.005,
                     "f3_min_prob_better": 0.2, "max_shown": 4},
        # Visualización (no son datos agronómicos): bandas de la probabilidad de pérdida grande (> loss_threshold)
        # para el semáforo/cereza: < 0,33 bajo, < 0,66 medio, si no alto.
        "display": {"risk_bands": [0.33, 0.66]},
        "calibration_age_days": 0,
    }
