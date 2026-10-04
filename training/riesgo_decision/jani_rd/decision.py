"""Modelo de DECISIÓN (manual §3): decisión bayesiana de dos épocas con utilidad exponencial, sobre las partículas de RIESGO.

t0 = hoy, t1 = t0 + Δ (nueva medición opcional), T = cosecha.
  V_t1(o) = max_a1 { CE_θ[ M | o, a0, a1 ] }                      (costos de a1 incluidos en M)
  V_t0(a0) = − costos(a0) + CE_θ sobre o [ V_t1(o) ]               (costos ciertos salen de la expectativa)
Todo se expresa en KILOS de café equivalentes (dinero ÷ precio mediano), la unidad que entiende el productor; así
θ·M no desborda (θ en 1/kg).

Números aleatorios comunes: cada partícula i usa la misma secuencia aleatoria en todas las acciones (precio, efecto
de la acción, pérdida, observación futura). Las diferencias entre alternativas no las crea el ruido.
"""
import math
from . import markov
from .catalog import eligibility
from .risk import DISEASE_ORDER, apply_immediate, beta_sample, damage_params, loss_from_pi, particle_stream, weighted_quantile

NADA = {"id": "nada", "aplica_a": [], "nivel_min": 0,
        "efecto": {"d_a": None, "kappa": None, "duracion_semanas": 0},
        "costos": {"directo_por_ha": 0, "jornales_por_ha": 0, "cert_penalizacion": 0, "calidad_delta": 0},
        "restricciones": {}, "evidencia": "criterio_experto"}


_stream = particle_stream
EFFECT_SALT = 5   # misma secuencia para el efecto de cualquier acción: mismo efecto -> mismos valores


def ce(values, weights, theta):
    """Equivalente cierto CE_θ = −(1/θ) log Σ w exp(−θ x) (log-sum-exp); θ→0 da la media."""
    tot = sum(weights)
    if theta <= 1e-12:
        return sum(w * x for w, x in zip(weights, values)) / tot
    a = [-theta * x for x in values]
    mx = max(a)
    s = sum(w * math.exp(ai - mx) for w, ai in zip(weights, a)) / tot
    return -(mx + math.log(s)) / theta


def cvar_lower(values, weights, alpha):
    order = sorted(range(len(values)), key=lambda i: values[i])
    tot = sum(weights)
    need, acc, s = alpha * tot, 0.0, 0.0
    for i in order:
        take = min(weights[i], need - acc)
        if take <= 0:
            break
        s += take * values[i]
        acc += take
    return s / acc if acc > 0 else values[order[0]]


def ssd_dominates(xa, wa, xb, wb, tol=1e-9):
    """a domina a b (segundo orden) si ∫_{−∞}^{x} [F_b − F_a] ≥ 0 para todo x y la desigualdad es estricta en algún x."""
    ta, tb = sum(wa), sum(wb)
    ev = sorted([(x, w / ta, 0.0) for x, w in zip(xa, wa)] + [(x, 0.0, w / tb) for x, w in zip(xb, wb)])
    Fa = Fb = integral = 0.0
    prev = None
    strict = False
    for x, da, db in ev:
        if prev is not None and x > prev:
            integral += (Fb - Fa) * (x - prev)
            if integral < -tol:
                return False
            if integral > tol:
                strict = True
        Fa += da
        Fb += db
        prev = x
    return strict


