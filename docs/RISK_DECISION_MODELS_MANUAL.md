# Technical manual: RISK and DECISION models

**"Pocket Agronomist" platform · Specification to build inside the app**
Advisory Council + mathematical and econometric review · October 2026

> **Status and limits of this document.**
> - The formulations use classical methods (Markov chains, entropic risk, CVaR, conformal prediction, panels). They were written by the council without formal verification or a literature search in this session. **A mathematician and an econometrician must review them before the version is frozen.**
> - **No parameter comes calibrated for coffee.** Every initial value marked as *prior* is a starting point to be replaced with our own data.
> - The agronomic values (thresholds, efficacies, costs, doses) **are deliberately not in this manual**: they are defined by the catalog validated by technical extension (section 6).
> - The guarantees are always **conditional on the assumptions** of section 9.

---

## 0. How to read and use this manual

**For whoever builds (human or Claude inside the platform):**

1. First build a **synthetic data generator** (section 10) and the **test harness**. No module is considered good until it passes its property tests.
2. Module order: `Input adapter → RISK → Action catalog and rules → DECISION → Flags and presentation`.
3. **Reference implementation in Python** (numpy/scipy), validated with tests; then port to mobile and check with *golden vectors* (same inputs, same outputs within tolerance).
4. **Training/calibration in the cloud; inference on the phone.** The phone receives a *versioned parameter pack* (section 8).
5. Every output always carries: a range (not a single figure), the evidence level of its parameters and validity flags.

**General flow**

```
Stage 1 (vision) ──► ADAPTER ──► RISK ──► particles (belief) ──► DECISION ──► screen
 photos, class,       levels,      π0, π_T,    + action catalog          ranking, hidden costs,
 severity, conf.      counts,      loss ℓ,     + rules + costs + price   opportunity cost,
                      weights      CVaR, band                            value of waiting / re-measuring
```

---

## 1. Data contract and input adapter (Stage 1 → RISK)

This is the piece that most affects quality: errors here contaminate everything else.

### 1.1 What Stage 1 must deliver, per photo

```json
{
  "foto_id": "...", "lote_id": "...", "fecha": "...", "gps": [lat, lon],
  "tipo": "hoja | fruto | rama",
  "clase": "roya | minador | phoma | cercospora | broca | sana | ...",
  "p_clase": 0.0-1.0,            // calibrated confidence of the class
  "severidad_pct": 0.0-1.0,      // lesion/leaf (leaf) or damaged fruit/total (fruit)
  "p_calidad": 0.0-1.0,          // capture quality (sharpness, light, framing)
  "n_cerezas": integer | null,   // branch/fruit photos only
  "version_modelo": "..."
}
```

### 1.2 Adapter rules (in order)

| Step | Rule | Reason |
|---|---|---|
| 1. Filter | Discard photos with `p_calidad` or `p_clase` below a configurable threshold; remove duplicates (same plant, same seconds) | Bad or repeated photos inflate certainty |
| 2. Split by disease | **One chain per disease** (rust, borer, …); never mix classes in the same state vector | Dynamics and damage differ by disease |
| 3. Sampling unit | The unit is the **leaf** (for foliar diseases) or the **fruit** (for borer). The "level" describes that unit, and the damage function `g` is calibrated to translate the distribution of unit levels into yield loss | Avoids assuming that the severity of one leaf equals that of the whole plant |
| 4. Discretize | `s = 0,1,2,3` according to thresholds on `severidad_pct`. **Default thresholds to validate with extension**: e.g. healthy < 1%, mild 1–10%, moderate 10–30%, severe > 30% (leaf). For borer they are defined on % of damaged fruit. Thresholds are configurable per disease | Fixes the state space of the chain |
| 5. Counts | `n̂_s` = number of units at each level; `m` = total valid units | Input of the measurement layer |
| 6. Effective size | `m_eff = m / (1 + (b − 1)·ρ)` with `b` = units per plant (or per sampling point) and `ρ` = intra-group correlation | Units from the same plant are not independent |
| 7. Estimate `ρ` | With our own data: ANOVA estimator of intra-class correlation (units within plant/point). Until there is data, use a conservative value (high `ρ`, e.g. 0.3) and mark it as *prior* | Underestimating `ρ` gives intervals that are too narrow |
| 8. Minimum coverage | If `m_eff` < minimum (configurable, e.g. 10), the output is marked "insufficient sample" | Avoids conclusions from 2 photos |
| 9. Fruit and count | `n_cerezas` per branch is scaled to plot level with the sampling protocol and enters as a **covariate** of the potential-yield model, not as a deterministic number | The count is noisy |
| 10. Climate | Aggregate to weekly frequency: mean maximum temperature, days with relative humidity > 80%, accumulated rain; standardize with the training mean and deviation | Covariates of the dynamics |

