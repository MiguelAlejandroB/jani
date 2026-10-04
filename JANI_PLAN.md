> Historical planning document. `README.md` describes the current state of the project.

# JANI — Specification and build plan (v2)

> Working document for the team and for Claude Code.
> Hackathon Small AI for Development (World Bank × Hack-Nation), challenge 04, Agriculture sector.
> **Everything described here is built in the MVP.** Where something is left for later, it appears only in section 14.

---

## 1. What Jani is

An app that works without internet and helps a small coffee farmer make a decision: when facing a sign on a leaf, **do I treat now, wait, or consult a person?**

It has four modules, and all four are built and work offline:

| Module | What is built | With what |
|---|---|---|
| **① SEE** | Leaf classifier that runs on the phone | Vision model trained in Colab, exported to ONNX |
| **② PREDICT** | Risk engine that gives LOW, MEDIUM or HIGH and explains why | Points system with parameters from the pack |
| **③ DECIDE** | Economic engine that compares waiting and treating, in kilos of coffee | Expected loss and net benefit formulas |
| **④ VOICE** | Player that speaks each result in the local language | One audio per phrase, included in the pack |

**Engine + packs.** The app (the engine) is the same everywhere in the world. What is local lives in an installable **pack**: language, audio, diseases, calendar, climate, prices and backup contact. The MVP ships two: `noor-africa-oriental` (Swahili) and `colombia-andina` (Spanish).

**Problem statement (challenge format).**
> Thanks to this tool, a coffee farmer with 2 hectares will decide the same weekend whether to treat, wait or consult when facing a sign of disease on her leaves, something she decides late today, when the extension agent visits twice a year; we know this because [FILL IN: data point with source, year and country].

---

## 2. Acceptance criteria (challenge rules)

1. Runs on a mid- or low-range Android smartphone; on iPhone, as a PWA from Safari.
2. The photo → diagnosis → risk → decision → voice route works in **airplane mode**.
3. The model weighs less than 10 MB.
4. There is full interaction in **Swahili** (text and audio).
5. The person makes the final decision; the app suggests and records.
6. If the evidence is not enough, the app says "I am not sure, consult a person".
7. No text is generated at runtime: everything comes from a fixed list in the pack.
8. Every data point carries a source; demo values are shown with a visible label.

---

## 3. Stack

| Layer | Choice |
|---|---|
| App | PWA with React + Vite + TypeScript (strict) |
| Offline | `vite-plugin-pwa` (service worker with precache of model, `.wasm`, packs and audio) |
| Inference | `onnxruntime-web`, WASM backend, `.wasm` files served from `public/ort/` |
| Storage | IndexedDB with `idb-keyval` |
| Pack zip | `fflate` |
| Tests | Vitest |
| Android | Capacitor (debug APK) |
| Hosting | GitHub Pages, Netlify or Cloudflare Pages (HTTPS) |
| Training | Python on Colab: PyTorch, `timm`, `datasets`, `onnx`, `onnxruntime` |
| Voice | `.mp3` audio generated with `training/make_audio.py` or recorded by the team |

Native iPhone requires a Mac and a developer account; in the MVP the iPhone is covered by the PWA.

---

## 4. SEE module (vision)

### 4.1 Model
- Main architecture: **EfficientNet-Lite0** (`timm`: `efficientnet_lite0`), 224×224 input, quantized to int8.
- Plan B: **MobileNetV3-Small** without quantization.
- Classes, in this order: `sana`, `roya`, `minador`, `phoma`, `cercospora`.
- Produced by `training/jani_train.ipynb` (section 9). The app reads everything from `model_card.json`.

### 4.2 `model_card.json` contract

| Field | Use in the app |
|---|---|
| `classes` | Order of the outputs |
| `input.mean`, `input.std` | Normalization after dividing by 255 |
| `input.resize` | Stretch the photo to 224×224, no cropping |
| `temperature` | `softmax(logits / temperature)` |
| `unsure_rule.min_confidence`, `min_margin` | Doubt rule |
| `recommended_file` | ONNX file that is loaded |
| `metrics` | "About" screen and video |

### 4.3 `see` function

