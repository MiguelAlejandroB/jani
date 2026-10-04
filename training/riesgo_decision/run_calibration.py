"""Calibración local de RIESGO y DECISIÓN -> paquete de parámetros para el teléfono (manual §8).

Uso (desde training/riesgo_decision):
    ..\\..\\.venv\\Scripts\\python run_calibration.py --rust <CLRI_14D.csv> --usda <Fungicides.csv> [--lambda <lambda.json>]

Salidas:
    app/public/models/riesgo-v1/params.json      paquete de parámetros versionado (lo carga la app)
    data/calibration_report.json                 qué se estimó con datos, qué quedó en prior y por qué
    app/src/tests/fixtures/golden_rd.json        vectores dorados para verificar la app (TypeScript) contra Python
"""
import argparse
import datetime as dt
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jani_rd import real_data as rd  # noqa: E402
from jani_rd.adapter import adapt  # noqa: E402
from jani_rd.decision import decide  # noqa: E402
from jani_rd.demo_catalog import demo_catalog  # noqa: E402
from jani_rd.params import default_params  # noqa: E402
from jani_rd.risk import run_risk  # noqa: E402
from jani_rd.rng import Rng  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_PARAMS = os.path.join(ROOT, "app", "public", "models", "riesgo-v1", "params.json")
OUT_GOLDEN = os.path.join(ROOT, "app", "src", "tests", "fixtures", "golden_rd.json")
OUT_REPORT = os.path.join(os.path.dirname(__file__), "data", "calibration_report.json")