### 1.3 Calibrate the detector before using it (mandatory)

1. **Confidence calibration:** *temperature scaling* on a validation set (not the training one). Verify with a reliability diagram and ECE.
2. **Level confusion matrix `Λ`** (4×4), with `Λ[s, ŝ] = P(detector says ŝ | true level s)`:
   - It is estimated with a subset **labeled by experts in the field**, with real light and devices.
   - Smoothing: `Λ̂[s, ŝ] = (n_{sŝ} + a) / (n_s + 4a)` with small `a` (e.g. 1).
   - **Hard condition:** `Λ̂[s, s] > 0.5` for every `s`. If it does not hold, the measurement correction is not reliable and the affected level is blocked until the detector improves.
   - Expected: errors concentrate in adjacent levels. If there are large jumps, review the thresholds.
3. **`Λ` is recalibrated per device and per season** if there is drift.

---

## 2. RISK model

### 2.1 What it answers

> *Given what the photos show today, the climate and the time left until harvest, how much yield am I going to lose and with what uncertainty?*

### 2.2 Structure (four layers plus a wrapper)

**States:** `s ∈ {0,1,2,3}` (healthy, mild, moderate, severe); 3 is absorbing.

**Layer M, measurement.** The observed counts depend on the true state and on the detector error:

```
n̂ ~ Multinomial( m_eff ,  Λᵀ π0 )        π0 = true distribution of levels today
Prior:  π0 ~ Dirichlet(α0)                 α0 = strength × regional distribution (small strength, e.g. 4)
```
Since `m_eff` is not an integer, a **tempered likelihood** is used:
```
log L(π0) = (m_eff / m) · Σ_s n̂_s · log( (Λᵀ π0)_s )
```

**Layer D, dynamics.** Continuous-time Markov chain that only moves forward:
```
q_{s,s+1}(w) = λ_s(w) = exp( γ_s + γ_wᵀ w ),   s = 0,1,2
Q = matrix with λ_s on the superdiagonal and −λ_s on the diagonal
With weekly climate i (piecewise constant):
   π_T = π0 · ∏_i expm( Q(w_i) · Δ_i )       (product in temporal order)
```
It is recommended to parametrize `γ_s = −log(τ_s)` with `τ_s` = mean weeks in state `s` under average conditions; this way the priors are elicited intuitively with technicians.

**Layer L, damage.**
```
g: {0,1,2,3} → [0,1],  g(0) = 0,  g non-decreasing
μ = Σ_s π_{T,s} · g(s)                       (bound μ ∈ [ε, 1−ε])
ℓ | μ ~ Beta( μ·κ , (1−μ)·κ )               κ = precision
```

**Layer U, uncertainty and tail.** Everything above is evaluated over `N` particles (samples of `π0` and of the parameters `γ, g, κ`):
```
CVaR_α(ℓ) = mean of ℓ in the worst α of the simulations   (α = 10%)
Outputs: P10, P50, P90 of ℓ;  P(ℓ > ℓ*)
```

**Conformal wrapper (coverage on what is observable).** The loss `ℓ` is never observed directly; the yield `Y` is:
```
Y = Ŷ0 · (1 − ℓ)           Ŷ0 = potential yield without pest (section 2.4)
```
Interval for `Y` with *conformalized quantile regression*: score `S_i = max( q10_i − Y_i , Y_i − q90_i )` on calibration plots, and the final interval is `[ q10 − Q̂ , q90 + Q̂ ]`, with `Q̂` = the `⌈(n+1)(1−α)⌉/n` quantile of the `S_i`.

### 2.3 Inference algorithm (steps)