```ts
type ClassId = 'sana' | 'roya' | 'minador' | 'phoma' | 'cercospora';
type SeeResult =
  | { status: 'ok'; classId: ClassId; confidence: number; probs: number[] }
  | { status: 'unsure'; reason: 'bad_photo' | 'low_confidence' | 'low_margin'; probs?: number[] };

async function see(image: ImageBitmap, card: ModelCard): Promise<SeeResult>
```

Steps, in order:
1. **Photo quality.** Reduce to 224×224 in grayscale. If the mean brightness is below 40 or above 230, or the Laplacian variance is below 60, return `bad_photo`. (Constants in `engine/quality.ts`; adjusted by testing with the phone.)
2. **Preprocess.** RGB, stretch to 224×224, divide by 255, subtract `mean`, divide by `std`, NCHW order, `Float32Array`.
3. **Infer** with the ONNX session (created once and reused).
4. **Calibrate.** `probs = softmax(logits / temperature)`.
5. **Doubt rule.** If the maximum probability is below `min_confidence` → `low_confidence`. If the difference with the second is below `min_margin` → `low_margin`.
6. If it passes, return `ok`.

While the real model does not exist (`recommended_file` is `null`), `see` returns simulated results with the same shape, selectable from a hidden test menu.

### 4.4 Photo session

A review is several leaves, not one. The capture screen asks for **5 photos** (minimum 1, maximum 10).

```ts
type Session = {
  results: SeeResult[];
  dominant: ClassId | null;   // most frequent disease among non-healthy 'ok' results
  affectedShare: number;      // diseased leaves / leaves with an 'ok' result
  unsureShare: number;        // 'unsure' results / total
};
```

Rules:
- If `unsureShare > 0.5` → `CONSULT` output (phrase `unsure`).
- If all `ok` leaves are healthy → phrase `all_healthy`; no risk or economics is computed.
- Otherwise, continue to PREDICT with `dominant` and `affectedShare`.

---

## 5. PREDICT module (risk)

```ts
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type PredictInput = {
  dominant: ClassId; affectedShare: number; month: number;   // 1 to 12
  heavyRainThisWeek: boolean; treatedLast60Days: boolean;
};
type PredictResult =
  | { level: RiskLevel; points: number; factors: string[] }
  | { level: 'CONSULT'; reason: string };

function predict(input: PredictInput, pack: Pack): PredictResult
```

Points system. The values come from `pack.risk_rules.points`:

| Factor | Condition | Points (initial) |
|---|---|---|
| `affected_share_over_30pct` | `affectedShare > 0.30` | 2 |
| `rainy_month` | `month` is in `calendar.rainy_months` | 1 |
| `user_reports_heavy_rain` | answered "yes" | 1 |
| `no_treatment_last_60_days` | answered "no" | 1 |

Level: `points >= thresholds.high` → HIGH; `>= thresholds.medium` → MEDIUM; otherwise LOW. `factors` lists the factors that added up, to display them as icons.

The two questions are asked with large Yes/No buttons and their audio (`ask_rain`, `ask_treatment`).

**Mandatory test cases** (Colombia pack with demo values; rainy months: 4, 5, 10, 11):

| Case | Input | Points | Level |
|---|---|---|---|
| P1 | share 0.50, month 10, it rained, no treatment | 5 | HIGH |
| P2 | share 0.40, month 7, it did not rain, with treatment | 2 | MEDIUM |
| P3 | share 0.20, month 7, it did not rain, with treatment | 0 | LOW |
| P4 | `rainy_months` absent and no demo value | — | CONSULT |

The agricultural engineer validates the points and thresholds and signs off in `risk_rules.validated_by`.

---

## 6. DECIDE module (economics)

Everything is computed **in kilos of coffee**; currency is only used to convert the cost.

```ts
type Range = [number, number];
type DecideInput = { dominant: ClassId; risk: RiskLevel; areaHa: number };
type DecideResult = {
  suggestion: 'WAIT' | 'TREAT' | 'CONSULT';
  kpis?: {
    expectedLossKg: Range;      // if she does not act
    treatmentCostKg: number;    // treatment cost, in kilos
    breakEvenKg: number;        // kilos it must save for treating to be worthwhile
    netBenefitKg: Range;        // what she gains if she treats
    confidence: 'high' | 'medium' | 'low';
  };
  usedDemoData: boolean;
  phrase: 'act_cheaper' | 'wait_ok' | 'consult';
};

function decide(input: DecideInput, pack: Pack): DecideResult
```

