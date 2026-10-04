# Jani — One-Pager

**Team:** Miguel Alejandro Bermúdez · Juan Camilo Bermúdez (Berin Partners) · **Challenge:** World Bank — Small AI for
Development, Track B: Agriculture (#hack7, Hack-Nation) · **Links:** [landing](https://bloom-coffee-visions.lovable.app/) ·
[repo](https://github.com/MiguelAlejandroB/jani) · [APK](https://github.com/MiguelAlejandroB/jani/releases/latest/download/Jani.apk)

### Challenge tackled
A smallholder coffee farmer (*Noor*) sees a spot on a leaf, with **no agronomist nearby and no signal**. Should she
treat, wait or ask someone? We built **Jani**, an Android app that answers **fully offline** on a regular phone:
photos → disease and damage → projected loss in **kg** by harvest → options with their real costs. The farmer decides.

### Tools / ML models used
| Component | Role |
|---|---|
| **M2 LR-ASPP MobileNetV3-Large** (ONNX INT8, 3.7 MB) | Leaf gate + pixel-level severity (leaf vs lesion) |
| **M1 MobileNetV3-Small** (ONNX INT8, 1.9 MB) | 5-class leaf condition, temperature-calibrated, abstains when unsure |
| **M3 Bayesian risk model** (TypeScript + Python reference) | Monotonic 4-state Markov chain, detector-error matrix Λ, 1,000 particles, NASA POWER local climate → loss in kg, P10–P90, CVaR |
| **M4 Decision model** | Risk-averse certainty equivalent in kg; labour, interest and certification costs; value of re-measuring |
| PyTorch, timm, torchvision (Colab T4) | Training; `onnxruntime.quantization` static QDQ per-channel INT8 |
| onnxruntime-web (WASM), React + Vite PWA, Workbox, Capacitor | On-device inference, offline app, Android APK |
| Android text-to-speech (Capacitor plugin) | Offline voice on every screen (Spanish, English, Kiswahili) |

### What worked well
- **End-to-end in airplane mode** on a real Android phone: photo → diagnosis → risk → decision → voice → SMS.
- **Tiny models, same numbers as training:** INT8 cut M1 6.1 → 1.9 MB and M2 12.9 → 3.7 MB; segmenter test mIoU
  **0.885**, severity error **0.62 points**, r = **0.97**. Browser and Python outputs agree within 0.5 logits.
- **Python ↔ TypeScript golden vectors** make the risk/decision engine reproducible; 169 unit tests + Playwright e2e.
- **No hard-coded agronomy:** regional packs change language, prices and climate (65 coffee sites) without code.

### What was challenging (and how we addressed it)
- **Lab-to-field gap:** 100 % in-distribution, but Peru 58 % / Uganda 25 % → field-calibrated temperature +
  "I'm not sure" + consult path; honest metrics in the repo.
- **Phones rejected real leaves:** a single-step canvas resize aliased 12 MP photos (5× texture) → stepwise
  anti-aliased downscale matching PIL.
- **Disease dynamics not identifiable** from the public rust panel (leaf renewal breaks the monotonic chain) → expert
  priors, flagged on screen, informative mode (no single forced recommendation).
- **Silent APK:** Android WebView has no speech synthesis → native offline text-to-speech.

### How we spent our time (≈ 15 h of build)
- **0–3 h:** spec, regional packs, rule engine, full app route, voice, SMS, ONNX in WASM, offline precache, e2e, APK shell.
- **3–8 h:** Colab notebooks for M1 and M2 (cleaning, calibration, INT8 export); integrated real models.
- **8–9 h:** risk & decision models calibrated locally (Λ, climate, efficacy), GPS climate.
- **9–12 h:** field-photo fixes, risk/decision screens, product design, Android APK with GPS and voice.
- **12–15 h:** release, landing, English docs, videos and submission.

### If we had 24 more hours
Re-train M1 with more field photos per country, replace demo prices and priors with partner-sourced values, record
native Kiswahili audio, and ship a signed Play Store build.