1. Generate `N` particles (e.g. 2,000) of `π0` from the Dirichlet prior; for each one, a set of parameters `(γ, g, κ)` taken from the posterior parameter pack.
2. Weight each particle with the tempered likelihood of layer M. Normalize weights.
3. **Check the effective sample size** `ESS = 1 / Σ w_i²`. If `ESS < 0.2·N`, resample (or increase `N`) and raise a flag.
4. Propagate each particle with `expm` by climate segments (4×4 triangular matrix: trivial cost on the phone).
5. Compute `μ` and sample `ℓ` per particle.
6. Summarize with weighted quantiles and CVaR; convert to `Y`; apply the conformal widening.
7. Evaluate flags (2.6).

### 2.4 Parameters and how to calibrate them

| Parameter | Initial prior | How it is estimated with data | Minimum data | Frequency |
|---|---|---|---|---|
| **`Λ`** | Estimated from the validated set | Confusion-matrix counts with smoothing (1.3) | Hundreds of units labeled by an expert | Per season/device |
| **`τ_s`** (weeks per state) | Elicitation with technicians: wide LogNormal | Likelihood of the chain observed at discrete dates `L = ∏ P_{z_k z_{k+1}}(Δ_k)`; with measurement error it is a hidden Markov model (*forward* algorithm with `Λ`). Estimate by MAP or MCMC | **Repeated visits to the same plot** (≥ 2 dates), with varied intervals | Each season |
| **`γ_w`** (climate effect) | `N(0, 1)` with strong shrinkage | Estimated jointly with `τ_s` in the same likelihood | Several plots and weeks with different climate | Each season |
| **`g(1), g(2), g(3)`** | Extension table (values to be completed with technicians) | **Nonlinear least squares with monotonicity** on the panel (below). Parametrize with positive increments: `g(1)=σ(a1)`, `g(2)=g(1)+(1−g(1))σ(a2)`, `g(3)=g(2)+(1−g(2))σ(a3)` | ≥ 2 seasons for plot fixed effects | Each season |
| **`κ`** | Moderate | Method of moments: `Var(ℓ) = μ(1−μ)/(κ+1)` with the residuals | Panel residuals | Each season |
| **`Ŷ0`** | Regional average by variety/altitude | Plot fixed effects from the panel (below) | ≥ 2 seasons per plot | Each season |
| **Conformal width `Q̂`** | Conservative default width | Quantile of the scores `S_i` on plots with known harvest | **≥ 30 to 50 plots** of the recent season | Each season |

**Key identification trick:** calibrate the dynamics and the damage **separately**.
- `g` is estimated with the **last visit before harvest** (where `Δ ≈ 0`, so `π_T ≈ observed π`). Here the dynamics hardly matter.
- `τ_s, γ_w` are estimated with **repeated visits**, without needing the harvest.
This prevents dynamics errors from contaminating `g` and vice versa.

**Panel model for `g` and `Ŷ0`** (plot `j`, year `t`, cooperative `c`):
```
log Y_jt = α_j + δ_{c(j),t} + φᵀ x_jt + log( 1 − μ_jt(g) ) + u_jt
```
- `α_j`: plot fixed effect (soil, altitude, variety, stable management). Gives `Ŷ0 = exp(α_j + φᵀx + δ)`.
- `δ_{c,t}`: common shocks per cooperative-year (includes biennial bearing and general climate).
- `x_jt`: controls. **For harvest load use a measure observed early** (flowering or early cherry count), not lagged yield: using the lag produces bias in short panels.
- **Standard errors:** clustered by plot; with few clusters, *wild cluster* bootstrap.
- **A single season of data:** `α_j` cannot be estimated. Use a hierarchical random effect per cooperative and state the limitation in the app.

**Econometric warning:** if rust is more severe in high-load years (reverse causality), `g` is biased. Mitigation: control for early load, placebo and pre-trend tests.

### 2.5 Module inputs and outputs (contract)

**Inputs:** `n̂_s, m, b, ρ` (from the adapter) · `Λ` · `w_i, Δ_i` (weekly climate and forecast/scenarios) · weeks to harvest · `Ŷ0` with its uncertainty · posterior parameter pack (`γ, g, κ`) · conformal width · critical threshold `ℓ*`.

**Outputs:**
```json
{
  "particulas": [{"pi0": [...], "pi_T": [...], "w": 0.0, "mu": 0.0, "ell": 0.0}],
  "ell": {"p10": 0, "p50": 0, "p90": 0, "cvar10": 0, "p_sobre_umbral": 0},
  "Y":   {"p10": 0, "p50": 0, "p90": 0, "conforme": [low, high]},
  "banderas": ["..."],
  "evidencia": {"gamma": "prior|estimado", "g": "prior|estimado", "conforme": "default|calibrado"}
}
```