class Context:
    """Todo lo que DECISIÓN necesita además de las partículas de RIESGO."""

    def __init__(self, risk_out, chains, catalog, profile, econ, params, seed=7):
        self.r = risk_out
        self.chains = chains
        self.catalog = catalog
        self.profile = profile
        self.econ = econ          # price_med, price_age_weeks, wage, monthly_rate, area_ha, harvest_season_t0/t1
        self.p = params
        self.dp = params["decision"]
        self.seed = seed
        self.n = len(risk_out["weights"])
        self.w = risk_out["weights"]
        weeks = risk_out["weeks"]
        self.total_weeks = sum(d for _, d in weeks)
        self.delta = min(self.dp["delta_weeks"], self.total_weeks)
        self.w0, self.w1 = _split(weeks, self.delta)
        sd = self.dp["price_sd"] * (1 + self.dp["price_age_widen_per_week"] * econ.get("price_age_weeks", 0))
        self.price = [econ["price_med"] * math.exp(sd * _stream(seed, i, 1).normal() - 0.5 * sd * sd) for i in range(self.n)]
        y0 = risk_out["y0"]
        self.y0 = y0
        self.theta = self.dp["theta_r"][profile.get("aversion", self.dp["theta_default"])] / max(
            weighted_quantile(y0, self.w, 0.5), 1e-9)
        self.diseases = list(chains)
        # Enfermedad que se vuelve a observar en t1: la de mayor pérdida esperada hoy.
        self.primary = max(self.diseases, key=lambda k: _mean_ell(risk_out, k)) if self.diseases else None

    def money_cost(self, action, at_t1=False):
        """C_a + L_a (sin costo del dinero): insumo + jornales, en dinero."""
        c = action["costos"]
        area = self.econ["area_ha"]
        harvest = self.econ.get("harvest_season_t1" if at_t1 else "harvest_season_t0", False)
        wage = self.econ["wage"] * (self.dp["harvest_wage_factor"] if harvest else 1.0)
        return c["directo_por_ha"] * area, c["jornales_por_ha"] * area * wage

    def finance_cost(self, money, months):
        cash = self.profile.get("caja", 0)
        financed = max(0.0, money - cash)
        own = money - financed
        return financed * self.econ["monthly_rate"] * months + own * self.dp["own_capital_rate_monthly"] * months

    def costs(self, action, at_t1=False):
        """Costos ciertos de una acción, en kilos: directo, dinero, laboral (Cert y Cal van en el ingreso)."""
        if action["id"] == "nada":
            return {"directo": 0.0, "dinero": 0.0, "laboral": 0.0}
        direct, labor = self.money_cost(action, at_t1)
        weeks_left = self.total_weeks - (self.delta if at_t1 else 0.0)
        months = max(weeks_left, 0.0) / 4.345
        fin = self.finance_cost(direct + labor, months)
        pm = self.econ["price_med"]
        return {"directo": direct / pm, "dinero": fin / pm, "laboral": labor / pm}

    def eligible(self, action, at_t1=False):
        weeks = self.total_weeks - (self.delta if at_t1 else 0.0)
        max_level = {k: max([s for s in range(4) if self.chains[k].n[s] > 0] + ([1] if self.chains[k].n_censored else [0]))
                     for k in self.chains}
        ctx = {"diseases": self.diseases, "max_level": max_level, "weeks_to_harvest": weeks, "profile": self.profile,
               "area_ha": self.econ["area_ha"], "cost_money": lambda a: sum(self.money_cost(a, at_t1))}
        return eligibility(action, ctx)

    def effect_draws(self, action, i):
        """d_a y κ_a para la partícula i (misma secuencia para la misma acción en todas las ramas)."""
        ef = action["efecto"]
        if not ef.get("d_a"):
            return 0.0, 0.0
        r = _stream(self.seed, i, EFFECT_SALT)
        return r.beta(ef["d_a"]["a"], ef["d_a"]["b"]), r.beta(ef["kappa"]["a"], ef["kappa"]["b"])

    def pi_at(self, k, i, pi_start, weeks, action):
        part = self.r["per_disease"][k]["particles"][i]
        gamma_s, gamma_w, _, _ = damage_params(self.p, k, part["d"])
        if action is None or k not in action.get("aplica_a", []):
            return markov.propagate(pi_start, gamma_s, gamma_w, weeks)
        d_a, kappa = self.effect_draws(action, i)
        pi = apply_immediate(pi_start, d_a)
        return markov.propagate(pi, gamma_s, gamma_w, weeks, kappa, action["efecto"]["duracion_semanas"])

    def margin(self, i, pis_T, actions):
        """M_i en kilos: Y0 (1 − ℓ) P q · (1 − cert) / P_med − costos (los costos se restan fuera, son ciertos)."""
        keep = 1.0
        for k in self.diseases:
            part = self.r["per_disease"][k]["particles"][i]
            _, _, g, kappa = damage_params(self.p, k, part["d"])
            mu = loss_from_pi(pis_T[k], g)
            ell = beta_sample(_stream(self.seed, i, 3 + DISEASE_ORDER.index(k)), mu, kappa)
            keep *= 1 - ell
        q = 1.0
        cert = 0.0
        for a in actions:
            q *= 1 + a["costos"]["calidad_delta"]
            if self.profile.get("certificaciones"):
                cert += a["costos"]["cert_penalizacion"]
        revenue = self.y0[i] * keep * self.price[i] * q * (1 - min(cert, 1.0)) / self.econ["price_med"]
        return revenue, 1 - keep

    def observe(self, i, pi_t1):
        """Resultado o ∈ {0 bajo, 1 medio, 2 alto} de una muestra de m1 hojas en t1 (proporción con nivel ≥ 2)."""
        if self.primary is None:
            return 0
        r = _stream(self.seed, i, 2)
        lam = self.p["lambda"]
        q = [sum(pi_t1[self.primary][s] * lam[s][j] for s in range(4)) for j in range(4)]
        high = sum(1 for _ in range(self.dp["m1"]) if r.categorical(q) >= 2)
        frac = high / self.dp["m1"]
        lo, hi = self.dp["obs_bins"]
        return 0 if frac < lo else (1 if frac < hi else 2)


