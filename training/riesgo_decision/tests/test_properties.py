"""Pruebas obligatorias del manual: §2.7 (RIESGO) y §3.6 (DECISIÓN), más contratos del adaptador y del catálogo."""
import copy
import math

import pytest

from jani_rd import markov
from jani_rd.adapter import ChainCounts, adapt, level_of
from jani_rd.catalog import validate_catalog
from jani_rd.decision import ce, decide, ssd_dominates
from jani_rd.demo_catalog import demo_catalog
from jani_rd.params import default_params
from jani_rd.risk import run_risk
from jani_rd.rng import Rng

N = 300  # partículas en pruebas (rápidas); la app usa 2.000


@pytest.fixture(scope="module")
def P():
    return default_params(S=100)


def weeks(n=20, z=(0.0, 0.0, 0.0)):
    return [(list(z), 1.0) for _ in range(n)]


def chain(n, cens=0, k="roya"):
    c = ChainCounts(disease=k, n=list(n), n_censored=cens)
    c.m = sum(n) + cens
    c.m_eff = float(c.m)
    return c


def exp_loss(out):
    return sum(w * e for w, e in zip(out["weights"], out["ell_samples"]))


def exp_mu(out, k="roya"):
    return sum(p["w"] * p["mu"] for p in out["per_disease"][k]["particles"])


# ---------- Capa D ----------
@pytest.mark.parametrize("rates", [(0.1, 0.25, 0.2), (0.3, 0.3, 0.3), (0.05, 0.5, 0.05), (1e-4, 2.0, 0.7)])
@pytest.mark.parametrize("delta", [0.5, 1.0, 7.0])
def test_expm_filas_suman_1_triangular_y_coincide_con_referencia(rates, delta):
    P_ = markov.transition(rates, delta)
    ref = markov.expm_reference(markov.generator(rates), delta)
    for i in range(4):
        assert abs(sum(P_[i]) - 1) < 1e-9
        for j in range(4):
            if j < i:
                assert P_[i][j] == 0.0
            assert abs(P_[i][j] - ref[i][j]) < 1e-5


# ---------- §2.7 RIESGO ----------
def test_mas_severidad_inicial_nunca_menos_perdida(P):
    lo = run_risk({"roya": chain([8, 2, 0, 0])}, P, weeks(), 2000, n=N)
    hi = run_risk({"roya": chain([4, 3, 2, 1])}, P, weeks(), 2000, n=N)
    assert exp_mu(hi) >= exp_mu(lo)


def test_mas_semanas_a_cosecha_nunca_menos_perdida(P):
    c = {"roya": chain([6, 3, 1, 0])}
    assert exp_mu(run_risk(c, P, weeks(24), 2000, n=N)) >= exp_mu(run_risk(c, P, weeks(8), 2000, n=N))


def test_mas_humedad_con_gamma_hr_positivo_nunca_menos_perdida(P):
    p = copy.deepcopy(P)
    for gw in p["draws"]["roya"]["gamma_w"]:
        gw[1] = abs(gw[1]) + 0.1          # γ_w(humedad) > 0
    c = {"roya": chain([6, 3, 1, 0])}
    seco = run_risk(c, p, weeks(16, (0, -1, 0)), 2000, n=N)
    humedo = run_risk(c, p, weeks(16, (0, 1, 0)), 2000, n=N)
    assert exp_mu(humedo) >= exp_mu(seco)


def test_con_lambda_identidad_y_muchas_fotos_pi0_se_acerca_a_lo_observado(P):
    p = copy.deepcopy(P)
    p["lambda"] = [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]
    obs = [500, 300, 150, 50]
    out = run_risk({"roya": chain(obs)}, p, weeks(1), 2000, n=2000)
    parts = out["per_disease"]["roya"]["particles"]
    post = [sum(q["w"] * q["pi0"][s] for q in parts) for s in range(4)]
    for s in range(4):
        assert abs(post[s] - obs[s] / 1000) < 0.03


def test_cvar_mayor_o_igual_p90_mayor_o_igual_p50(P):
    out = run_risk({"roya": chain([5, 3, 1, 1])}, P, weeks(), 2000, n=N)
    e = out["ell"]
    assert e["cvar10"] >= e["p90"] >= e["p50"]


def test_censuradas_sin_segmentacion_no_inventan_nivel(P):
    # 3 hojas con roya sin severidad: π0 de nivel >= 1 sube respecto a sin hojas con roya.
    base = run_risk({"roya": chain([10, 0, 0, 0])}, P, weeks(1), 2000, n=N)
    cens = run_risk({"roya": chain([7, 0, 0, 0], cens=3)}, P, weeks(1), 2000, n=N)
    sick = lambda o: sum(q["w"] * (1 - q["pi0"][0]) for q in o["per_disease"]["roya"]["particles"])
    assert sick(cens) > sick(base)