### 2.6 Validity flags (shown to the user)

| Flag | Condition | Effect |
|---|---|---|
| `muestra_insuficiente` | `m_eff` < minimum | No strong recommendation is shown |
| `ess_bajo` | `ESS < 0.2·N` | It is resampled; if it persists, confidence drops |
| `detector_no_corregible` | Some `Λ[s,s] ≤ 0.5` for a level with relevant counts | That level is blocked and a technician is requested |
| `clima_fuera_de_rango` | `w` outside the training range | Widen bands |
| `calibracion_vieja` | Parameters of the previous season not recalibrated | Mark |
| `parametros_prior` | `γ`, `g` or `κ_a` are still expert judgment | Show "estimate based on technical judgment, not on our own data" |

### 2.7 Mandatory tests (properties that must hold)

- More initial severity (in stochastic order) → predicted loss **never lower**.
- More weeks to harvest → loss **never lower**.
- More humidity (with humidity `γ_w` > 0) → loss **never lower**.
- Each row of `expm(QΔ)` sums to 1 and is upper triangular.
- With `Λ = I` and many photos, the estimator of `π0` approaches the observed proportion.
- With synthetic data, the coverage of the conformal interval approaches the nominal one.
- With small `α`, CVaR ≥ P90 ≥ P50.

---

## 3. DECISION model

### 3.1 What it answers

> *Given the possible alternatives for this plot today, which one is best, how much does each really cost (including what is hidden), and is it worth waiting or measuring again?*

### 3.2 Structure (sequential Bayesian decision with exponential utility)

**Initial belief:** the particles delivered by RISK.

**Epochs:** `t0` (today) and `t1 = t0 + Δ` (optional new measurement). v1 uses **two epochs**; a third epoch is added only when there is evidence to model it.

**Effect of an action `a` on the RISK model:**
```
1) Immediate effect:   π' = π · T_a,   with T_a[s, s−1] = d_a (s ≥ 1),  T_a[s, s] = 1 − d_a
   (pruning/sanitary harvest removes affected units; d_a ~ Beta with uncertainty)
2) Sustained effect:   λ_s → (1 − κ_a) · λ_s  during the duration of the effect
   (κ_a ~ Beta with uncertainty; 0 = no effect, 1 = stops progression)
```
Between actions the chain remains progressive; actions are the only thing that moves the state downward.

**Terminal margin (per particle):**
```
M = Y0 · (1 − ℓ_a) · P · q_a  −  Σ_epochs [ C_a + F_a + L_a + Cert_a + Cal_a + Dem_a ]
```

| Term | What it is | How it is computed |
|---|---|---|
| `Y0·(1−ℓ_a)·P·q_a` | Expected income under the action | `ℓ_a` simulated with the modified dynamics; `P` sampled from the price quantile table; `q_a` = quality factor |
| `C_a` | Direct cost | Input + application + equipment (catalog, local values) |
| `F_a` | Cost of money | `r × financed amount × time to harvest`. If borrowing is not needed, the opportunity cost of own capital is used |
| `L_a` | Labor opportunity cost | `day-labor wage(t) × labor days_a`, with `day-labor wage(t)` higher in harvest season |
| `Cert_a` | Certification/residue risk | Expected loss of premium if the input is not compatible |
| `Cal_a` | Effect on quality | Expected change in cup score or yield factor |
| `Dem_a` | Cost of delay | Obtained by comparing acting today vs. tomorrow (3.4) |

**Exponential utility (certainty equivalent):**
```
CE_θ(X) = −(1/θ) · log E[ exp(−θ X) ]       θ > 0 = producer's risk aversion
```
Useful properties: `CE(c + X) = c + CE(X)` (certain costs leave the expectation) and `CE(CE(X | info)) = CE(X)` (time consistency: the plan that is optimal today remains optimal tomorrow).

**Backward recursion:**
```
V_{t1}(b) = max_{a1 ∈ A_{t1}(b)} { − costs(a1) + CE_θ[ Terminal_margin | b, a1 ] }
V_{t0}    = max_{a0 ∈ A_{t0}}    { − costs(a0) + CE_{o}[ V_{t1}( b'(b, a0, o) ) ] }
```
where `o` is the outcome of the new measurement and `b'` the belief updated with it.

