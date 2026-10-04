"""Versiones vectorizadas (numpy) de la cadena de Markov para la calibración. Deben coincidir con markov.py."""
import numpy as np

GAP = 1e-3


def transition_np(rates, delta):
    """rates: (n, 3) -> (n, 4, 4) = expm(QΔ) por fila. Forma cerrada con separación; si no, Taylor con escalado."""
    rates = np.atleast_2d(np.asarray(rates, float))
    n = rates.shape[0]
    P = np.zeros((n, 4, 4))
    l0, l1, l2 = rates[:, 0], rates[:, 1], rates[:, 2]
    scale = np.maximum(rates.max(1), 1e-300)
    sep = (np.abs(l0 - l1) > GAP * scale) & (np.abs(l0 - l2) > GAP * scale) & (np.abs(l1 - l2) > GAP * scale)
    e0, e1, e2 = np.exp(-l0 * delta), np.exp(-l1 * delta), np.exp(-l2 * delta)
    with np.errstate(divide="ignore", invalid="ignore"):
        P[:, 0, 0], P[:, 1, 1], P[:, 2, 2], P[:, 3, 3] = e0, e1, e2, 1.0
        P[:, 0, 1] = l0 * (e0 - e1) / (l1 - l0)
        P[:, 1, 2] = l1 * (e1 - e2) / (l2 - l1)
        P[:, 0, 2] = l0 * l1 * (e0 / ((l1 - l0) * (l2 - l0)) + e1 / ((l0 - l1) * (l2 - l1)) + e2 / ((l0 - l2) * (l1 - l2)))
    P = np.clip(P, 0, None)
    P[:, 0, 3] = np.clip(1 - P[:, 0, :3].sum(1), 0, None)
    P[:, 1, 3] = np.clip(1 - P[:, 1, 1:3].sum(1), 0, None)
    P[:, 2, 3] = np.clip(1 - P[:, 2, 2], 0, None)
    if (~sep).any():
        from .markov import transition
        for i in np.where(~sep)[0]:
            P[i] = np.array(transition(list(rates[i]), delta))
    return P


def propagate_np(pi, rates_seq, deltas):
    """pi: (n, 4); rates_seq: (W, n, 3); deltas: (W,) -> pi en el horizonte."""
    out = pi
    for r, d in zip(rates_seq, deltas):
        out = np.einsum("ni,nij->nj", out, transition_np(r, d))
    return out