def test_banderas(P):
    pocos = adapt([{"clase": "roya", "p_clase": 0.9, "severidad": 0.05, "p_calidad": 1}] * 3, P)
    assert "muestra_insuficiente" in pocos["roya"].flags
    p = copy.deepcopy(P)
    p["lambda"][2] = [0.0, 0.5, 0.4, 0.1]
    out = run_risk({"roya": chain([5, 2, 2, 1])}, p, weeks(), 2000, n=N)
    assert "detector_no_corregible" in out["banderas"]
    # Nivel 3 bloqueado (fila uniforme), pero solo hay hojas censuradas (">= 1", sin segmentador) y de nivel 1:
    # nadie observó el nivel 3, así que no se pide técnico por el detector.
    p = copy.deepcopy(P)
    p["lambda"][3] = [0.25, 0.25, 0.25, 0.25]
    out = run_risk({"roya": chain([7, 2, 0, 0], cens=3)}, p, weeks(), 2000, n=N)
    assert "detector_no_corregible" not in out["banderas"]
    out = run_risk({"roya": chain([7, 2, 0, 1])}, p, weeks(), 2000, n=N)
    assert "detector_no_corregible" in out["banderas"]
    out = run_risk({"roya": chain([5, 2, 2, 1])}, P, weeks(4, (3.0, 0, 0)), 2000, n=N)
    assert "clima_fuera_de_rango" in out["banderas"] and "parametros_prior" in out["banderas"]


# ---------- Adaptador ----------
def test_adaptador_una_cadena_por_enfermedad_y_filtros(P):
    fotos = [
        {"clase": "roya", "p_clase": 0.9, "severidad": 0.005, "p_calidad": 1},   # nivel 0
        {"clase": "roya", "p_clase": 0.9, "severidad": 0.05, "p_calidad": 1},    # nivel 1
        {"clase": "roya", "p_clase": 0.9, "severidad": 0.5, "p_calidad": 1},     # nivel 3
        {"clase": "roya", "p_clase": 0.9, "severidad": None, "p_calidad": 1},    # censurada
        {"clase": "phoma", "p_clase": 0.9, "severidad": 0.2, "p_calidad": 1},    # nivel 0 para roya
        {"clase": "sana", "p_clase": 0.9, "severidad": 0.0, "p_calidad": 1},
        {"clase": "roya", "p_clase": 0.3, "severidad": 0.5, "p_calidad": 1},     # descartada (p_clase)
        {"clase": "roya", "p_clase": 0.9, "severidad": 0.5, "p_calidad": 0.1},   # descartada (calidad)
    ]
    out = adapt(fotos, P)
    assert set(out) == {"roya", "phoma"}
    assert out["roya"].n == [3, 1, 0, 1] and out["roya"].n_censored == 1 and out["roya"].m == 6
    assert out["phoma"].n == [5, 0, 1, 0]
    assert level_of(0.3, [0.01, 0.1, 0.3]) == 3


# ---------- §3.6 DECISIÓN ----------
def test_ce_propiedades():
    r = Rng(3)
    x = [r.normal() * 50 + 100 for _ in range(500)]
    w = [1.0] * 500
    mean = sum(x) / 500
    vals = [ce(x, w, th) for th in (1e-9, 0.001, 0.01, 0.05)]
    assert abs(vals[0] - mean) < 1e-5   # θ -> 0: CE -> E[M] (diferencia ≈ θ·Var/2 = 1,2e-6)
    assert all(a >= b - 1e-9 for a, b in zip(vals, vals[1:]))   # θ mayor -> CE nunca mayor
    assert all(v <= mean + 1e-9 for v in vals)              # CE <= E[M]


ECON = {"price_med": 20000.0, "price_age_weeks": 0, "wage": 60000.0, "monthly_rate": 0.02, "area_ha": 2.0,
        "harvest_season_t0": False, "harvest_season_t1": False}
PROFILE = {"certificaciones": [], "caja": 5e6, "credito": 5e6, "jornales_disponibles_semana": 100, "aversion": "intermedio"}


@pytest.fixture(scope="module")
def caso(P):
    chains = {"roya": chain([4, 3, 2, 1])}
    risk = run_risk(chains, P, weeks(16), 2000, n=N)
    return chains, risk


def test_decision_voi_y_costo_oportunidad_no_negativos(P, caso):
    chains, risk = caso
    d = decide(risk, chains, demo_catalog(), PROFILE, ECON, P)
    assert d["valor_de_remedir"] >= -1e-9
    for a in d["alternativas"]:
        if a["viable_hoy"]:
            assert a["costo_oportunidad"] >= -1e-9
            assert set(a["costos"]) >= {"directo", "dinero", "laboral", "certificacion", "calidad"}  # nunca se omiten