### 3.3 Implementation with particles (without overcomplicating)

1. For each `a0`, propagate the particles up to `t1` (with `T_{a0}` and `κ_{a0}`).
2. **Simulate the future observation** per particle: given the `π_{t1}` of that particle, simulate the counts of a sample of size `m1` with the matrix `Λ`, and **group them into 3 categories** (low, medium, high) according to the proportion of units at levels ≥ 2.
3. Each category is a node `o`; its particles, with their weights, form the belief `b'`.
4. At each node, for each `a1`: propagate to harvest, compute `M`, and the node's `CE` with `log-sum-exp` (numerical stability; work with `M` in units of thousands or millions of pesos so that `θ·M` does not overflow).
5. `V_{t1}(o) = max_{a1}`; then `V_{t0}(a0) = −costs(a0) + CE over o` weighted by the probability of each node.
6. Compute the outputs (3.5).

Cost: few actions (≤ 6) × 3 observations × few actions at `t1` × `N` particles. It is lightweight, but it is recommended to precompute the **policy table** in the cloud for frequent cases and leave the exact computation on the phone only for the plot's case.

### 3.4 Parameters and how to calibrate them

| Parameter | How it is obtained | Notes |
|---|---|---|
| **`θ`** (risk aversion) | **Elicitation with a 50/50 bet:** "how much certain money `x_c` do you accept so as not to gamble on winning or losing `h`?". Solve `x_c = −(1/θ)·ln cosh(θh)`; for small `θh`, `θ ≈ −2x_c/h²`. Repeat with 2 or 3 amounts. If `θ` changes a lot between amounts, the exponential utility describes the producer poorly: flag it and use a conservative default value | Show the user as "prudent / intermediate / risk-taking" |
| **`κ_a`, `d_a`** | **Start:** wide Beta priors from technical extension (evidence level = "expert judgment"). **Update:** with each follow-up "I did X and Y happened" via Beta-Binomial, only as an indication. **Real causal effect:** requires a pilot with a comparison group randomized by village or cooperative; without that, only bounds | Producers who act are not comparable to those who do not: the observed success rate is **not** the causal effect |
| **`C_a`, labor days, `Cert_a`, `Cal_a`** | Catalog per region, updated by technicians and the cooperative | Date of last update visible |
| **`day-labor wage(t)`, `r`, cash `K`, credit** | Producer profile (editable) | The user can change them and see the effect |
| **Price `P`** | Weekly quantile table from the cloud (time-series models compared against a simple baseline) | Always with an age stamp; **widen the quantiles according to the age of the data** with a configurable factor, calibrated by backtest |
| **Cost of re-measuring `c_obs`** | Time/day-labor cost of a new sampling visit | Configurable |

### 3.5 Module inputs and outputs (contract)

**Inputs:** RISK particles · plot and producer profile · action catalog (section 4) · price table · `θ`, `r`, `K`, credit, `day-labor wage(t)` · `Δ`, `m1`, `c_obs`.

**Outputs:**
```json
{
  "alternativas": [{
     "id": "...", "nombre": "...", "evidencia": "criterio_experto|estimado|piloto",
     "margen": {"ce": 0, "esperado": 0, "cvar10": 0, "p_negativo": 0},
     "perdida_pct": {"p50": 0, "p90": 0},
     "costos": {"directo": 0, "dinero": 0, "laboral": 0, "certificacion": 0, "calidad": 0},
     "costo_oportunidad": 0,
     "viable_hoy": true, "razon_no_viable": null,
     "domina_a": ["..."], "dominada_por": null
  }],
  "valor_de_esperar": 0,
  "valor_de_remedir": 0, "recomendar_remedir": true,
  "sensibilidad": {"theta_bajo": "...", "theta_alto": "..."},
  "banderas": ["..."]
}
```

**Definitions of the key outputs:**
- **Opportunity cost:** `OC(a0) = V* − V(a0) ≥ 0` (how much value is lost by choosing `a0` instead of the best).
- **Value of waiting:** `V(nothing)` already includes the option of acting at `t1`; the **cost of delay** of an action is `V(a today) − V(a at t1)`.
- **Value of re-measuring:** `V` with observation − `V` without observation (always ≥ 0 before cost). Re-measuring is recommended if it exceeds `c_obs`.
- **Second-order stochastic dominance:** `a` dominates `b` if `∫_{−∞}^{x} [F_b(m) − F_a(m)] dm ≥ 0` for all `x` (numerical check over the margin samples). It serves to rank without assuming a utility function when the order is clear.