Formulas:

```
production       = yield_kg_ha × areaHa
loss_no_action   = production × loss_share[dominant][risk]            → range
cost_kg          = (cost_per_ha × areaHa) ÷ price_per_kg
treated_loss     = production × loss_share[dominant][residual_risk]   → range
net_benefit      = [ loss_no_action.min − treated_loss.max − cost_kg ,
                     loss_no_action.max − treated_loss.min − cost_kg ]
break_even_point = cost_kg
```

Output rules:
- The whole net benefit range is positive → `TREAT`, phrase `act_cheaper`, high confidence.
- The whole range is negative → `WAIT`, phrase `wait_ok`, high confidence.
- The range crosses zero and the risk is LOW → `WAIT`, phrase `wait_ok`, medium confidence.
- The range crosses zero and the risk is MEDIUM or HIGH → `CONSULT`, phrase `consult`, low confidence.
- Any value is missing → `CONSULT`, no KPIs.

**Where the values come from.** A single function `resolve(pack, path)`:
1. If the real value exists and its `source` is not `TODO` → it is used.
2. Otherwise, if it exists in `pack.demo_values` → it is used and `usedDemoData = true`.
3. Otherwise → `CONSULT`.

When `usedDemoData` is true, the screen shows the label from the `demo_data` phrase. This way the app works end to end today, and real data enters without touching code.

The area (`areaHa`) is asked once when the pack is installed (phrase `ask_area`, selector from 0.5 to 10 hectares, initial value 2) and is saved.

**Mandatory test cases** (Colombia pack, demo: 1,000 kg/ha, 20,000 COP/kg, treatment 400,000 COP/ha with low residual risk; area 2 ha):

| Case | Risk | Loss if she does not act | Cost | Net benefit | Output |
|---|---|---|---|---|---|
| D1 | HIGH | [300, 700] kg | 40 kg | [160, 660] kg | TREAT |
| D2 | MEDIUM | [100, 300] kg | 40 kg | [−40, 260] kg | CONSULT |
| D3 | LOW | [0, 100] kg | 40 kg | [−140, 60] kg | WAIT |
| D4 | any, with no real or demo price | — | — | — | CONSULT |

---

## 7. VOICE module

### 7.1 Audio
Each pack carries **one file per phrase**: `audio/<key>.mp3`, with the same keys as `pack.phrases` (38 per pack).

How they are generated:
- **Spanish:** record with a human voice (recommended) or run `python training/make_audio.py packs/colombia-andina`.
- **Swahili:** `python training/make_audio.py packs/noor-africa-oriental` (Meta MMS synthetic voice).

The script reads `pack.json`, creates the `.mp3` files and notes in the pack that the audio is synthetic. Audio is generated **before** packaging; the app never synthesizes voice over the network.

### 7.2 Player

```ts
async function say(key: string): Promise<void>      // plays audio/<key>.mp3 of the active pack
async function sayAll(keys: string[]): Promise<void> // in sequence
```

- On entering each screen its phrase plays automatically. There is a large button to repeat.
- Numbers (kilos) are not spoken: they are shown large on screen with an icon. The audio gives the qualitative message.
- If a file is missing: try `speechSynthesis` with the pack's language; if no voice is available, show only the text. Never fail.
- Audio files are stored in IndexedDB as `Blob` when the pack is installed.

---

## 8. Packs

### 8.1 Structure

```
noor-africa-oriental/
  pack.json
  audio/<key>.mp3
```

`pack.json` contains: `id`, `version`, `language`, `crop`, `units`, `backup_contact`, `classes`, `calendar`, `climate_normals`, `risk_rules`, `economics`, `demo_values`, `phrases`, `audio`, `tts`. The two files in `packs/` are the reference; the validation schema is derived from them.

### 8.2 Packaging
`scripts/build-packs.mjs` (created by Claude Code): compresses each folder of `packs/` into `app/public/packs/<id>.zip` and writes `app/public/packs/catalog.json` with id, language, version and size. It runs before `vite build`.

