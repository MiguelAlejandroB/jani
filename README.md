# Jani — offline AI decision support for coffee farmers

Jani is an Android app that turns a phone into an **offline plant-health advisor**. A farmer photographs coffee leaves;
Jani measures the damage, names the disease, projects the yield loss to harvest and compares what to do — **treat,
wait or consult a person** — in kilograms of coffee. Everything runs **on the device**: no internet after install, and
photos never leave the phone.

Built for the **Small AI for Development** hackathon (World Bank × Hack-Nation), Agriculture track.

**Download (Android):** [Jani.apk — v0.1.0](https://github.com/MiguelAlejandroB/jani/releases/download/v0.1.0/Jani.apk)
· Android 8+ recommended (installs from Android 6) · ~19 MB · works in airplane mode.

> Jani suggests; the farmer decides. It does not replace an extension agent.

---

## 1. What the farmer sees

```
Photos ─► Diagnosis ─► Weather question ─► Risk ─► Decision ─► Save / SMS to extension agent
```

1. **Photos** — 5 leaves (one per plant, walking the plot in zigzag); up to 30 to sharpen the estimate.
   Blurry, dark or leafless photos are rejected with a spoken reason.
2. **Diagnosis** — the dominant condition across the photos, or *"I'm not sure"* when confidence is low.
3. **One question** — did it rain heavily this week?
4. **Risk** — likely loss in **kg**, a P10–P90 range, the *bad-year* loss and the chance of a large loss, shown as a
   **ripening coffee cherry** (green / half-ripe / red; grey = consult).
5. **Decision** — option cards (do nothing, prune, systemic fungicide, copper, biological, miner control) with expected
   loss, cost, net gain vs. doing nothing, hidden costs (labour, interest, certification) and "N out of 10 times it
   beats doing nothing". Options that are not feasible today are greyed out with the reason.
6. **Save** — the case (never the photos) is stored on the phone; high-risk cases can be sent to an agent **by SMS,
   text only**.

Low-literacy design: large buttons, one action per screen, icons, and **automatic audio** on every screen (pack MP3s
if present, otherwise the phone's offline text-to-speech).

---

## 2. The four models

| # | Model | Type | Size on device | What it answers |
|---|---|---|---|---|
| M1 | Leaf classifier `arabica-v1` | MobileNetV3-Small, ONNX INT8 | 1.9 MB | Which condition? (healthy, rust, leaf miner, phoma, cercospora) |
| M2 | Leaf segmenter `leafseg-v1` | LR-ASPP MobileNetV3-Large, ONNX INT8 | 3.7 MB | Is there a leaf? How much of it is damaged? |
| M3 | Risk model `riesgo-v1` | Bayesian state-space model (Markov chain + particle filter) | params JSON | How many kg could I lose by harvest? |
| M4 | Decision model | Risk-averse expected-utility comparison | code + pack catalog | Which option is worth it for me? |

### M2 — Segmentation and severity
- Labels every pixel (256×256) as **background, leaf or symptom**.
- Severity `s = L / (H + L)` (symptom pixels over leaf + symptom), the same formula as the BRACOL expert masks.
- Also a **leaf gate**: rejects photos with too little leaf, non-green "leaf" pixels or noise-like texture.
- Test set (BRACOL, n = 50): mIoU **0.90**, symptom IoU 0.74, severity MAE **0.5 points**, Pearson r **0.98**,
  severity level exact 88 % / within one level 100 %. Trained 60 epochs in Colab.

### M1 — Calibrated classification with abstention
- Input 224×224; outputs `softmax(z / T)` with a **temperature T** fitted on field photos, then an
  **abstention rule**: if the top probability or the margin is below threshold, Jani says *"I'm not sure"*.
- Trained 8 epochs on **JMuBEN (Kenya) + BRACOL (Brazil)**; temperature and thresholds calibrated on a held-out
  half of the Uganda and Peru field sets.
- **Honest generalisation numbers** on countries never used for training (deployed model):
  Peru **58 %**, Uganda **25 %**. The lab-to-field gap is large and documented in
  [docs/MODEL_RESULTS.md](docs/MODEL_RESULTS.md); it is why abstention and "consult" exist.

### M3 — Risk: from leaves to kilograms
1. **Adapter.** Each photo becomes an observation per disease: severity → damage level 0–3
   (< 1 %, 1–10 %, 10–30 %, > 30 %); without a segmenter, a sick leaf is a *censored* "level ≥ 1" observation.
2. **Measurement error.** A 4×4 matrix **Λ** (estimated with the real segmenter against expert masks) gives
   P(detected level | true level). Level 3 is locked (no >30 % leaves in BRACOL) and triggers "consult".
3. **Dynamics.** Disease advances through a **monotonic 4-state Markov chain** (0→1→2→3). Transition rates come
   from dwell times τ and are scaled by **standardised local climate anomalies** (max temperature, humidity, rain),
   from NASA POWER daily data 2001–2024 at **65 coffee locations**; the phone picks the nearest by GPS (≤ 150 km).
4. **Inference.** **1,000 particles** sample the plot's initial state π₀ from a Dirichlet regional prior; a tempered
   likelihood of the observed counts through Λ re-weights them; each particle is propagated to harvest.
5. **Loss.** Expected damage per state `g`, with **Beta** noise → loss fraction ℓ; yield `Y = Ŷ₀·(1 − ℓ)` with
   log-normal yield uncertainty and a conformal band. Output: P10 / P50 / P90 of loss, **CVaR₁₀** (mean loss in the
   worst 10 %), and P(loss > threshold), which drives the cherry colour.
6. **Flags** shown to the farmer: few leaves, low effective sample size, uncorrectable detector level, climate out of
   range, prior parameters.

### M4 — Decision: risk-averse, in kilograms of coffee
- Two epochs (now / in 3 weeks). Every action's net outcome X is converted to **kg-equivalents** (money ÷ price).
- Score = **certainty equivalent** with exponential utility:
  `CE = −(1/θ) · ln E[e^(−θX)]`, θ = r / median yield, r ∈ {3 cautious, 1 middle, 0.3 bold}.
- Costs include direct cost, **labour** (wage × days), **cost of money** (interest or own-cash opportunity cost),
  certification penalties and quality effects. Feasibility rules F0–F5 (deadline before harvest, certification,
  labour, liquidity).
- **Common random numbers** across actions, so differences are not simulation noise; **value of information** of
  re-measuring in 3 weeks; second-order stochastic dominance; "out of 10 times better than nothing".
- **Stopping rule.** While parameters are priors, Jani runs in **informative mode**: it shows ranges and trade-offs but
  does not single out one recommendation.

M3 and M4 are implemented twice — a Python reference (`training/riesgo_decision/jani_rd/`) and the app's TypeScript
(`app/src/engine/rd/`) — and **golden vectors** prove both give identical results (same seeded RNG: mulberry32 +
Box-Muller + Marsaglia-Tsang). The app runs them in a **Web Worker** (~1.2 s on a laptop).

---

## 3. Edge AI: how it runs on the phone

- M1 and M2 are exported to **ONNX** and **INT8-quantised** (~4× smaller than FP32), executed with
  **onnxruntime-web (WebAssembly)**. The `.wasm` files ship inside the app (`app/public/ort/`), never from a CDN.
  Browser-vs-Python output difference was verified < 0.5.
- Photos are downscaled with anti-aliasing (stepwise halving), matching the PIL bilinear resize used in training.
- The web app is a **PWA** (Vite + Workbox precache) wrapped as an Android APK with **Capacitor**.
- All farmer-facing text, prices, yields, calendars, action catalogues and climate normals come from a **regional
  pack** (`packs/<id>/pack.json`); no agronomic or economic number is hard-coded. Every value goes through
  `engine/resolve.ts`: real sourced value → else demo value (the screen shows a **"demo data"** badge) → else *consult*.

---

## 4. Regional packs

| Pack | Language | Region | Climate points |
|---|---|---|---|
| `colombia-andina` | Spanish | Colombian coffee belt | 32 |
| `noor-africa-oriental` | Kiswahili | Kenya, Uganda, Tanzania, Rwanda, Burundi, Ethiopia | 27 |
| `english-demo` | English | Demo for all regions | 65 (incl. Hawaii, Puerto Rico, Brazil, Guatemala, Costa Rica) |

A pack is a zip (`pack.json` + optional `audio/*.mp3`) installable from the catalogue or a file. Teams fill real
prices, yields and calendars **without touching code**. Packs currently carry `demo_values`; real values are `null`
with `source: "TODO"` until a local partner signs them off.

---

## 5. Repository layout

```
app/                     React 19 + Vite + TypeScript (strict) PWA, Capacitor Android project
  src/engine/            see, segment, quality, session, predict, decide, resolve, voice, sms
  src/engine/rd/         risk & decision models (adapter, markov, risk, decision, catalog, location, worker)
  src/screens/           one file per screen
  public/models/         arabica-v1 (M1), leafseg-v1 (M2), riesgo-v1 (M3 params) with model cards
  public/ort/            onnxruntime-web WASM
  e2e/                   Playwright end-to-end tests
  android/               Capacitor Android project
packs/                   regional packs (pack.json, audio/)
training/
  jani_train.ipynb       M1 training notebook (Colab)
  jani_segmentation.ipynb M2 training notebook (Colab)
  riesgo_decision/       M3/M4 Python reference, calibration, climate builder, tests
  make_audio.py          optional MMS-TTS audio generation per pack
scripts/                 pack builder
docs/                    detailed documentation (English); docs/es/ = Spanish originals
```

---

## 6. Build and run

Requirements: Node 20+, npm. For the APK: JDK 21 and Android SDK 35.

```bash
cd app
npm install                 # also copies the onnxruntime-web WASM into public/ort
npm run dev                 # local dev server
npm run build               # typecheck + production PWA in app/dist (builds packs first)
npm run preview             # serve the build
npm run verify              # typecheck + lint + unit tests + build + e2e

# Android APK (debug)
npm run android:sync        # build + capacitor sync
cd android && ./gradlew assembleDebug   # → android/app/build/outputs/apk/debug/app-debug.apk
```

Tests: **169 Vitest unit tests** (engine, packs, risk/decision golden vectors, location, field fixtures) and
**Playwright e2e** (full route in simulated and real-model modes, airplane mode, packs, GPS climate, screenshots).
Python: `training/riesgo_decision/tests` (31 property tests + 6 synthetic-recovery tests).

Recalibrate M3/M4 locally:

```bash
cd training/riesgo_decision
python -m pytest tests -q
python run_calibration.py --rust data/CLRI_14D.csv --usda data/usda_fungicides_clr.csv --lambda_json data/lambda.json
python build_climate.py     # NASA POWER climate normals for every coffee location
```

---

## 7. Data and licences

| Dataset | Country | Size | Licence | Use |
|---|---|---|---|---|
| [JMuBEN + JMuBEN2](https://huggingface.co/datasets/Project-AgML/arabica_coffee_leaf_disease_classification) | Kenya | 58,549 images | CC BY 4.0 | M1 training |
| [BRACOL](https://data.mendeley.com/datasets/yy2k5y8mxg/1) | Brazil | 1,747 leaves + masks | CC BY 4.0 | M1 training, M2 training, Λ estimation |
| [Uganda (Soroti University)](https://data.mendeley.com/datasets/k36wnd6knb/1) | Uganda | 3,312 images | CC BY 4.0 | M1 calibration / held-out test |
| [Peru (Saposoa)](https://data.mendeley.com/datasets/mfpxg4y65r/1) | Peru | 1,500 images | CC BY 4.0 | M1 held-out test |
| CATIE / Mendeley rust panel (Lasso et al. 2020) | — | 442 obs. | CC BY 4.0 | M3 dynamics attempt |
| USDA ARS Hawaii fungicide trials 2022–23 | USA | — | CC0 | Ordering of treatment efficacy |
| NASA POWER daily (AG community) | 65 sites | 2001–2024 | Public | Climate normals |

Fonts: Fraunces (SIL OFL). Optional Swahili audio: Meta MMS-TTS (non-commercial licence; see docs/DATA.md).

---

## 8. Honest limitations

- **Field generalisation of M1** is weak (Peru 58 %, Uganda 25 %); abstention and "consult" mitigate it.
- **Risk parameters are expert priors.** The public rust panel violated the monotonic-chain assumption (leaf renewal
  dilutes incidence), so dynamics could not be identified; Jani therefore stays in informative mode and shows a
  "technical-criteria estimate" flag. Real harvests per plot, captured by the follow-up feature, are needed.
- **Prices, yields and costs are demo values** until local partners provide sourced numbers.
- The APK is a **debug build** (not on Play Store).

---

## 9. Documentation

| Document | Content |
|---|---|
| [docs/RISK_DECISION_MODELS.md](docs/RISK_DECISION_MODELS.md) | Risk & decision implementation, calibration, verification |
| [docs/RISK_DECISION_MODELS_MANUAL.md](docs/RISK_DECISION_MODELS_MANUAL.md) | Full mathematical specification of M3/M4 |
| [docs/MODEL_RESULTS.md](docs/MODEL_RESULTS.md) | M1 training runs and field results |
| [docs/DATA.md](docs/DATA.md) | Datasets, licences, sizes, gaps |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Design decisions log |
| [docs/QA_REPORT.md](docs/QA_REPORT.md) | QA and acceptance criteria |
| [docs/HUMAN_TODO.md](docs/HUMAN_TODO.md) | What the team must still provide (real values, audio, validation) |
| [JANI_PLAN.md](JANI_PLAN.md) | Original product specification (historical) |
| [docs/es/](docs/es/) | Spanish originals |
