"""Catálogo de DEMOSTRACIÓN (manual §4.1). Valores ilustrativos marcados como 'criterio_experto' y fuente TODO:
se reemplazan por el catálogo firmado por extensión técnica (Cenicafé / extensión local) sin tocar código.

Referencias que orientan los órdenes de magnitud (no son valores validados):
  - Triazoles y estrobilurinas reducen la severidad de roya 60–90 % aplicados temprano (revisión de literatura).
  - En Hawái (USDA ARS 2022–23), cobres y productos convencionales mantuvieron la incidencia estable entre
    aspersiones; los biológicos dejaron subir la incidencia (dataset CC0, doi 10.15482/USDA.ADC/28518353.v1).
  - Protección de 4–8 semanas por aspersión (4–6 aspersiones entre floración y cosecha).
"""


def _beta(a, b):
    return {"dist": "beta", "a": a, "b": b}


def demo_catalog(currency_per_ha_scale=1.0):
    s = currency_per_ha_scale
    return [
        {"id": "poda_selectiva", "frase": "alt_cultural", "icono": "✂️", "aplica_a": ["roya", "minador", "phoma", "cercospora"],
         "nivel_min": 1, "ventana_fenologica": None, "semanas_min_a_cosecha": 0,
         "efecto": {"d_a": _beta(3, 7), "kappa": _beta(1, 9), "duracion_semanas": 6},
         "costos": {"directo_por_ha": 0, "jornales_por_ha": 6, "cert_penalizacion": 0.0, "calidad_delta": 0.0},
         "restricciones": {"incompatible_con_certificaciones": [], "periodo_de_carencia_semanas": 0},
         "evidencia": "criterio_experto", "fuente": "TODO: validar con extensión"},
        {"id": "fungicida_sistemico", "frase": "alt_fungicide", "icono": "💧", "aplica_a": ["roya", "phoma", "cercospora"],
         "nivel_min": 1, "ventana_fenologica": None, "semanas_min_a_cosecha": 4,
         "efecto": {"d_a": _beta(1, 99), "kappa": _beta(8, 2), "duracion_semanas": 6},
         "costos": {"directo_por_ha": 400000 * s, "jornales_por_ha": 2, "cert_penalizacion": 0.02, "calidad_delta": 0.0},
         "restricciones": {"incompatible_con_certificaciones": ["organico"], "periodo_de_carencia_semanas": 4},
         "evidencia": "criterio_experto", "fuente": "TODO: producto, dosis y carencia según extensión"},
        {"id": "cobre", "frase": "alt_copper", "icono": "🟦", "aplica_a": ["roya", "phoma", "cercospora"],
         "nivel_min": 1, "ventana_fenologica": None, "semanas_min_a_cosecha": 2,
         "efecto": {"d_a": _beta(1, 99), "kappa": _beta(5, 5), "duracion_semanas": 5},
         "costos": {"directo_por_ha": 250000 * s, "jornales_por_ha": 2, "cert_penalizacion": 0.0, "calidad_delta": 0.0},
         "restricciones": {"incompatible_con_certificaciones": [], "periodo_de_carencia_semanas": 2},
         "evidencia": "criterio_experto", "fuente": "TODO"},
        {"id": "biologico", "frase": "alt_bio", "icono": "🌿", "aplica_a": ["roya"],
         "nivel_min": 1, "ventana_fenologica": None, "semanas_min_a_cosecha": 0,
         "efecto": {"d_a": _beta(1, 99), "kappa": _beta(3, 7), "duracion_semanas": 4},
         "costos": {"directo_por_ha": 200000 * s, "jornales_por_ha": 2, "cert_penalizacion": 0.0, "calidad_delta": 0.0},
         "restricciones": {"incompatible_con_certificaciones": [], "periodo_de_carencia_semanas": 0},
         "evidencia": "criterio_experto", "fuente": "TODO"},
        {"id": "control_minador", "frase": "alt_miner", "icono": "🐛", "aplica_a": ["minador"],
         "nivel_min": 2, "ventana_fenologica": None, "semanas_min_a_cosecha": 3,
         "efecto": {"d_a": _beta(1, 99), "kappa": _beta(5, 5), "duracion_semanas": 6},
         "costos": {"directo_por_ha": 300000 * s, "jornales_por_ha": 2, "cert_penalizacion": 0.02, "calidad_delta": 0.0},
         "restricciones": {"incompatible_con_certificaciones": ["organico"], "periodo_de_carencia_semanas": 3},
         "evidencia": "criterio_experto", "fuente": "TODO"},
    ]
