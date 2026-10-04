"""Adaptador de entrada: salidas de la Etapa 1 (clasificador M1 + segmentación M2) -> conteos por nivel (manual §1.2).

Contrato por foto (§1.1), tal como lo produce la app:
  clase       : 'sana' | 'roya' | 'minador' | 'phoma' | 'cercospora'   (M1, clase con mayor probabilidad)
  p_clase     : probabilidad calibrada de esa clase                      (M1, softmax con temperatura)
  severidad   : fracción síntoma / hoja en [0,1], o None                 (M2; None si no hay modelo de segmentación)
  p_calidad   : calidad de captura en [0,1]                               (nitidez y luz, engine/quality.ts)

Una cadena por enfermedad (regla 2): para la enfermedad k, una hoja de clase k aporta su nivel según la severidad;
una hoja sana o de otra enfermedad aporta nivel 0 para k. Si la severidad no se conoce (sin M2), la hoja entra como
observación censurada "nivel >= 1": no se inventa un nivel.
"""
from dataclasses import dataclass, field

DISEASES = ("roya", "minador", "phoma", "cercospora")


@dataclass
class ChainCounts:
    disease: str
    n: list = field(default_factory=lambda: [0, 0, 0, 0])   # n̂_s observados con nivel conocido
    n_censored: int = 0                                      # hojas de la enfermedad sin severidad (nivel >= 1)
    m: int = 0                                               # unidades válidas
    m_eff: float = 0.0
    flags: list = field(default_factory=list)


def level_of(severity: float, thresholds) -> int:
    """Umbrales [t1, t2, t3] sobre la fracción de síntoma: s=0 si < t1, 1 si < t2, 2 si < t3, 3 si >= t3."""
    for s, t in enumerate(thresholds):
        if severity < t:
            return s
    return 3


def adapt(photos, params):
    """photos: lista de dicts del contrato §1.1. Devuelve {enfermedad: ChainCounts} solo para enfermedades vistas."""
    a = params["adapter"]
    valid = [p for p in photos
             if p.get("p_calidad", 1.0) >= a["p_quality_min"] and p.get("p_clase", 0.0) >= a["p_class_min"]]
    m = len(valid)
    b = a["units_per_plant"]
    m_eff = m / (1.0 + (b - 1.0) * a["rho"])
    seen = sorted({p["clase"] for p in valid if p["clase"] in DISEASES}, key=DISEASES.index)
    out = {}
    for k in seen:
        cc = ChainCounts(disease=k, m=m, m_eff=m_eff)
        th = params["levels"]["thresholds"][k]
        for p in valid:
            if p["clase"] != k:
                cc.n[0] += 1
            elif p.get("severidad") is None:
                cc.n_censored += 1
            else:
                cc.n[level_of(p["severidad"], th)] += 1
        if m_eff < a["min_m_eff"]:
            cc.flags.append("muestra_insuficiente")
        out[k] = cc
    return out
