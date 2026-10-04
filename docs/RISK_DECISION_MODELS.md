# RISK and DECISION models — implementation and calibration

Implements `docs/RISK_DECISION_MODELS_MANUAL.md`. Date: 2026-10-03. Parameter pack: `2026-10-03-v1`.

> **Honest summary.**
> - Both models are implemented as the manual describes and pass all of its property tests. The app
>   reproduces them exactly: the Python = TypeScript golden vectors match.
> - Real data was used to calibrate Λ (with the segmenter), the weekly climate and the efficacy orderings.
> - The rust dynamics could **not** be estimated with the public dataset available: it violates assumption A4 and does not beat
>   a simple baseline.
> - Because of **stop rule §7**, the app stays in **informational mode**: it shows ranges, alternatives and hidden
>   costs, but not a single automatic recommendation. That is what the manual requires while the parameters are
>   *priors*.

## 1. Where everything lives

| Piece | File | Manual |
|---|---|---|
| Reference implementation (Python) | `training/riesgo_decision/jani_rd/` | §0.3 |
| Input adapter (photos → counts per level) | `adapter.py` / `app/src/engine/rd/adapter.ts` | §1.2 |
| RISK engine (layers M, D, L, U; conformal; flags) | `risk.py`, `markov.py` / `risk.ts`, `markov.ts` | §2 |
| Action catalog + rules F0–F2 | `catalog.py`, `demo_catalog.py` / `catalog.ts` | §4 |
| DECISION engine (2 epochs, CE, CVaR, VOI, OC, dominance, F3–F5) | `decision.py` / `decision.ts` | §3, §4.2–4.3 |
| Synthetic generator and calibration | `synthetic.py`, `calibrate.py`, `real_data.py` | §2.4, §10 |
| Λ with the segmenter | `calibrate_lambda.py` | §1.3 |
| Local pipeline → parameter pack | `run_calibration.py` → `app/public/models/riesgo-v1/params.json` | §8 |
| Tests | `tests/test_properties.py` (31), `tests/test_calibration.py` (6), `app/src/tests/rd.golden.test.ts`, `rd.run.test.ts` | §2.7, §3.6, §7 |
| Connection to the app | `app/src/engine/rd/run.ts` (inputs), `rdWorker.ts` + `client.ts` (Web Worker), `FlowContext.startRd` | §5 |

## 2. Consistency with the vision models (M1 and M2)

| Manual input (§1.1) | Where it comes from in Jani |
|---|---|
| `clase`, `p_clase` | `arabica-v1` classifier (M1): class and temperature-calibrated probability. "I am not sure" photos do not enter. |
| `severidad_pct` | `leafseg-v1` segmenter (M2): symptom pixels ÷ (leaf + symptom), the same formula as BRACOL. |
| No segmenter | The diseased leaf enters as a **censored** observation ("level ≥ 1"): no level is invented. |
| `p_calidad` | Photos that arrive have already passed the quality check (bad ones are retaken). |
| Levels 0–3 | The manual's default thresholds: < 1%, 1–10%, 10–30%, > 30% (configurable per disease). |
| Λ (4×4) | **Estimated with the real segmenter** against BRACOL expert masks (val + test, 100 leaves). |

Estimated Λ (rows = true level, columns = detected):

| | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| 0 | **0.90** | 0.03 | 0.03 | 0.03 |
| 1 | 0.02 | **0.93** | 0.04 | 0.02 |
| 2 | 0.07 | 0.13 | **0.73** | 0.07 |
| 3 | 0.25 | 0.25 | 0.25 | **0.25** (locked) |

Level 3 (severe, > 30%) is **locked**: BRACOL has no leaf like that in validation or test. If one is
observed, the app activates `detector_no_corregible` (detector not correctable) and asks for a technician, as the manual requires.

## 3. Verification

| Manual criterion | Result | Evidence |
|---|---|---|
| S0: tests fail with deliberate errors | ✅ 8 of 8 mutations detected (climate with inverted sign, inverted CE, adapter, pruning effect, cost of money, own box) | mutation test on `tests/test_properties.py` |
| §2.7 RISK properties | ✅ monotonicity in severity, weeks and humidity; expm rows; π0 → observed with Λ = I; CVaR ≥ P90 ≥ P50 | 31 tests green |
| §3.6 DECISION properties | ✅ higher θ ⇒ CE not higher; CE ≤ E; VOI ≥ 0; OC ≥ 0; action with no effect = do not intervene − costs; the most expensive with the same effect never wins; hidden costs always present | same |
| S2: calibration recovers synthetic parameters | ✅ Λ (error < 0.05), τ and γ_w with repeated visits, monotone g (error < 0.07) with a 2-season panel, κ, 80% ± 3% conformal coverage | 6 tests green |
| S5: golden vectors | ✅ TypeScript reproduces Python (generator, transitions, 2 complete risk and decision cases) | `rd.golden.test.ts` |
| Performance | Decision with 1,000 particles: ~1.2 s on a PC; on the phone it runs in a Web Worker | measured with the Node profiler |

