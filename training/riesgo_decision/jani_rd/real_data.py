"""Calibración con datos reales públicos.

1. Dinámica de la roya: Lasso, Virginio Filho, Corrales et al. (2020), Mendeley wpy54dw6t7 (CC BY 4.0). Incidencia de
   roya (% de hojas con roya) hoy y 14 días después, con el clima de los 14 días previos, en 4 parcelas
   (sombra × manejo). Como π_0 = 1 − incidencia y el estado 0 solo se abandona a tasa λ_0:
       (1 − I_{t+Δ}) / (1 − I_t) = exp(−λ_0(w) Δ),   λ_0 = exp(γ_0 + γ_wᵀ w + nuisance)
   Se estima γ_0 (=> τ_0) y γ_w por mínimos cuadrados con encogimiento N(0,1) en γ_w, y la incertidumbre por bootstrap
   de fechas en bloques. Supuesto A5': γ_w actúa sobre anomalías estandarizadas del clima del lugar y se aplica a
   todas las transiciones (solo la de infección es observable con incidencia).
2. Clima semanal normal por región: NASA POWER (diario, comunidad AG), T2M_MAX, RH2M, PRECTOTCORR.
3. Eficacia relativa de productos: USDA ARS, Hawái 2022–23 (CC0, doi 10.15482/USDA.ADC/28518353.v1). Solo indicio.
"""
import json
import math
import urllib.request

import numpy as np
import pandas as pd
from scipy.optimize import least_squares
from sklearn.linear_model import LinearRegression

DELTA_WEEKS = 2.0
FEATS = {"tmax": "tMax14-1", "hr": "hAvg14-1", "lluvia": "pre14-1"}


def load_rust(path):
    d = pd.read_csv(path)
    wcols = [c for c in d.columns if "14-1" in c]
    d["date"] = (d[wcols].diff().abs().sum(axis=1) > 0).cumsum()
    return d


def _design(d, mean, sd):
    Z = np.column_stack([(d[c] - mean[i]) / sd[i] for i, c in enumerate(FEATS.values())])
    N = np.column_stack([d["shade"] - 0.5, d["management"] - 0.5])
    return Z, N


def fit_rust_dynamics(d, mean, sd, gw_sd=1.0):
    """MAP: residuos de log-razón con ruido gaussiano σ (estimado en dos pasadas) + prior N(0, gw_sd²) en γ_w."""
    Z, N = _design(d, mean, sd)
    I0 = d["cCLRI"].to_numpy() / 100
    I1 = d["pCLRI"].to_numpy() / 100
    y = np.log(np.clip(1 - I1, 1e-4, 1) / np.clip(1 - I0, 1e-4, 1))       # = −λ0 Δ + ruido

    def fit(sigma, x0):
        def resid(x):
            lam = np.exp(x[0] + Z @ x[1:4] + N @ x[4:6])
            return np.concatenate([(y + lam * DELTA_WEEKS) / sigma, x[1:4] / gw_sd])
        return least_squares(resid, x0).x

    x = fit(max(float(np.std(y)), 1e-6), np.array([np.log(0.02), 0, 0, 0, 0, 0]))
    lam = np.exp(x[0] + Z @ x[1:4] + N @ x[4:6])
    sigma = max(float(np.std(y + lam * DELTA_WEEKS)), 1e-6)
    return fit(sigma, x)


def predict_incidence(x, d, mean, sd):
    Z, N = _design(d, mean, sd)
    lam = np.exp(x[0] + Z @ x[1:4] + N @ x[4:6])
    return 100 * (1 - (1 - d["cCLRI"].to_numpy() / 100) * np.exp(-lam * DELTA_WEEKS))


