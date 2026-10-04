"""Catálogo de acciones (datos, no código) y reglas de elegibilidad F0–F2 (manual §4).

Las reglas solo deciden qué alternativas son elegibles; el valor lo calcula siempre DECISIÓN (F3–F5 en decision.py).
"""
REQUIRED = ("id", "aplica_a", "nivel_min", "efecto", "costos", "restricciones", "evidencia")
BASELINE_IDS = ("nada", "consultar")


def validate_catalog(catalog):
    """Validador de esquema (§6, módulo 5). Devuelve lista de errores con la ruta del campo."""
    errors = []
    ids = set()
    for i, a in enumerate(catalog):
        for k in REQUIRED:
            if k not in a:
                errors.append(f"[{i}].{k}")
        if a.get("id") in ids:
            errors.append(f"[{i}].id duplicado")
        ids.add(a.get("id"))
        ef = a.get("efecto", {})
        for k in ("d_a", "kappa"):
            dist = ef.get(k)
            if dist is None or dist.get("dist") != "beta" or not all(isinstance(dist.get(p), (int, float)) and dist[p] > 0 for p in ("a", "b")):
                errors.append(f"[{i}].efecto.{k}")
        if not isinstance(ef.get("duracion_semanas"), (int, float)):
            errors.append(f"[{i}].efecto.duracion_semanas")
        c = a.get("costos", {})
        for k in ("directo_por_ha", "jornales_por_ha", "cert_penalizacion", "calidad_delta"):
            if not isinstance(c.get(k), (int, float)):
                errors.append(f"[{i}].costos.{k}")
        if a.get("evidencia") not in ("criterio_experto", "estimado", "piloto"):
            errors.append(f"[{i}].evidencia")
    for b in BASELINE_IDS:
        if b in ids:
            errors.append(f"'{b}' es una línea base reservada")
    return errors


def eligibility(action, ctx):
    """F1 (aplicabilidad) y F2 (factibilidad). ctx: enfermedades y niveles vistos, semanas a cosecha, perfil, costos.
    Devuelve (aplica: bool, viable: bool, razon_no_viable: str | None)."""
    diseases = [k for k in action["aplica_a"] if k in ctx["diseases"]]
    if not diseases:
        return False, False, None
    if max(ctx["max_level"].get(k, 0) for k in diseases) < action["nivel_min"]:
        return False, False, None
    r = action["restricciones"]
    weeks = ctx["weeks_to_harvest"]
    if weeks < max(action.get("semanas_min_a_cosecha") or 0, r.get("periodo_de_carencia_semanas", 0)):
        return True, False, "plazo"
    certs = set(ctx["profile"].get("certificaciones", []))
    if certs & set(r.get("incompatible_con_certificaciones", [])):
        return True, False, "certificacion"
    labor_needed = action["costos"]["jornales_por_ha"] * ctx["area_ha"]
    if labor_needed > ctx["profile"].get("jornales_disponibles_semana", float("inf")) * ctx.get("labor_weeks", 1):
        return True, False, "jornales"
    cost_money = ctx["cost_money"](action)
    if cost_money > ctx["profile"].get("caja", 0) + ctx["profile"].get("credito", 0):
        return True, False, "liquidez"
    return True, True, None