### 3.6 Mandatory tests

- Higher `θ` → `CE` **never higher**; with `θ → 0`, `CE → E[M]`.
- `CE ≤ E[M]` always.
- `valor_de_remedir ≥ 0`; `OC ≥ 0`.
- With `κ_a = 0` and `d_a = 0` the action is equivalent to not intervening minus its costs.
- A more expensive action with the same effect never beats the cheaper one.
- Hidden costs are never omitted from the output.

---

## 4. Rules for generating the alternatives

**Principle:** *the rules only decide which alternatives are eligible. The value (margin, risk, hidden cost) is always computed by the decision model.* No recommendation comes from rules alone.

### 4.1 What has to be built

An **action catalog** (data, not code) and a **rules engine** that filters it.

**Record of each action in the catalog (example; `null` values are filled in by technical extension):**

```yaml
- id: poda_selectiva
  nombre: "Selective pruning of affected material"
  aplica_a: [roya]                     # classes
  nivel_min: 1                         # severity levels where it applies
  ventana_fenologica: null             # allowed stages (complete with technicians)
  semanas_min_a_cosecha: null          # minimum time before harvest
  efecto:
    d_a:   {dist: "beta", a: null, b: null}      # removes affected units
    kappa: {dist: "beta", a: null, b: null}      # reduces progression
    duracion_semanas: null
  costos:
    directo: null          # input/equipment
    jornales: null
    cert_penalizacion: null
    calidad_delta: null
  restricciones:
    incompatible_con_certificaciones: []
    periodo_de_carencia_semanas: 0     # minimum weeks between application and harvest
  requiere: []                         # inputs, equipment
  evidencia: "criterio_experto"        # criterio_experto | estimado | piloto
  fuente: null                         # who validated it and when
  paquete_de: []                       # if it is a predefined combination
```

**What goes into the catalog (initial categories to be validated by extension; the council does not fix products or doses):**

| Category | Example actions | Applies to |
|---|---|---|
| Surveillance | Re-measure in Δ weeks; consult the technician | All (always available) |
| Cultural management | Selective pruning/defoliation, shade management, weed control | Foliar diseases |
| Sanitary harvest | Timely picking and clean-up pass | Borer |
| Nutrition | Fertilization adjustment | Deficiencies, tolerance |
| Chemical or biological control | Specific products according to the technician | Rust, borer |
| Renewal | Stumping or partial replanting | Aged or heavily affected plots |
| Financial protection | Insurance, hedging | High tail risk (complementary action, not agronomic) |

> Doses, authorized products, efficacies and pre-harvest intervals **must come from official technical sources (Cenicafé/extension)** and be loaded into the catalog with date and person responsible. The system must not propose anything that is not in the catalog.

### 4.2 How the alternatives are generated and filtered (in order)

| Filter | Criterion | Source of information | Result if it does not pass |
|---|---|---|---|
| **F0. Always present** | "Do not intervene and re-measure" and "Consult the technician" | Always | — (they are the baseline) |
| **F1. Applicability** | The detected class, level and phenological stage fall within `aplica_a`, `nivel_min`, `ventana_fenologica` | RISK + plot profile | Discarded |
| **F2. Feasibility** | Time to harvest ≥ `semanas_min_a_cosecha` and ≥ pre-harvest interval; compatible with the producer's certifications; input and equipment available; **labor available that week**; cost ≤ cash + available credit | Producer profile + catalog | Shown as "not viable today" with the reason (not hidden: the producer sees what prevents it) |
| **F3. Economic threshold** | `E[ΔM] = E[M_a] − E[M_nothing] > 0` with non-negligible probability | Decision model computation | Marked "not justified with current data" |
| **F4. Dominance pruning** | Remove alternatives dominated by another (second-order stochastic dominance, or more expensive with a worse result) | Model computation | Hidden or grouped under "others" |
| **F5. Display limit** | Show at most 4 main alternatives + the 2 baseline ones | Configuration | The best by `CE` are shown |

**Packages (combinations):** combinations (e.g. pruning + chemical control) exist only as predefined catalog entries (`paquete_de`). No combinations are generated automatically, to avoid combinatorial explosion and agronomically invalid combinations.

