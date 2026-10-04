"""Criterio S2 del manual: la calibración recupera parámetros sintéticos conocidos, con g y τ_s identificados por
separado; la cobertura conforme es la nominal; Λ con diagonal <= 0,5 se bloquea."""
import numpy as np

from jani_rd.calibrate import conformal_q, estimate_lambda, fit_damage_panel, fit_dynamics, pi_from_counts
from jani_rd.params import LAMBDA_PRIOR
from jani_rd.synthetic import simulate_confusion, simulate_panel, simulate_visits

LAM = np.array([[0.9, 0.1, 0, 0], [0.08, 0.84, 0.08, 0], [0, 0.1, 0.8, 0.1], [0, 0, 0.12, 0.88]])


def test_lambda_se_recupera_y_bloquea_diagonal_baja():
    rng = np.random.default_rng(1)
    lam_hat, blocked = estimate_lambda(simulate_confusion(rng, LAM, 400))
    assert np.abs(lam_hat - LAM).max() < 0.05 and blocked == []
    bad = LAM.copy()
    bad[2] = [0, 0.45, 0.45, 0.1]
    _, blocked = estimate_lambda(simulate_confusion(rng, bad, 400))
    assert blocked == [2]


def test_pi_corregido_por_lambda():
    rng = np.random.default_rng(2)
    pi = np.array([0.5, 0.3, 0.15, 0.05])
    det = np.zeros(4)
    for s, n in enumerate((rng.multinomial(5000, pi))):
        det += rng.multinomial(n, LAM[s])
    assert np.abs(pi_from_counts(det, LAM) - pi).max() < 0.03


def test_dinamica_se_recupera_con_visitas_repetidas():
    rng = np.random.default_rng(3)
    true_log_tau = np.log([6.0, 4.0, 7.0])
    true_gw = np.array([0.3, 0.4, -0.2])
    lots = simulate_visits(rng, J=40, log_tau=true_log_tau, gamma_w=true_gw, Lam=LAM, weeks=30, m=60)
    fit = fit_dynamics(lots, LAM, prior_log_tau=np.log([8, 4, 6]), prior_sd=[0.5, 0.5, 0.5], gw_sd=1.0, S=50)
    assert fit["converged"]
    assert np.abs(fit["log_tau"] - true_log_tau).max() < 0.35
    assert np.abs(fit["gamma_w"] - true_gw).max() < 0.25
    sd = np.sqrt(np.diag(fit["cov"]))
    assert (sd > 0).all() and (sd < 1).all()


def test_dano_g_y_kappa_se_recuperan_con_panel_de_dos_temporadas():
    rng = np.random.default_rng(4)
    g_true = (0.03, 0.12, 0.35)
    rows = simulate_panel(rng, J=80, C=4, seasons=2, g=g_true, kappa=40.0, Lam=LAM, m=80)
    fit = fit_damage_panel(rows, LAM, S=30)
    assert np.abs(np.array(fit["g"]) - np.array(g_true)).max() < 0.07
    assert fit["g"][0] <= fit["g"][1] <= fit["g"][2]          # monotonía
    assert 15 < fit["kappa"] < 120
    assert len(fit["draws_g"]) > 20


def test_cobertura_conforme_cercana_a_la_nominal():
    rng = np.random.default_rng(5)
    n = 4000
    y0 = rng.uniform(800, 1500, n)
    y = y0 * (1 - rng.beta(2, 8, n))
    q10, q90 = y0 * 0.85, y0 * 0.9            # modelo demasiado estrecho a propósito
    cal, test = slice(0, 2000), slice(2000, None)
    Q = conformal_q(q10[cal], q90[cal], y[cal], alpha=0.2)
    cov = np.mean((y[test] >= q10[test] - Q) & (y[test] <= q90[test] + Q))
    assert abs(cov - 0.8) < 0.03
    assert not (abs(np.mean((y[test] >= q10[test]) & (y[test] <= q90[test])) - 0.8) < 0.03)  # sin ensanche no cubre


def test_lambda_prior_tiene_diagonal_mayor_a_0_5():
    assert all(LAMBDA_PRIOR[s][s] > 0.5 for s in range(4))
