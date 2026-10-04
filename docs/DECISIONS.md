# Decisions made without consultation

Each one: what was decided, why, and what it costs if it is wrong.

1. **Commits on the `build/mvp` branch.** The brief asks for one commit per task; the global rule of "no commit without review" is respected
   by working on a separate branch and not pushing. If wrong: just do not merge the branch.
2. **TypeScript 6.0 instead of 7.0.** typescript-eslint does not support TS 7 yet (it requires `<6.1`). If wrong: raise the version when
   typescript-eslint supports it; the code uses nothing exclusive to TS 7.
3. **Only the basic WASM backend of onnxruntime-web** (`ort-wasm-simd-threaded.wasm` + `.mjs`, 14 MB). The jsep/jspi/asyncify variants
   (WebGPU) add ~70 MB and are not used. If wrong: copy the variant in `scripts/copy-ort.mjs`.
4. **Screens with no phrase in the pack use icons only** ("Check my coffee", "About", photo counter `n / 5`). Criterion 3
   forbids text in the code and the packs cannot be edited. If wrong: add keys to the `pack.json` files and use them.
5. **Constants fixed by the spec, not by the pack:** photo quality thresholds (§4.3), `unsureShare > 0.5` (§4.4),
   `affectedShare > 0.30` (it is in the factor name `affected_share_over_30pct`, §5) and the area range 0.5–10 ha (§6).
   If wrong: move them into the pack with their path in `resolve`.
6. **`resolve` and the governing source:** a real value is used if it is not null and the nearest `source` (on the node or an ancestor) does not
   start with `TODO`. If there is no `source` in the chain (e.g. `risk_rules.points`), the pack value is taken as real: the
   validation of those rules is expressed in `risk_rules.validated_by`, which is shown in About. A treatment with any null numeric
   field is considered absent and the full demo one is used (including its `residual_risk`), which is what the
   D1–D3 tables produce. If wrong: D1–D3 would change when using the real `residual_risk` (`medium`).
7. **`PredictResult` also carries `usedDemoData`** to show the label on the risk screen when the rainy months are
   demo values. An additional field, compatible with the spec.
8. **A bad photo (`bad_photo`) does not count:** it is asked to be retaken (`retake`) and does not enter the session. Doubts due to confidence or margin do
   count toward `unsureShare`. If wrong: also count `bad_photo` in `Session.results`.
9. **"I am not sure" and CONSULT risk lead to the decision screen with a CONSULT suggestion and no KPIs**, so the person still
   chooses and it gets recorded (criterion 8).
10. **KPIs rounded to 2 decimals** to remove floating-point noise; classification uses the unrounded values.
11. **`training/build_climate.py` is not created**: it appears in the structure (§11) but no prompt asks for it and it needs network (NASA POWER).
    No MVP module uses `climate_normals`.
12. **Simulation: `low_confidence` and `low_margin` are returned directly as doubtful.** With the probabilities
    planned in the plan (0.45/0.40), `low_margin` always fell into `low_confidence` with the example card. If wrong:
    simulated mode does not exercise the margin rule with the real card; real mode always applies it.
13. **Airplane mode with the real ONNX model is not tested in e2e.** `page.route` does not intercept what the service worker serves
    and the test model cannot go in `public/models`. Real inference is tested in a browser with a connection (e2e `i`) and
    airplane mode with simulated SEE (e2e `h`). If wrong: the manual phone test remains (`HUMAN_TODO.md` §4).
14. **Capacitor 7** (not 8): CLI 8 requires Node 22 and this machine has Node 20.19. Core, CLI and Android aligned on 7.x.
15. **About shows technical paths as labels** (`risk_rules.validated_by`, `audio.status`…). They are keys of the
    data, not phrases; it is a technical screen for the jury. If wrong: add phrase keys to the pack.
16. **Errors when importing a pack:** only ⚠️ is shown; the technical detail goes in `data-errors` and the console,
    so that no text generated at runtime is displayed (criterion 3).
17. **Inference failure ≠ bad photo:** if the model fails, the photo counts as doubtful (it leads to "I am not sure" if they are
    the majority) instead of asking for a retake in a loop. If the image cannot be read, a retake is requested.
18. **The model card is validated on load and tolerates `NaN`** (the notebook may write it in metrics). Invalid
    card → ⚠️ with a retry button, never invented default values.
19. **Updating an installed pack:** the catalog shows 🔄 when its `version` differs from the installed one.
20. **SMS without a phone number:** if the pack has no phone number and there is no share menu (Android WebView),
    `sms:?body=…` is opened so the person chooses the contact. The case is marked as sent only if sending started correctly.
21. **Quality review promoted:** `resolve` was required to be tested with a non-null real value and a `TODO` source (criterion 5),
    even though the reviewer flagged it as minor.
22. **`english-demo` pack (English), requested by the team.** A copy of the rules and demo values of the
    East Africa pack (USD, synthetic and labeled as such), with the 38 phrases translated and the MMS voice
    `facebook/mms-tts-eng` for `make_audio.py`. It does not represent a real region. If wrong: adjust `units`,
    `backup_contact` and the real values of the country it targets.
23. **Notebook: per-channel int8 quantization, evaluated without graph optimizations.** Measured locally: onnxruntime-web
    matches Python onnxruntime *without* optimization (difference < 0.5 in logits) and differs by up to 5.6 *with* optimizations.
    That is why the notebook measures the ONNX accuracy the same way it will run on the phone.
24. **Capture thresholds recalibrated with real photos** (user report: "all of them ask for a retake"). Measured with 140
    field photos (Uganda and Peru) and 150 non-leaf photos (Food-101): minimum sharpness 60 → 20 (accepts 86% instead of 64%
    and rejects 97% of the blurry ones); minimum leaf fraction of the segmenter 0.25 → 0.10 (accepts 89% instead of 48%
    and still rejects 97% of non-leaves by color). Regression: `app/src/tests/campo.test.ts`.
25. **RISK and DECISION models per the manual**, in informational mode because of stop rule §7 and the *prior*
    parameters. Details, added assumptions (A5': climate as an anomaly; 1,000 particles; unit in kilos) and findings
    (assumption A4 is violated in the field data) in `docs/RISK_DECISION_MODELS.md`.
26. **Demo action catalog** (pruning, systemic, copper, biological, miner) with Beta efficacies from expert
    judgment, ordered as the USDA dataset suggests. The real catalog stays in `economics.catalog` with source `TODO`
    so that technical extension can sign it off, without touching code.
27. **Climate by location (GPS) with points per region**, requested by the team: 32 points in Colombia and 27 in East
    Africa (NASA POWER), using the nearest one within 150 km and, otherwise, the pack's point. The location does not leave the
    phone and is not saved in the cases. If wrong: the coordinates are approximate (municipal seats); with the
    ~0.5° NASA POWER grid the effect is small.
28. **Photo downscaling with smoothing** (`imageToRgba`, in halving steps with `imageSmoothingQuality = 'high'`).
    Cause of many real photos asking for a retake: a single `drawImage` of a phone photo (≈ 4000 px) down to 224 px
    hardly filters, and aliasing multiplies the texture (Laplacian variance) about 5 times. In Chromium, with 16 BRACOL leaves
    at 2048 and 4032 px, the measured texture was 490 to 1,590 versus 100–430 in Python (PIL BILINEAR, the same
    method as training and calibration). With field backgrounds it exceeded `max_texture_var` (2,500) and the leaf was
    discarded. Now the app measures 88–264, in line with calibration, and the classifier and segmenter receive the
    same smoothed image they saw during training.