def evaluate_vs_baselines(d, frac_train=0.7):
    """Regla de parada (§7): el modelo debe superar líneas base simples fuera de muestra (corte temporal)."""
    dates = sorted(d["date"].unique())
    cut = dates[int(len(dates) * frac_train)]
    tr, te = d[d["date"] < cut], d[d["date"] >= cut]
    mean = [tr[c].mean() for c in FEATS.values()]
    sd = [tr[c].std() for c in FEATS.values()]
    x = fit_rust_dynamics(tr, mean, sd)
    mae = lambda p: float(np.mean(np.abs(np.asarray(p) - te["pCLRI"].to_numpy())))
    feats = list(FEATS.values()) + ["cCLRI", "shade", "management"]
    lin = LinearRegression().fit(tr[feats], tr["pCLRI"])
    return {"mae_markov": mae(predict_incidence(x, te, mean, sd)), "mae_persistencia": mae(te["cCLRI"]),
            "mae_regresion_lineal": mae(lin.predict(te[feats])), "n_train": int(len(tr)), "n_test": int(len(te)),
            "fechas_train": int(len([x for x in dates if x < cut])), "fechas_test": int(len([x for x in dates if x >= cut]))}


def rust_posterior(d, S=200, block=5, seed=0):
    """Ajuste con todos los datos + bootstrap de bloques de fechas -> draws de γ0 (=> log τ0) y γ_w."""
    mean = [d[c].mean() for c in FEATS.values()]
    sd = [d[c].std() for c in FEATS.values()]
    x = fit_rust_dynamics(d, mean, sd)
    dates = np.array(sorted(d["date"].unique()))
    blocks = [dates[i:i + block] for i in range(0, len(dates), block)]
    rng = np.random.default_rng(seed)
    draws = []
    for _ in range(S):
        pick = rng.integers(0, len(blocks), size=len(blocks))
        sel = np.concatenate([blocks[i] for i in pick])
        db = pd.concat([d[d["date"] == t] for t in sel])
        draws.append(fit_rust_dynamics(db, mean, sd))
    draws = np.array(draws)
    return {"x": x, "draws": draws, "mean": mean, "sd": sd,
            "tau0_weeks": float(math.exp(-x[0])), "gamma_w": x[1:4].tolist(), "nuisance_shade_mgmt": x[4:6].tolist()}


# ---------------- Clima semanal (NASA POWER) ----------------
POWER = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,RH2M,PRECTOTCORR&community=AG"
         "&longitude={lon}&latitude={lat}&start={start}&end={end}&format=JSON")


def nasa_daily(lat, lon, start="20010101", end="20241231"):
    with urllib.request.urlopen(POWER.format(lat=lat, lon=lon, start=start, end=end), timeout=300) as r:
        p = json.load(r)["properties"]["parameter"]
    df = pd.DataFrame({"tmax": p["T2M_MAX"], "hr": p["RH2M"], "lluvia": p["PRECTOTCORR"]})
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    return df.replace(-999.0, np.nan).dropna()


def weekly_climate(df):
    """Medias semanales por año -> normal por semana del año (1..52) y su anomalía estandarizada respecto al lugar."""
    wk = df.copy()
    wk["year"] = wk.index.year
    wk["week"] = np.minimum(((wk.index.dayofyear - 1) // 7) + 1, 52)
    per_year = wk.groupby(["year", "week"])[["tmax", "hr", "lluvia"]].mean()
    mu, sd = per_year.mean(), per_year.std()
    normal = per_year.groupby("week").mean()
    z = (normal - mu) / sd
    return {"weekly_mean": normal.round(3).values.tolist(), "weekly_z": z.round(4).values.tolist(),
            "site_mean": mu.round(3).tolist(), "site_sd_weekly": sd.round(3).tolist(),
            "years": [int(wk["year"].min()), int(wk["year"].max())]}


# ---------------- Eficacia relativa (USDA) ----------------
def usda_relative_growth(path):
    d = pd.read_csv(path)
    d.columns = [c.strip() for c in d.columns]
    d["Product"] = d["Product"].replace({"Serenede": "Serenade"})
    out = {}
    for prod, g in d.groupby("Product"):
        slopes = []
        for _, gg in g.groupby(["Year", "Farm", "Spray"]):
            m = gg.groupby("Week")["Incidence"].mean()
            if len(m) >= 3:
                p = np.clip(m.values / 100, 0.005, 0.995)
                slopes.append(np.polyfit(m.index.values, np.log(p / (1 - p)), 1)[0])
        out[prod] = float(np.mean(slopes)) if slopes else None
    return out