**Mandatory on-screen labels per alternative:** evidence level (expert judgment / estimated with own data / tested in pilot), itemized hidden costs, and whether it is "not viable today" with its reason.

### 4.3 Decision rules over time (what moves between visits)

- If `P(M < 0)` is high for **all** alternatives, the recommendation is "consult the technician and evaluate financial protection".
- If `valor_de_remedir > c_obs`, suggest scheduling the visit in `Δ` weeks.
- If the `parametros_prior` flag is active, the output shows a warning and **never** a single recommendation.

---

## 5. How the two models connect (summary of the variables that travel)

| From | To | Variable | Notes |
|---|---|---|---|
| Stage 1 | Adapter | class, severity, confidence, quality, GPS, date, count | Contract 1.1 |
| Adapter | RISK | `n̂_s, m_eff, ρ` | One chain per disease |
| Climate/cache | RISK | `w_i, Δ_i` | Weekly |
| Cloud | RISK | `Λ, γ, g, κ, Ŷ0, Q̂` | Versioned pack |
| RISK | DECISION | particles `{π0, π_T, w}`, `Ŷ0`, flags | It is the belief |
| Catalog | DECISION | actions, costs, effects, restrictions | Data, not code |
| Cloud | DECISION | price quantiles with age | Weekly |
| Producer | DECISION | `θ, r, K, credit, day-labor wage` | Editable |
| DECISION | Screen | ranking, hidden costs, `OC`, value of waiting and re-measuring | With evidence and flags |
| Follow-up | Cloud | action taken, actual cost, actual harvest | Feeds all the calibration |

---

## 6. What has to be built (backlog per module)

| # | Module | What it does | Depends on | Priority |
|---|---|---|---|---|
| 1 | **Synthetic generator + test harness** | Simulates plots, chain, detector error, panel and decisions; runs property tests | — | **P0** |
| 2 | **Input adapter** | Rules 1.2; computes `n̂_s, m_eff`, weekly climate | 1 | P0 |
| 3 | **RISK engine** | Layers M, D, L, U; particles; ESS; flags | 1, 2 | P0 |
| 4 | **Calibration pipeline (cloud)** | Estimates `Λ, τ_s, γ_w, g, κ, Ŷ0, Q̂`; produces the versioned parameter pack | 1, real data | P0 (with synthetic), then real |
| 5 | **Action catalog + schema validator** | Loads, validates and versions records; shows evidence level | Technical extension | P0 |
| 6 | **Rules engine (F0–F5)** | Generates eligible alternatives | 5 | P1 |
| 7 | **DECISION engine** | 2-epoch tree, `CE`, `OC`, values of waiting and re-measuring | 3, 5, 6 | P1 |
| 8 | **Elicitation of `θ` and editable profile** | 50/50 bet screen and editable assumptions | 7 | P1 |
| 9 | **Price table with age** | Weekly sync and widening by age | Cloud | P1 |
| 10 | **Conformal and drift monitoring** | `Q̂`, realized coverage per season | 4 | P2 |
| 11 | **Follow-up capture** | "What did you do and what happened?" at 4–8 weeks; actual harvest per plot | App | **P0 from the pilot** |
| 12 | **Mobile port + golden vectors** | Reimplement and verify against the reference | 3, 7 | P2 |
| 13 | **Result screens** | Ranges, flags, evidence, hidden costs, voice | 3, 7 | P1 |

---

## 7. Build order and acceptance criteria

| Stage | Deliverable | Acceptance criterion |
|---|---|---|
| **S0** | Synthetic generator + harness + data contracts | The property tests (2.7 and 3.6) run and fail when a deliberate error is introduced |
| **S1** | Adapter + RISK (no conformal) | With synthetic data it recovers `π0` and the loss with low bias; all tests of 2.7 pass |
| **S2** | Calibration pipeline | Recovers the known synthetic parameters; identifiability verified (`g` and `τ_s` are estimated well separately) |
| **S3** | Catalog + rules + DECISION | Tests of 3.6 pass; alternatives match rules F0–F5 in synthetic cases |
| **S4** | Conformal, flags, prices, elicitation | Synthetic coverage close to nominal; flags trigger in the designed cases |
| **S5** | Mobile port + field pilot | Golden vectors match within tolerance; follow-up cycle closed with real producers |