### 8.3 Installation
- **From the catalog:** the Packs screen lists `catalog.json`. The zips are precached by the service worker, so installing works offline.
- **From a file:** "Import file" button for a `.zip` received by Bluetooth, SD card or WhatsApp.
- On install: unzip with `fflate`, validate, save JSON and audio in IndexedDB.
- Switching the active pack changes language, audio, rules and values instantly.

---

## 9. Training on Colab

A team member runs it; Claude Code does not run Colab.

1. Upload `training/jani_train.ipynb` to Colab and enable the T4 GPU.
2. Run everything with `MODEL_NAME = "efficientnet_lite0"`.
3. `jani_model_efficientnet_lite0.zip` is downloaded. Unzip into `app/public/models/arabica-v1/`.
4. If the notebook recommends plan B, repeat with `mobilenetv3_small_100`.

The notebook trains, calibrates confidence, tests out of distribution, exports to ONNX, quantizes, compares and writes `model_card.json`.

### Data

| Dataset | Country | Size | Use | License |
|---|---|---|---|---|
| JMuBEN + JMuBEN2 | Kenya | 58,549 images | Training | CC BY 4.0 |
| BRACOL | Brazil | 1,747 leaves | Training | To be confirmed |
| Uganda (Soroti) | Uganda | 3,312 images | External test | To be confirmed |
| Peru (Saposoa) | Peru | 1,500 images | External test | To be confirmed |

Links, citations and limits: `docs/DATA.md`. The accuracy that is reported is that of **Uganda and Peru**; the internal JMuBEN validation is inflated by its augmentation.

---

## 10. Screens

One action per screen, large buttons, icons, automatic audio.

| # | Screen | Content | Audio |
|---|---|---|---|
| 1 | **Home** | "Check my coffee" button; links to Pending and Packs; name of the active pack | `welcome` |
| 2 | **Capture** | Camera (`<input capture>` or `getUserMedia`), counter 1 of 5, "Done" button | `more_photos`, `retake`, `done_photos` |
| 3 | **Diagnosis** | Thumbnails with the result of each leaf; dominant result | `dx_*`, `all_healthy` or `unsure` |
| 4 | **Questions** | Two Yes/No questions | `ask_rain`, `ask_treatment` |
| 5 | **Risk** | LOW/MEDIUM/HIGH traffic light and icons of the factors | `risk_*` |
| 6 | **Decision** | KPIs in kilos, highlighted suggestion, three buttons: Wait, Treat, Consult | DECIDE phrase and then `you_decide` |
| 7 | **Confirmation** | Saved choice; if she chose Consult or the risk is HIGH, button to send SMS | `saved` |
| 8 | **Pending** | List of saved cases with date, result and choice | — |
| 9 | **Packs** | Installed, catalog, import file, farm area | — |
| 10 | **About** | Model metrics, data sources, limits | — |

**Escalation.** The SMS button opens `sms:<pack phone number>?body=<summary>` with date, result, risk and choice. No photos. If the pack has no phone number, it uses the system share menu.

**Saved case:**
```ts
type Case = { id: string; date: string; packId: string; session: Session;
  risk?: PredictResult; decision?: DecideResult; choice?: 'WAIT' | 'TREAT' | 'CONSULT'; sent: boolean };
```

---

## 11. Repository structure

```
jani/
  CLAUDE.md
  JANI_PLAN.md
  app/
    src/
      engine/quality.ts  see.ts  session.ts  predict.ts  decide.ts  resolve.ts  voice.ts
      packs/loader.ts  schema.ts
      store/cases.ts  settings.ts
      screens/Inicio.tsx  Captura.tsx  Diagnostico.tsx  Preguntas.tsx  Riesgo.tsx
              Decision.tsx  Confirmacion.tsx  Pendientes.tsx  Paquetes.tsx  AcercaDe.tsx
      tests/predict.test.ts  decide.test.ts  session.test.ts  resolve.test.ts
    public/
      models/arabica-v1/   ← model_card.json + .onnx
      ort/                 ← onnxruntime-web .wasm
      packs/               ← zips + catalog.json (generated)
  packs/
    noor-africa-oriental/  pack.json  audio/
    colombia-andina/       pack.json  audio/
  scripts/build-packs.mjs
  training/
    jani_train.ipynb
    make_audio.py
    build_climate.py       ← created by Claude Code
  docs/DATA.md
```

---