def test_accion_sin_efecto_equivale_a_no_intervenir_menos_costos(P, caso):
    chains, risk = caso
    cat = demo_catalog()[:1]
    cat[0] = copy.deepcopy(cat[0])
    cat[0]["id"] = "sin_efecto"
    cat[0]["efecto"]["d_a"] = {"dist": "beta", "a": 1e-6, "b": 1e6}
    cat[0]["efecto"]["kappa"] = {"dist": "beta", "a": 1e-6, "b": 1e6}
    d = decide(risk, chains, cat, PROFILE, ECON, P)
    v = {a["id"]: a for a in d["alternativas"] if a["viable_hoy"]}
    costs = sum(v["sin_efecto"]["costos"][k] for k in ("directo", "dinero", "laboral"))
    assert abs(v["sin_efecto"]["margen"]["ce"] - (v["nada"]["margen"]["ce"] - costs)) < 1e-3


def test_accion_mas_cara_con_mismo_efecto_nunca_gana(P, caso):
    chains, risk = caso
    a = copy.deepcopy(demo_catalog()[2])
    b = copy.deepcopy(a)
    b["id"] = "cobre_caro"
    b["costos"]["directo_por_ha"] *= 2
    d = decide(risk, chains, [a, b], PROFILE, ECON, P)
    v = {x["id"]: x["margen"]["ce"] for x in d["alternativas"] if x["viable_hoy"]}
    assert v["cobre_caro"] <= v["cobre"]


def test_theta_mayor_nunca_aumenta_ce_de_cada_alternativa(P, caso):
    chains, risk = caso
    ces = []
    for av in ("arriesgado", "intermedio", "prudente"):
        d = decide(risk, chains, demo_catalog(), {**PROFILE, "aversion": av}, ECON, P)
        ces.append({x["id"]: x["margen"]["ce"] for x in d["alternativas"] if x["viable_hoy"]})
    for k in ces[0]:
        assert ces[0][k] >= ces[1][k] - 1e-6 >= ces[2][k] - 2e-6


def test_inviables_se_muestran_con_razon(P, caso):
    chains, risk = caso
    d = decide(risk, chains, demo_catalog(), {**PROFILE, "certificaciones": ["organico"], "caja": 0, "credito": 0}, ECON, P)
    razones = {a["id"]: a["razon_no_viable"] for a in d["alternativas"] if not a["viable_hoy"]}
    assert razones.get("fungicida_sistemico") == "certificacion"
    assert razones.get("cobre") == "liquidez"


def test_con_parametros_prior_nunca_recomendacion_unica(P, caso):
    chains, risk = caso
    d = decide(risk, chains, demo_catalog(), PROFILE, ECON, P)
    assert "parametros_prior" in d["banderas"] and d["recomendacion"] is None


def test_ssd_basico():
    assert ssd_dominates([2, 3, 4], [1, 1, 1], [1, 3, 4], [1, 1, 1])
    assert not ssd_dominates([1, 3, 4], [1, 1, 1], [2, 3, 4], [1, 1, 1])
    assert not ssd_dominates([1, 2], [1, 1], [1, 2], [1, 1])


def test_catalogo_demo_valido():
    assert validate_catalog(demo_catalog()) == []
    bad = demo_catalog()
    del bad[0]["costos"]["jornales_por_ha"]
    assert "[0].costos.jornales_por_ha" in validate_catalog(bad)


# ---------- Huecos encontrados por la prueba de mutaciones (criterio S0) ----------
def test_efecto_inmediato_de_una_accion_baja_un_nivel_y_conserva_masa():
    from jani_rd.risk import apply_immediate
    out = apply_immediate([0.4, 0.3, 0.2, 0.1], 0.5)
    assert out == pytest.approx([0.55, 0.25, 0.15, 0.05])
    assert sum(out) == pytest.approx(1.0)
    assert apply_immediate([0.4, 0.3, 0.2, 0.1], 0.0) == [0.4, 0.3, 0.2, 0.1]


def test_costo_del_dinero_financiado_y_capital_propio(P, caso):
    from jani_rd.decision import Context
    chains, risk = caso
    accion = demo_catalog()[1]   # fungicida sistémico: 400.000/ha × 2 ha + 2 jornales/ha × 2 ha × 60.000
    dinero = 800000 + 240000
    semanas = sum(d for _, d in risk["weeks"])
    meses = semanas / 4.345
    sin_caja = Context(risk, chains, [accion], {**PROFILE, "caja": 0}, ECON, P).costs(accion)
    assert sin_caja["dinero"] == pytest.approx(dinero * ECON["monthly_rate"] * meses / ECON["price_med"])
    con_caja = Context(risk, chains, [accion], {**PROFILE, "caja": 10 ** 9}, ECON, P).costs(accion)
    assert con_caja["dinero"] == pytest.approx(dinero * P["decision"]["own_capital_rate_monthly"] * meses / ECON["price_med"])
    assert sin_caja["laboral"] == pytest.approx(240000 / ECON["price_med"])
    assert sin_caja["directo"] == pytest.approx(800000 / ECON["price_med"])