**Stop rule:** if in the pilot the RISK model **does not beat a simple baseline** (regression with severity and climate) out of sample, automatic recommendation is not activated; informational mode is kept.

---

## 8. Parameter pack for the phone

A versioned and signed file, updated when there is signal:

```
{
  "version": "AAAA-MM-DD-vN",
  "lambda": [[...]],                       // confusion matrix
  "draws": {"gamma": [...S samples...], "g": [...], "kappa": [...]},
  "yield_model": {"coef": {...}, "residual_scale": ...},
  "conformal_Q": ...,
  "umbrales_niveles": {"roya": [...], "broca": [...]},
  "catalogo_acciones": [...],
  "precios": {"fecha": "...", "cuantiles": {...}},
  "estado_evidencia": {"gamma": "prior|estimado", "g": "...", "kappa_a": "..."}
}
```

`S` posterior samples (a few hundred) are carried instead of the estimation algorithm. The phone only samples from them; it does not fit models.

---

## 9. Assumptions ledger (summary)

| ID | Assumption | What happens if it fails | How it is monitored |
|---|---|---|---|
| A1 | Detector errors depend only on the true level and `Λ` transfers from the validated set to the field | Biased correction | Field subsample with expert label |
| A2 | `Λ[s,s] > 0.5` | It cannot be corrected | Flag `detector_no_corregible` |
| A3 | Units conditionally independent after correcting by `m_eff` | Intervals too narrow | Estimated `ρ`; spatial autocorrelation of residuals |
| A4 | Markov progression, upward only | Poor dynamics | Frequency of "drops" greater than the expected error |
| A5 | Log-linear climate effect | Poor dynamics | Residuals vs. climate |
| A6 | `g` monotone and stable across seasons | Poorly calibrated loss | Validation leaving one season out |
| A7 | Severity exogenous in the panel (conditional on fixed effects and controls) | Biased `g` | Placebos, pre-trends |
| A8 | Calibration plots exchangeable with the new ones | Lower real coverage | Realized coverage per season |
| A9 | Effect of actions causally identified without interference between neighbors | Only bounds | Pilot randomized by village |
| A10 | Price independent of the plot's loss | Tail underestimated | Loss–price correlation per cooperative |
| A11 | Exponential utility describes the producer | Poorly aligned recommendation | Consistency of the elicitation across amounts |
| A12 | One chain per disease, with losses combined as `1−ℓ = ∏(1−ℓ_k)` | Interactions ignored | Compare with observed losses on plots with two pests |

**The loss counterfactual is the weakest point of the system.** The loss without pest is not observed; it is only approximated with the panel (A7). Without at least two harvest seasons per plot, the calibration of `g` rests on the regional hierarchy and on technical judgment, and the app must say so.

---

## 10. Synthetic data generator (minimum specification)

It serves to test everything before having real data. It must simulate:

1. **Plots and climate:** `J` plots in `C` cooperatives, with random weekly climate (covariate `w`).
2. **True dynamics:** Markov chain with known true parameters `(τ_s, γ_w)`; visits at irregular dates.
3. **Detector:** level output `ŝ` generated with a known true `Λ` (including cases with `Λ[s,s] < 0.5`).
4. **Damage and yield:** known true `g`, `κ`, plot and cooperative fixed effects, biennial bearing; observed `Y`.
5. **Actions and follow-up:** actions with true `κ_a`, `d_a`; simulated decisions and outcomes.
6. **Price:** series with known distribution, with variable age.

**What is tested with it:**
- That the estimator recovers `π0`, `Λ`, `τ_s`, `γ_w`, `g`, `κ` with low bias.
- That the conformal coverage is the nominal one.
- That the decision policy is the known optimum in small cases solved by hand.
- That the flags trigger when the assumptions are deliberately broken.

---

## 11. What the system must always tell the producer

1. **A range, not a number**, with the evidence level.
2. **What was assumed** (day-labor wage, price, rate) and that it can be edited.
3. **What is technical judgment and what is our own data** (*prior* parameters flag).
4. **Why an alternative is not available today** (liquidity, deadline, certification).
5. **That it is decision support, not a substitute for the technician.**

---

*Working document. The formulations require formal review by the mathematician and the econometrician; the agronomic values, costs and thresholds must be provided and signed off by technical extension before use with producers.*
