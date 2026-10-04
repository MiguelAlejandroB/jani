"""Matriz de confusión de niveles Λ (manual §1.3) con el modelo de segmentación de la app (M2).

Compara el nivel de severidad que da la segmentación con el nivel real de las máscaras dibujadas por expertos
(BRACOL, divisiones 'val' y 'test', que el modelo no usó para entrenar). Aplica el mismo preprocesamiento que la app:
foto estirada a la entrada del modelo, ÷255, −media, ÷desviación; severidad = síntoma / (hoja + síntoma).

Uso:
    ..\\..\\.venv\\Scripts\\python calibrate_lambda.py --model app/public/models/leafseg-v1 --data <ruta a lara2018 .../segmentation/dataset>
Salida: data/lambda.json  (luego: run_calibration.py --lambda_json data/lambda.json)
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jani_rd.adapter import level_of  # noqa: E402
from jani_rd.calibrate import estimate_lambda  # noqa: E402
from jani_rd.params import default_params  # noqa: E402

MASK_COLORS = {(0, 0, 0): 0, (0, 176, 0): 1, (255, 0, 0): 2}


def mask_index(path):
    a = np.asarray(Image.open(path).convert("RGB"), dtype=np.int32)
    code = (a[..., 0] << 16) | (a[..., 1] << 8) | a[..., 2]
    out = np.zeros(code.shape, np.uint8)
    cols = np.array(list(MASK_COLORS), dtype=np.int32)
    known = np.zeros(code.shape, bool)
    for (r, g, b), k in MASK_COLORS.items():
        hit = code == ((r << 16) | (g << 8) | b)
        out[hit] = k
        known |= hit
    if (~known).any():
        d = ((a[~known][:, None, :] - cols[None]) ** 2).sum(-1)
        out[~known] = np.array(list(MASK_COLORS.values()), dtype=np.uint8)[d.argmin(-1)]
    return out


def severity(idx):
    leaf = (idx == 1).sum() + (idx == 2).sum()
    return float((idx == 2).sum()) / leaf if leaf else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "data", "lambda.json"))
    a = ap.parse_args()
    import onnxruntime as ort
    card = json.load(open(os.path.join(a.model, "model_card.json"), encoding="utf-8"))
    so = ort.SessionOptions()
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL   # misma aritmética que el teléfono
    sess = ort.InferenceSession(os.path.join(a.model, card["recommended_file"]), so, providers=["CPUExecutionProvider"])
    _, _, H, W = card["input"]["shape"]
    mean = np.array(card["input"]["mean"]).reshape(3, 1, 1)
    std = np.array(card["input"]["std"]).reshape(3, 1, 1)
    th = default_params()["levels"]["thresholds"]["roya"]
    counts = np.zeros((4, 4), int)
    pairs = []
    for split in ("val", "test"):
        img_dir, ann_dir = os.path.join(a.data, "images", split), os.path.join(a.data, "annotations", split)
        for f in sorted(os.listdir(img_dir)):
            stem = os.path.splitext(f)[0]
            mp = os.path.join(ann_dir, f"{stem}_mask.png")
            if not os.path.exists(mp):
                continue
            x = np.asarray(Image.open(os.path.join(img_dir, f)).convert("RGB").resize((W, H), Image.BILINEAR), dtype=np.float32)
            x = ((x.transpose(2, 0, 1) / 255.0 - mean) / std)[None].astype(np.float32)
            pred = sess.run(None, {card["input"]["name"]: x})[0].argmax(1)[0]
            s_true, s_pred = severity(mask_index(mp)), severity(pred)
            counts[level_of(s_true, th), level_of(s_pred, th)] += 1
            pairs.append((s_true, s_pred))
    lam, blocked = estimate_lambda(counts, a=1.0)
    t, p = np.array(pairs).T
    out = {"lambda": lam.round(4).tolist(), "counts": counts.tolist(), "blocked": blocked,
           "n": int(counts.sum()), "severity_mae_points": float(np.mean(np.abs(t - p)) * 100),
           "source": f"segmentación {card.get('id')} vs. máscaras de expertos BRACOL (val+test, {int(counts.sum())} hojas)",
           "thresholds": th}
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump(out, open(a.out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("conteos (real × detectado):\n", counts)
    print("Λ:\n", lam.round(3))
    print("niveles bloqueados (Λ[s,s] <= 0,5):", blocked, "| hojas:", int(counts.sum()), "| error severidad:", round(out["severity_mae_points"], 2), "pts")


if __name__ == "__main__":
    main()