## 4. Calibration with real data

| What | Data | Result |
|---|---|---|
| Normal weekly climate | Daily NASA POWER 2001–2024 at **59 coffee-growing points**: 32 municipalities of Colombia; 27 zones of Kenya, Uganda, Tanzania, Rwanda, Burundi and Ethiopia (`build_climate.py`) | Standardized anomalies by week of the year in each pack. The app uses the point closest to the phone (see §7). |
| Λ | M2 segmenter vs. BRACOL expert masks | Above; level 3 locked |
| Rust dynamics (τ0, γ_w) | CATIE/Mendeley (Lasso et al. 2020, CC BY 4.0): 442 observations, 111 dates | **Not identifiable.** Incidence **drops** in 45% of the 14-day intervals (leaf turnover): it breaks assumption A4. Out of sample, the error is 13.5 points with Markov, 12.4 with persistence and 11.5 with linear regression. The prior is kept and stop rule §7 stays active. |
| Product efficacy | USDA ARS Hawaii 2022–23 (CC0) | Slope of the weekly incidence logit: Priaxor −0.24/−0.15 (drops), coppers 0.00/+0.12, biologicals +0.11/+0.15. It matches the order of the catalog priors (systemic > copper > biological). Only an indication: there is no untreated plot. |
| g, κ, Ŷ0, conformal width, θ | — | **Prior**: real harvests per plot are needed (§9.2), which the tracking starts to capture |

**Finding for the mathematician and the econometrician:** with field data, the "ascending only" chain does not describe
incidence per plot, because new healthy leaves dilute it. The proposal is to add a leaf turnover rate to state 0 and
re-estimate with the repeated visits that the app's tracking generates.

## 5. Assumptions added in this implementation

- **A5'.** The climate effect γ_w is applied to **anomalies** relative to the place's normal, not to absolute
  values. This way the altitude bias of the NASA POWER grid (~0.5°) does not contaminate the result.
- The same γ_w acts on the three transitions (with incidence only the infection one is observed).
- 1,000 particles (the manual suggests ~2,000): the quantiles are stable and the computation fits on a low-end phone.
- Common random numbers across actions: differences between alternatives are not produced by simulation noise.
- Decision unit: **kilos of coffee equivalent** (money ÷ median price); θ = r ÷ median expected yield, with
  r = 3 (prudent), 1 (intermediate, default) and 0.3 (risk-taking).

## 6. How to recalibrate (local)

```bash
cd training/riesgo_decision
..\..\.venv\Scripts\python -m pytest tests -q                           # properties + synthetic recovery
..\..\.venv\Scripts\python calibrate_lambda.py --model ../../app/public/models/leafseg-v1 --data <lara2018>/segmentation/dataset
..\..\.venv\Scripts\python run_calibration.py --rust data/CLRI_14D.csv --usda data/usda_fungicides_clr.csv --lambda_json data/lambda.json
cd ../../app && npx vitest run src/tests/rd.golden.test.ts            # the app is still identical to Python
```

## 7. Climate by location (GPS)

- In **Packs → 📍 Use my location for climate**, the person grants permission. GPS works without internet.
- The app stores the location **only on the phone** (IndexedDB) and picks the pack's nearest coffee-growing point,
  if it is within `max_km` (150 km).
- Without permission, or far from all the points, `default_point` is used: Chinchiná for Colombia and Nyeri for East Africa.
- The saved case keeps only the point's **name**, never the coordinates, and nothing leaves the phone.
- Tests: `app/src/tests/location.test.ts` (distance, nearest point, fallback, `buildInputs`) and
  `app/e2e/ubicacion.spec.ts` (browser with simulated location in Pitalito, Huila).
- Adding points: edit `REGIONS` in `training/riesgo_decision/build_climate.py`, run it and regenerate the
  packs. There is no need to touch the app's code.