def rounded(x, nd=6):
    if isinstance(x, float):
        return round(x, nd)
    if isinstance(x, dict):
        return {k: rounded(v, nd) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [rounded(v, nd) for v in x]
    return x


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rust", required=True)
    ap.add_argument("--usda", required=True)
    ap.add_argument("--lambda_json", default=None, help="Λ estimada con la segmentación (calibrate_lambda.py)")
    a = ap.parse_args()

    P = default_params(S=200)
    today = dt.date.today().isoformat()
    P["version"] = f"{today}-v1"
    P["calibration_date"] = today
    report = {"fecha": today, "estimado_con_datos": [], "prior": [], "hallazgos": []}

    # 1) Roya: dinámica con el ensayo CATIE (Mendeley). Regla de parada §7 y supuesto A4.
    d = rd.load_rust(a.rust)
    val = rd.evaluate_vs_baselines(d)
    post = rd.rust_posterior(d, S=200)
    decreases = float((d["pCLRI"] < d["cCLRI"]).mean())
    beats = val["mae_markov"] < min(val["mae_persistencia"], val["mae_regresion_lineal"])
    report["roya_dinamica"] = {"validacion_fuera_de_muestra": val, "supera_lineas_base": beats,
                               "fraccion_de_bajadas_14d": decreases,
                               "ajuste_solo_datos": {"tau0_semanas": post["tau0_weeks"], "gamma_w": post["gamma_w"]},
                               "fuente": "Lasso et al. 2020, Mendeley wpy54dw6t7 (CC BY 4.0)"}
    if decreases > 0.2:
        report["hallazgos"].append(
            f"Supuesto A4 (cadena solo ascendente) violado en datos de campo: la incidencia baja en {decreases:.0%} de los "
            "intervalos de 14 días (renovación foliar). τ0 y γ_w de roya se mantienen en prior; el ajuste queda como indicio. "
            "Recomendación al matemático: añadir una tasa de renovación foliar al modelo.")
    if not beats:
        P["modo"] = {"recomendacion_automatica": False,
                     "razon": "regla_de_parada_s7: el riesgo no supera a una línea base simple fuera de muestra"}
        report["hallazgos"].append("Regla de parada §7 activa: modo informativo (sin recomendación automática).")
    else:
        P["modo"] = {"recomendacion_automatica": True, "razon": None}

    # 2) Clima semanal (NASA POWER) — va a los paquetes, aquí solo se registra.
    clima_path = os.path.join(os.path.dirname(__file__), "data", "clima_semanal.json")
    if os.path.exists(clima_path):
        report["estimado_con_datos"].append("clima semanal normal por región (NASA POWER)")

    # 3) Eficacia relativa (USDA) como indicio para κ_a.
    report["usda_pendiente_logit_incidencia_por_semana"] = rd.usda_relative_growth(a.usda)
    report["hallazgos"].append("USDA Hawái: productos convencionales (Priaxor) bajan la incidencia entre aspersiones; cobres "
                               "la mantienen; biológicos la dejan subir. Coincide con el orden de los priors del catálogo "
                               "(sistémico > cobre > biológico). Sin parcela sin tratar: solo cotas relativas.")

    # 4) Λ: segmentación si existe; si no, prior.
    if a.lambda_json and os.path.exists(a.lambda_json):
        lam = json.load(open(a.lambda_json, encoding="utf-8"))
        P["lambda"] = lam["lambda"]
        P["lambda_evidence"] = "estimado"
        P["lambda_source"] = lam.get("source")
        report["estimado_con_datos"].append("Λ (segmentación vs. máscaras de expertos BRACOL)")
        if lam.get("blocked"):
            report["hallazgos"].append(f"Niveles bloqueados por Λ[s,s] <= 0,5: {lam['blocked']}")
    else:
        report["prior"].append("Λ (falta el modelo de segmentación entrenado: correr calibrate_lambda.py)")

    report["prior"] += ["τ_s y γ_w de todas las enfermedades", "g (daño), κ, Ŷ0 (sin cosechas por lote)",
                        "ancho conforme (sin lotes con cosecha conocida)", "θ por categoría (sin elicitación)"]
    os.makedirs(os.path.dirname(OUT_PARAMS), exist_ok=True)
    json.dump(rounded(P), open(OUT_PARAMS, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    os.makedirs(os.path.dirname(OUT_REPORT), exist_ok=True)
    json.dump(rounded(report), open(OUT_REPORT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("parámetros:", OUT_PARAMS, f"({os.path.getsize(OUT_PARAMS) / 1024:.0f} KB)")
    print("informe:", OUT_REPORT)
    write_golden(rounded(P))


def write_golden(P):
    """Casos fijos con pocas partículas: la app (TypeScript) debe reproducirlos dentro de 1e-6."""
    r = Rng(12345)
    rng_seq = [r.u() for _ in range(5)] + [r.normal() for _ in range(3)] + [r.gamma(0.7), r.gamma(3.2), r.beta(2.0, 5.0)]
    from jani_rd import markov
    trans = markov.transition([0.12, 0.31, 0.2], 1.5)
    trans_eq = markov.transition([0.3, 0.3, 0.3], 1.0)
    weeks = [([0.2, 0.5, 0.7], 1.0)] * 10 + [([-0.3, -0.8, -0.4], 1.0)] * 8
    cases = []
    photos_a = ([{"clase": "roya", "p_clase": 0.92, "severidad": s, "p_calidad": 0.9} for s in (0.02, 0.06, 0.15, 0.35, None)]
                + [{"clase": "sana", "p_clase": 0.95, "severidad": 0.0, "p_calidad": 0.9}] * 5)
    photos_b = ([{"clase": "phoma", "p_clase": 0.8, "severidad": 0.12, "p_calidad": 0.8}] * 2
                + [{"clase": "roya", "p_clase": 0.85, "severidad": None, "p_calidad": 0.8}] * 3
                + [{"clase": "sana", "p_clase": 0.9, "severidad": 0.0, "p_calidad": 0.8}] * 5)
    econ = {"price_med": 20000.0, "price_age_weeks": 2, "wage": 60000.0, "monthly_rate": 0.02, "area_ha": 2.0,
            "harvest_season_t0": False, "harvest_season_t1": False}
    profile = {"certificaciones": [], "caja": 1500000, "credito": 1000000, "jornales_disponibles_semana": 20, "aversion": "intermedio"}
    for name, photos in (("roya_con_severidad", photos_a), ("roya_y_phoma_censurada", photos_b)):
        chains = adapt(photos, P)
        risk = run_risk(chains, P, weeks, 2000.0, seed=3, n=150)
        dec = decide(risk, chains, demo_catalog(), profile, econ, P, seed=9)
        cases.append({"name": name, "photos": photos, "weeks": weeks, "y0_kg": 2000.0, "n": 150, "seed_risk": 3, "seed_decision": 9,
                      "econ": econ, "profile": profile,
                      "chains": {k: {"n": c.n, "n_censored": c.n_censored, "m": c.m, "m_eff": c.m_eff, "flags": c.flags} for k, c in chains.items()},
                      "risk": {"ell": risk["ell"], "Y": risk["Y"], "banderas": risk["banderas"]},
                      "decision": {"alternativas": [{k: x.get(k) for k in ("id", "viable_hoy", "razon_no_viable", "margen", "perdida_pct",
                                                                            "costos", "costo_oportunidad", "no_se_justifica", "dominada_por")}
                                                    for x in dec["alternativas"]],
                                   "valor_de_remedir": dec["valor_de_remedir"], "costo_remedir": dec["costo_remedir"],
                                   "valor_de_esperar": dec["valor_de_esperar"], "recomendacion": dec["recomendacion"],
                                   "sensibilidad": dec["sensibilidad"], "theta": dec["theta"]}})
    golden = {"params_version": P["version"], "rng": rng_seq, "transition": trans, "transition_equal_rates": trans_eq,
              "catalog": demo_catalog(), "cases": cases}
    os.makedirs(os.path.dirname(OUT_GOLDEN), exist_ok=True)
    json.dump(rounded(golden, 12), open(OUT_GOLDEN, "w", encoding="utf-8"), ensure_ascii=False)
    print("vectores dorados:", OUT_GOLDEN)


if __name__ == "__main__":
    main()