## 12. 8-hour plan

**Track A: model, audio and data** (Colab). **Track B: app** (Claude Code).

| Hour | Track A | Track B |
|---|---|---|
| 0:00–0:30 | Launch `jani_train.ipynb` | Prompts 1 and 2 |
| 0:30–2:00 | While it trains: generate the Swahili audio, record the Spanish | Prompts 3, 4 and 5 |
| 2:00–3:30 | Review metrics; plan B if needed; deliver the model zip | Prompts 6, 7 and 8 |
| 3:30–5:00 | Validate risk rules; look for real values with sources | Prompts 9 and 10 |
| 5:00–6:00 | Joint integration: real model, audio, live pack switching | Prompt 11 |
| 6:00–7:00 | Airplane-mode test on real phones; measure size and time | Prompt 12 |
| 7:00–8:00 | Video (2 to 5 minutes), `DATA.md`, submission | |

**Checkpoint at 3:30.** If there is no model, the app continues with simulated results and Track A runs plan B.

**If time runs short, cut in this order:** BRACOL from training, Capacitor APK, About screen. **Do not cut:** airplane mode, "I am not sure", the four modules, the second pack, the video.

---

## 13. Prompts for Claude Code, in order

Before each one: "Read CLAUDE.md and JANI_PLAN.md". After each one: run tests and commit.

1. **Scaffolding.** "Create in `app/` a PWA with React, Vite, strict TypeScript, `vite-plugin-pwa`, `idb-keyval`, `fflate`, `onnxruntime-web` and Vitest. Copy the onnxruntime-web `.wasm` files to `public/ort/`. Create the ten empty screens with navigation (section 10)."
2. **Packs.** "Implement `packs/schema.ts` and `packs/loader.ts` per section 8, `scripts/build-packs.mjs` and the Packs screen with installation from the catalog and from a file, and the area question."
3. **Values.** "Implement `engine/resolve.ts` per section 6 with tests: real value, demo value and absent."
4. **PREDICT.** "Implement `engine/predict.ts` per section 5. Write tests P1 to P4."
5. **DECIDE.** "Implement `engine/decide.ts` per section 6. Write tests D1 to D4 with the exact numbers from the table."
6. **Session and simulated SEE.** "Implement `engine/session.ts` (section 4.4) with tests, and `engine/see.ts` in simulated mode. Connect Capture, Diagnosis, Questions, Risk, Decision and Confirmation end to end."
7. **VOICE.** "Implement `engine/voice.ts` per section 7.2 and the automatic audio per screen with a repeat button."
8. **Cases.** "Implement `store/cases.ts`, the Pending screen and the escalation SMS (section 10)."
9. **Real SEE.** "Implement `engine/quality.ts` and inference with onnxruntime-web per section 4.3, reading everything from `model_card.json`. A single reusable session. If `recommended_file` is null, stay in simulated mode."
10. **About and demo label.** "About screen with metrics from `model_card.json` and sources. Visible label when `usedDemoData` is true."
11. **Offline.** "Configure the service worker precache: app, `.wasm`, model, `catalog.json` and pack zips. Give me the steps to verify in airplane mode and fix whatever fails."
12. **Android.** "Add Capacitor and generate a debug APK. Give me the steps to install it."

---

## 14. What is left for later

Robusta pack (RoCoLe dataset); nutritional stress class (CoLeaf has only 6 healthy leaves, not enough today); reference price at sale time; maize and beans; risk learned from the recorded cases; hotspot dashboard for the cooperative; native iOS app.

---

## 15. Delivery checklist

- [ ] PWA published and repository.
- [ ] Real model integrated, under 10 MB.
- [ ] Audio for both packs.
- [ ] Tests P1–P4 and D1–D4 green.
- [ ] Demo in airplane mode, with pack switching and an "I am not sure" case.
- [ ] 2 to 5 minute video with the problem statement, why AI, the walkthrough, the stack and the team's vision.
- [ ] `docs/DATA.md` complete: licenses confirmed and real values or marked as demo.

**To say in the video:** the model was trained with leaves from Kenya and Brazil and tested on Uganda and Peru (give the figure); risk is a rule-based index validated by an agricultural engineer; the climate is historical; the Swahili audio is synthetic and pending validation; the economic values marked as such are demo values.