def _split(weeks, delta):
    w0, w1, t = [], [], 0.0
    for w, d in weeks:
        if t >= delta:
            w1.append((w, d))
        elif t + d <= delta:
            w0.append((w, d))
        else:
            w0.append((w, delta - t))
            w1.append((w, t + d - delta))
        t += d
    return w0, w1


def _mean_ell(risk_out, k):
    parts = risk_out["per_disease"][k]["particles"]
    return sum(p["w"] * p["ell"] for p in parts)


def decide(risk_out, chains, catalog, profile, econ, params, seed=7):
    """Salida del contrato §3.5."""
    cx = Context(risk_out, chains, catalog, profile, econ, params, seed)
    n, w = cx.n, cx.w
    acts0, info = [NADA], {}
    for a in catalog:
        applies, viable, why = cx.eligible(a)
        if applies:
            info[a["id"]] = {"viable_hoy": viable, "razon_no_viable": why}
            if viable:
                acts0.append(a)
    acts1 = [NADA] + [a for a in catalog if all(cx.eligible(a, at_t1=True)[:2])]

    # π en t1 por acción de t0 y partícula; luego π en cosecha por (a0, a1).
    def pis_t1(a0):
        return [{k: cx.pi_at(k, i, cx.r["per_disease"][k]["particles"][i]["pi0"], cx.w0, a0 if a0["id"] != "nada" else None)
                 for k in cx.diseases} for i in range(n)]

    results = {}
    for a0 in acts0:
        P1 = pis_t1(a0)
        obs = [cx.observe(i, P1[i]) for i in range(n)]
        c0 = cx.costs(a0)
        c0_kg = sum(c0.values())
        # Margen de cada partícula para cada a1 (costos de a1 restados aquí: ocurren en t1).
        M = {}
        L = {}
        for a1 in acts1:
            c1 = sum(cx.costs(a1, at_t1=True).values())
            M[a1["id"]], L[a1["id"]] = [], []
            for i in range(n):
                pis_T = {k: cx.pi_at(k, i, P1[i][k], cx.w1, a1 if a1["id"] != "nada" else None) for k in cx.diseases}
                rev, ell = cx.margin(i, pis_T, [x for x in (a0, a1) if x["id"] != "nada"])
                M[a1["id"]].append(rev - c1)
                L[a1["id"]].append(ell)
        # Con observación: en cada nodo o se elige el mejor a1.
        nodes = {}
        for o in (0, 1, 2):
            idx = [i for i in range(n) if obs[i] == o]
            if not idx:
                continue
            wo = [w[i] for i in idx]
            best = max(acts1, key=lambda a1: ce([M[a1["id"]][i] for i in idx], wo, cx.theta))
            nodes[o] = {"idx": idx, "prob": sum(wo), "a1": best["id"],
                        "V": ce([M[best["id"]][i] for i in idx], wo, cx.theta)}
        Vt0 = -c0_kg + ce([nodes[o]["V"] for o in nodes], [nodes[o]["prob"] for o in nodes], cx.theta)
        # Sin observación: un solo a1 para todos.
        best_noobs = max(acts1, key=lambda a1: ce(M[a1["id"]], w, cx.theta))
        V_noobs = -c0_kg + ce(M[best_noobs["id"]], w, cx.theta)
        # Distribución del margen bajo la política (a0, luego a1*(o)).
        policy = [None] * n
        for o, nd in nodes.items():
            for i in nd["idx"]:
                policy[i] = nd["a1"]
        Mpol = [M[policy[i]][i] - c0_kg for i in range(n)]
        Lpol = [L[policy[i]][i] for i in range(n)]
        results[a0["id"]] = {"action": a0, "V": Vt0, "V_noobs": V_noobs, "M": Mpol, "L": Lpol, "costs0": c0,
                             "nodes": {o: {"prob": nd["prob"], "a1": nd["a1"]} for o, nd in nodes.items()},
                             "M_by_a1": M, "c0_kg": c0_kg, "obs": obs}

    V_star = max(r["V"] for r in results.values())
    V_star_noobs = max(r["V_noobs"] for r in results.values())
    base = results["nada"]
    out_alts = []
    for aid, r in results.items():
        a = r["action"]
        better = sum(w[i] for i in range(n) if r["M"][i] > base["M"][i] + 1e-12)
        out_alts.append({
            "id": aid,
            "evidencia": a.get("evidencia", "criterio_experto"),
            "margen": {"ce": r["V"], "esperado": sum(wi * x for wi, x in zip(w, r["M"])),
                       "cvar10": cvar_lower(r["M"], w, 0.1), "p_negativo": sum(wi for wi, x in zip(w, r["M"]) if x < 0)},
            "perdida_pct": {"p50": weighted_quantile(r["L"], w, 0.5), "p90": weighted_quantile(r["L"], w, 0.9)},
            "costos": {**r["costs0"], "certificacion": _cert_kg(cx, a, r), "calidad": _quality_kg(cx, a, r)},
            "costo_oportunidad": V_star - r["V"],
            "viable_hoy": True, "razon_no_viable": None,
            "p_mejor_que_nada": better,
            "politica_t1": r["nodes"],
            "domina_a": [], "dominada_por": None,
            "no_se_justifica": aid != "nada" and better < cx.dp["f3_min_prob_better"],
        })
    # Inviables hoy: se muestran con la razón (no se ocultan).
    for aid, inf in info.items():
        if not inf["viable_hoy"]:
            out_alts.append({"id": aid, "evidencia": next(a for a in catalog if a["id"] == aid).get("evidencia"),
                             "viable_hoy": False, "razon_no_viable": inf["razon_no_viable"], "margen": None})
    # F4: dominancia estocástica de segundo orden entre viables.
    viable = [x for x in out_alts if x["viable_hoy"]]
    for a in viable:
        for b in viable:
            if a is b:
                continue
            if ssd_dominates(results[a["id"]]["M"], w, results[b["id"]]["M"], w):
                a["domina_a"].append(b["id"])
                if b["dominada_por"] is None and b["id"] != "nada":
                    b["dominada_por"] = a["id"]
    viable.sort(key=lambda x: -x["margen"]["ce"])
    shown = [x for x in viable if x["id"] == "nada" or x["dominada_por"] is None][: cx.dp["max_shown"] + 1]
    flags = set(risk_out["banderas"])
    if all(x["margen"]["p_negativo"] > 0.5 for x in viable):
        recommendation, why = "consultar", "todas_con_perdida_probable"
    elif "parametros_prior" in flags or "muestra_insuficiente" in flags:
        recommendation, why = None, "parametros_prior" if "parametros_prior" in flags else "muestra_insuficiente"
    else:
        recommendation, why = viable[0]["id"], None
    c_obs = cx.dp["remeasure_labor_days"] * econ["area_ha"] * econ["wage"] / econ["price_med"]
    voi = V_star - V_star_noobs
    # Costo de demora de cada acción: hacerla hoy vs. no hacer nada hoy y hacerla en t1 (sin depender de lo observado).
    for x in viable:
        if x["id"] == "nada":
            x["costo_demora"] = 0.0
            continue
        later = ce(base["M_by_a1"][x["id"]], w, cx.theta) if x["id"] in base["M_by_a1"] else None
        x["costo_demora"] = None if later is None else results[x["id"]]["V"] - later
    sens = {}
    for name, f in (("theta_bajo", 0.25), ("theta_alto", 4.0)):
        th = cx.theta * f
        sens[name] = max(viable, key=lambda x: _value_at_theta(results[x["id"]], cx, th))["id"]
    return {
        "alternativas": out_alts,
        "mostradas": [x["id"] for x in shown] + ["consultar"],
        "recomendacion": recommendation, "razon_sin_recomendacion": why,
        "valor_de_esperar": results["nada"]["V"] - max((x["margen"]["ce"] for x in viable if x["id"] != "nada"), default=results["nada"]["V"]),
        "valor_de_remedir": voi, "costo_remedir": c_obs, "recomendar_remedir": voi > c_obs,
        "sensibilidad": sens, "theta": cx.theta, "banderas": sorted(flags),
        "unidad": "kg",
    }


def _value_at_theta(r, cx, theta):
    """Recalcula V_t0(a0) con otro θ reutilizando los márgenes simulados (mismos nodos de observación)."""
    nodes = {}
    for i, o in enumerate(r["obs"]):
        nodes.setdefault(o, []).append(i)
    vals, probs = [], []
    for idx in nodes.values():
        wo = [cx.w[i] for i in idx]
        vals.append(max(ce([r["M_by_a1"][a1][i] for i in idx], wo, theta) for a1 in r["M_by_a1"]))
        probs.append(sum(wo))
    return -r["c0_kg"] + ce(vals, probs, theta)


def _cert_kg(cx, a, r):
    if a["id"] == "nada" or not cx.profile.get("certificaciones"):
        return 0.0
    pen = a["costos"]["cert_penalizacion"]
    return pen * sum(wi * cx.y0[i] for i, wi in enumerate(cx.w))


def _quality_kg(cx, a, r):
    if a["id"] == "nada":
        return 0.0
    return -a["costos"]["calidad_delta"] * sum(wi * cx.y0[i] for i, wi in enumerate(cx.w))
