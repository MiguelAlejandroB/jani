> Historical planning document. `README.md` describes the current state of the project.

# MVP implementation plan (prompts 2 to 12)

Binding spec: `JANI_PLAN.md` and `CLAUDE.md` (repo root). This plan translates them into tasks.
Branch: `build/mvp`. One commit (or several small ones) per task. Commit messages in Spanish,
ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Global constraints (apply to ALL tasks)

- App directory: `app/`. Commands from `app/`: `npx tsc -b`, `npm run lint`, `npx vitest run`, `npm run build`.
- Strict TypeScript (`noUncheckedIndexedAccess` on). ESLint with `--max-warnings 0`.
- **No visible or spoken text is written in the code.** All on-screen text comes from `pack.phrases[key]`
  of the active pack (38 keys; see `packs/colombia-andina/pack.json`). Where there is no phrase, an icon (emoji)
  or numbers are used. Technical identifiers in a hidden test menu are allowed.
- **No agronomic or economic number lives in the code**: they are read from the pack with `resolve()` (`src/engine/resolve.ts`).
  Exceptions fixed by the spec (they are not pack data): photo quality thresholds (§4.3, in `engine/quality.ts`),
  `unsureShare > 0.5` (§4.4), `affectedShare > 0.30` (name of the factor `affected_share_over_30pct`, §5), area range
  0.5–10 ha with initial value 2 (§6).
- Classes, normalization, temperature and doubt thresholds are read from `app/public/models/arabica-v1/model_card.json`.
- **Do not edit** `packs/*/pack.json`, `training/jani_train.ipynb`, `training/make_audio.py`, `JANI_PLAN.md`, `CLAUDE.md`.
- Nothing goes out to the network in the flow. Nothing from a CDN. Photos never leave the phone; the SMS carries text only.
- `engine/predict.ts` and `engine/decide.ts` are pure functions (no IndexedDB, no DOM, no `Date.now()`).
- Tests in `app/src/tests/*.test.ts` (Vitest, node environment). Test first, then code (TDD).
- Interface: big buttons, icons, one action per screen. Existing styles in `src/styles.css`, `BigButton` and `Screen`
  components in `src/ui.tsx`. Hash navigation with `useNav()` from `src/nav.tsx`.
- Do not install anything outside `jani/` except what the task indicates. Do not push.

## Shared types (create in Task 1, in `app/src/engine/types.ts`, and reuse)

```ts
export type ClassId = 'sana' | 'roya' | 'minador' | 'phoma' | 'cercospora';
export const CLASS_IDS: readonly ClassId[] = ['sana', 'roya', 'minador', 'phoma', 'cercospora'];
export type SeeResult =
  | { status: 'ok'; classId: ClassId; confidence: number; probs: number[] }
  | { status: 'unsure'; reason: 'bad_photo' | 'low_confidence' | 'low_margin'; probs?: number[] };
export type Session = { results: SeeResult[]; dominant: ClassId | null; affectedShare: number; unsureShare: number };
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type PredictInput = { dominant: ClassId; affectedShare: number; month: number; heavyRainThisWeek: boolean; treatedLast60Days: boolean };
export type PredictResult =
  | { level: RiskLevel; points: number; factors: string[]; usedDemoData: boolean }
  | { level: 'CONSULT'; reason: string };
export type Range = [number, number];
export type DecideInput = { dominant: ClassId; risk: RiskLevel; areaHa: number };
export type DecideResult = {
  suggestion: 'WAIT' | 'TREAT' | 'CONSULT';
  kpis?: { expectedLossKg: Range; treatmentCostKg: number; breakEvenKg: number; netBenefitKg: Range; confidence: 'high' | 'medium' | 'low' };
  usedDemoData: boolean;
  phrase: 'act_cheaper' | 'wait_ok' | 'consult';
};
export type Choice = 'WAIT' | 'TREAT' | 'CONSULT';
export type Case = { id: string; date: string; packId: string; session: Session; risk?: PredictResult; decision?: DecideResult; choice?: Choice; sent: boolean };
```

(`ClassId` in `CLASS_IDS` is the order from the spec; at runtime the order of the model outputs is taken from `model_card.classes`.)

---

### Task 1: Schema, validation and loading of packs; packaging (prompt 2, part A)

Files: `app/src/engine/types.ts` (types above), `app/src/packs/schema.ts`, `app/src/packs/loader.ts`,
`app/src/store/settings.ts`, `scripts/build-packs.mjs` (repo root), `app/src/tests/packs.test.ts`, `app/package.json`.

1. `schema.ts`: `Pack` type derived from the two `packs/*/pack.json` (fields: `id`, `version`, `language{code,name,needs_native_review}`,
   `crop`, `units`, `backup_contact{role,phone}`, `classes`, `calendar`, `climate_normals`, `risk_rules{validated_by,note,points,thresholds}`,
   `economics`, `demo_values`, `phrases: Record<string,string>`, `audio{dir,format,status,files?}`, `tts`). `null` fields allowed
   where the reference packs have them as `null`. Export `REQUIRED_PHRASE_KEYS` (the 38 `phrases` keys of the reference packs,
   in their order) and `validatePack(json: unknown): { ok: true; pack: Pack } | { ok: false; errors: string[] }` written by hand
   (no libraries). Minimum rules: object; `id` non-empty string without `/`; `version` string; `language.code` string; `phrases` contains
   each key of `REQUIRED_PHRASE_KEYS` with a non-empty string; `classes` has the 5 `ClassId`; `risk_rules.points` has numbers for
   `affected_share_over_30pct`, `rainy_month`, `user_reports_heavy_rain`, `no_treatment_last_60_days`; `risk_rules.thresholds.medium/high`
   numbers; `calendar`, `economics`, `demo_values` are objects. Each error is a string that names the path (`"phrases.welcome"`).
2. `loader.ts` (uses `fflate` and `idb-keyval`):
   - `parsePackZip(bytes: Uint8Array): { pack: Pack; audio: Record<string, Blob> }`. Zip with `pack.json` at the root and
     `audio/<key>.mp3`. Throws `PackError` (exported class, with `code: 'corrupt_zip' | 'missing_pack_json' | 'invalid_json' | 'invalid_pack'`
     and `errors: string[]`) if the zip cannot be decompressed, `pack.json` is missing, the JSON is invalid or `validatePack` fails.
     Audio: only `audio/*.mp3` files whose name without extension is a key of `pack.phrases`; Blob with type `audio/mpeg`.
   - `installPackFromZip(bytes)`: parses, stores in IndexedDB: `pack:<id>` → pack JSON; `audio:<id>:<key>` → Blob;
     updates the `packs:installed` list (string[] without duplicates; reinstalling replaces and deletes old audio of that id). Returns the `Pack`.
   - `listInstalledPacks(): Promise<Pack[]>`, `getPack(id)`, `getPackAudio(packId, key): Promise<Blob | undefined>`.
   - `fetchCatalog(baseUrl = './packs/')`: reads `catalog.json`. `installPackFromCatalog(entry)`: `fetch` of the zip (relative) and installs it.
3. `store/settings.ts` (idb-keyval): `getActivePackId/setActivePackId`, `getAreaHa/setAreaHa` (undefined if never asked),
   and constants `AREA_MIN_HA = 0.5`, `AREA_MAX_HA = 10`, `AREA_STEP_HA = 0.5`, `AREA_DEFAULT_HA = 2` (§6 of the spec).
4. `scripts/build-packs.mjs` (Node, at the repo root; resolve `fflate` from `app/node_modules` with `createRequire` pointing to
   `app/package.json`): for each folder in `packs/` with `pack.json`, create `app/public/packs/<id>.zip` with `pack.json` and `audio/*.mp3`
   if they exist (missing audio folder = zip with only `pack.json`), and write `app/public/packs/catalog.json`:
   `[{ "id", "version", "language": { "code", "name" }, "file": "<id>.zip", "size": <bytes> }]` sorted by id.
   Print a summary per pack (id, size, number of audio files / 38).
   Scripts in `app/package.json`: `"packs": "node ../scripts/build-packs.mjs"`, `"predev": "npm run packs"`, `"prebuild": "npm run packs"`.
5. Tests (`packs.test.ts`), without real IndexedDB (test `validatePack` and `parsePackZip`; build zips in memory with `fflate.zipSync`):
   valid pack (the two in `packs/` read with `fs`) → ok; pack without `phrases.welcome` → error naming `phrases.welcome`;
   pack without `risk_rules.points.rainy_month` → error; random bytes → `PackError` `corrupt_zip`; zip without `pack.json` →
   `missing_pack_json`; zip with broken JSON → `invalid_json`; valid zip with `audio/welcome.mp3` and `audio/otra.mp3` → only `welcome` in audio.
   (If `Blob` does not exist in node, use the Node 20 global, which does exist.)

### Task 2: Active pack in the app and Packs screen (prompt 2, part B)

Files: `app/src/packs/PackContext.tsx` (new), delete `app/src/packs/active.ts`, `app/src/screens/Paquetes.tsx`,
`app/src/App.tsx`, all screens that currently import `t` from `packs/active`.

1. `PackProvider` + `usePack()`: `{ pack: Pack | null; t(key): string; installed: Pack[]; activate(id); refresh(); areaHa: number | undefined; setAreaHa(n) }`.
   On startup it loads installed packs and the active one from IndexedDB. `t(key)` returns `pack.phrases[key] ?? ''`.
   Switching packs updates language (`document.documentElement.lang = pack.language.code`), phrases and values instantly.
2. If there is no active pack, the app shows the Packs screen (any route redirects to `paquetes`).
3. Packs: (a) list of installed ones, with the active one highlighted; tapping one activates it; (b) catalog from `fetchCatalog()` with a button
   `t('install')` (or an icon if there is no active pack yet) and the language name from `catalog.language.name`; (c) button
   `t('import_file')` that opens `<input type="file" accept=".zip,application/zip">` and installs with `installPackFromZip`; if it fails, show an
   error icon (⚠️) and the technical `errors` of the `PackError` in small type; (d) area question: after installing the first pack,
   or if `areaHa` is undefined, show `t('ask_area')` with a large selector (− / + buttons and a large number, from 0.5 to 10, step 0.5,
   initial 2) and a ✅ button that saves. Also always accessible on the Packs screen.
   When installing from the catalog or a file, the newly installed pack becomes active.
4. Stable `data-testid` attributes for e2e: `pack-installed-<id>`, `pack-catalog-<id>`, `pack-install-<id>`, `pack-import-input`,
   `area-value`, `area-minus`, `area-plus`, `area-save`, `pack-error`.
5. No new mandatory unit tests (UI); `tsc`, lint and `vitest` must stay green and `npm run build` must pass.

### Task 3: resolve, PREDICT and DECIDE (prompts 3, 4 and 5)

Files: `app/src/engine/resolve.ts`, `app/src/engine/predict.ts`, `app/src/engine/decide.ts`,
`app/src/tests/resolve.test.ts`, `app/src/tests/predict.test.ts`, `app/src/tests/decide.test.ts`.

1. `resolve(pack: Pack, path: string): { found: true; value: unknown; usedDemo: boolean } | { found: false }` with a dotted path
   (array indices as a numeric segment: `economics.treatments.roya.0`).
   - Real value: walk `path` from the pack root. If the final node is an object with a `value` key, the value is `node.value`.
     The **governing source** is the `source` key of the final node if it is an object, or that of the nearest ancestor that has `source`
     (e.g. `economics.loss_share_by_risk.roya.high` takes it from `...roya.source`; `economics.treatments.roya.0` from `treatments.roya[0].source`;
     `calendar.rainy_months` from `calendar.source`). A source is valid if it is a non-empty string that does not start with `TODO`.
     If no node in the chain has `source` (e.g. `risk_rules.points.rainy_month`), the value is taken as real.
   - A value is **absent** if it is `null`/`undefined`, or an array that contains `null`, or an object with some required field set to `null`.
     For objects (e.g. a treatment) it is considered absent if any of its numeric properties is `null`.
   - Order: (1) real present and with valid source (or no source in the chain) → `{found, value, usedDemo:false}`;
     (2) otherwise, `pack.demo_values` at the same path (without the `value` wrapper) present → `{found, value, usedDemo:true}`; (3) `{found:false}`.
   - Never invents default values.
   Tests: real with source → usedDemo false; real with `source: "TODO"` and demo present → demo, usedDemo true; absent in both →
   found false; path with `{value, source}` unwraps; `risk_rules.points.rainy_month` → real. Build variants by cloning the Colombia pack.
2. `predict(input, pack)` per §5 of the spec. Points and thresholds: `resolve` of `risk_rules.points.<factor>` and `risk_rules.thresholds.medium|high`.
   Rainy months: `resolve(pack, 'calendar.rainy_months')`. Any value not found → `{ level: 'CONSULT', reason: 'missing:<path>' }`.
   Factors in this order: `affected_share_over_30pct` (`affectedShare > 0.30`), `rainy_month` (`month` in the list),
   `user_reports_heavy_rain` (`heavyRainThisWeek`), `no_treatment_last_60_days` (`!treatedLast60Days`).
   `points >= high` → HIGH; `>= medium` → MEDIUM; otherwise LOW. `usedDemoData` = any `resolve` used returned `usedDemo`.
   EXACT tests with the unmodified Colombia pack (demo: rainy months 4,5,10,11):
   P1 share 0.50, month 10, rained, no treatment → 5 points, HIGH. P2 share 0.40, month 7, did not rain, with treatment → 2, MEDIUM.
   P3 share 0.20, month 7, did not rain, with treatment → 0, LOW. P4 cloned pack without a real `calendar.rainy_months` (null) and without
   `demo_values.calendar.rainy_months` → CONSULT. Also verify the `factors` of P1 (all four) and `usedDemoData === true`.
3. `decide(input, pack)` per §6. Everything in kilos. Paths: `economics.typical_yield_kg_per_ha`, `economics.price_per_kg`,
   `economics.loss_share_by_risk.<dominant>.<low|medium|high>` (level in lowercase), `economics.treatments.<dominant>.0`
   (use `cost_per_ha` and `residual_risk`), and `economics.loss_share_by_risk.<dominant>.<residual_risk>`.
   Formulas: production = yield × area; loss_no_action = production × loss_share[risk] (range);
   cost_kg = cost_per_ha × area ÷ price; treated_loss = production × loss_share[residual];
   net = [no_act.min − treated.max − cost, no_act.max − treated.min − cost]; breakEvenKg = cost_kg.
   Output: net.min > 0 → TREAT, `act_cheaper`, high; net.max < 0 → WAIT, `wait_ok`, high; crosses zero (including touching 0) and LOW → WAIT,
   `wait_ok`, medium; crosses zero and MEDIUM/HIGH → CONSULT, `consult`, low. Any value missing → `{suggestion:'CONSULT', phrase:'consult', usedDemoData}` without `kpis`.
   Classify with the unrounded values; in `kpis` return values rounded to 2 decimals (`Math.round(x*100)/100`) to
   remove floating-point noise. `usedDemoData` = any `resolve` used demo.
   EXACT tests (unmodified Colombia pack, rust, area 2):
   D1 HIGH → expectedLossKg [300, 700], treatmentCostKg 40, breakEvenKg 40, netBenefitKg [160, 660], TREAT, act_cheaper, high, usedDemoData true.
   D2 MEDIUM → [100, 300], 40, [−40, 260], CONSULT, consult, low.
   D3 LOW → [0, 100], 40, [−140, 60], WAIT, wait_ok, medium.
   D4 cloned pack with `economics.price_per_kg.value = null` and without `demo_values.economics.price_per_kg` → CONSULT, no kpis.
   Add a test with the Swahili pack (rust, HIGH, 2 ha) that only verifies it returns kpis and `usedDemoData` true.

### Task 4: Session, photo quality and simulated SEE (prompt 6 part A; quality from prompt 9)

Files: `app/src/engine/session.ts`, `app/src/engine/quality.ts`, `app/src/engine/see.ts`, `app/src/engine/modelCard.ts`,
`app/src/tests/session.test.ts`, `app/src/tests/quality.test.ts`, `app/src/tests/see.test.ts`.

1. `session.ts`: `buildSession(results: SeeResult[]): Session` — `dominant` = most frequent non-healthy class among `ok` results
   (tie: the first in the order of `CLASS_IDS`; `null` if none); `affectedShare` = non-healthy ok leaves ÷ ok leaves (0 if no ok);
   `unsureShare` = unsure ÷ total (0 if total is 0). `sessionOutcome(s): 'consult' | 'healthy' | 'continue'`:
   `unsureShare > 0.5` → consult; if there is at least one ok and all ok are healthy → healthy; if there is no ok at all → consult; otherwise → continue.
   Tests: mix with dominant; tie; 3 of 5 unsure → consult; 2 of 4 unsure and 2 healthy → healthy (0.5 is not > 0.5); all healthy → healthy; exact affectedShare.
2. `quality.ts`: constants `MIN_BRIGHTNESS = 40`, `MAX_BRIGHTNESS = 230`, `MIN_LAPLACIAN_VAR = 60`, `QUALITY_SIZE = 224`.
   Pure: `toGray(rgba: Uint8ClampedArray): Float32Array` (luma 0.299R+0.587G+0.114B), `meanBrightness(gray)`,
   `laplacianVariance(gray, w, h)` (4-neighbor kernel [0,1,0;1,-4,1;0,1,0], interior pixels only, population variance),
   `assessQuality(rgba, w, h): 'ok' | 'bad_photo'`. Browser: `imageToRgba(image: ImageBitmap, size = 224): Uint8ClampedArray`
   (OffscreenCanvas if it exists, otherwise `<canvas>`; stretches without cropping). Tests with synthetic images: black → bad_photo;
   white → bad_photo; flat gray 128 → bad_photo (variance 0); 8 px 0/255 checkerboard cropped to mid gray → ok
   (pick a pattern whose mean is between 40 and 230 and whose variance is high; document the computed expected value).
3. `modelCard.ts`: `ModelCard` type (fields from §4.2: `classes`, `input{mean,std,shape,name}`, `output{name}`, `temperature`,
   `unsure_rule{min_confidence,min_margin}`, `files`, `recommended_file: string|null`, `metrics`, `size_mb`) and
   `loadModelCard(baseUrl = './models/arabica-v1/')` (fetch). Pure: `softmax(logits: ArrayLike<number>, temperature): number[]`
   (numerically stable) and `applyUnsureRule(probs, card, classes): SeeResult` (max < min_confidence → low_confidence;
   max − second < min_margin → low_margin; otherwise ok with `classId = classes[argmax]`, `confidence = max`).
4. `see.ts`: `see(image: ImageBitmap, card: ModelCard, opts?): Promise<SeeResult>`. Step 1 quality (`imageToRgba` + `assessQuality`)
   → `bad_photo` if it fails. If `card.recommended_file` is `null` → **simulated mode**: take the next result from the simulated queue
   and build probabilities: for class X, X = 0.9 and the rest share 0.1 equally; `low_confidence` → maximum 0.5;
   `low_margin` → 0.45 / 0.40 / rest; `bad_photo` → unsure bad_photo. Pass the class and confidence ones through `applyUnsureRule`
   (they must come out `ok` with the example card's thresholds: 0.9 ≥ 0.7, margin 0.875 ≥ 0.15). Real mode: throw `Error('not_implemented')`
   (Task 8 implements it). Simulated queue: `SimOutcome = ClassId | 'low_confidence' | 'low_margin' | 'bad_photo'`;
   `getSimPlan(): SimOutcome[]` reads `localStorage['jani.sim']` (JSON array; with try/catch) and defaults to `['roya']`;
   the queue is walked cyclically by index (`nextSimOutcome()` and `resetSim()` when starting a review).
   Separate the probability construction into a pure function `simulatedProbs(outcome, classes)` tested in Vitest.

### Task 5: End-to-end flow across screens (prompt 6 part B; demo label from prompt 10)

Files: `app/src/flow/FlowContext.tsx` (new), `app/src/screens/{Captura,Diagnostico,Preguntas,Riesgo,Decision,Confirmacion,Inicio}.tsx`,
`app/src/ui.tsx` (`DemoBadge` component), `app/src/styles.css`.

1. `FlowProvider`/`useFlow()`: state of the review in progress: photos (object URLs for thumbnails + `SeeResult`), `session`,
   answers (`heavyRain`, `treated`), `risk`, `decision`, `choice`, `caseId`. `startReview()` clears and calls `resetSim()`.
   `ModelCard` is loaded once (`loadModelCard`).
2. Home: 📷 button → `startReview()` and `captura`.
3. Capture: `<input type="file" accept="image/*" capture="environment">` (`data-testid="photo-input"`) triggered by a large 📷 button.
   Each photo → `createImageBitmap` → `see()`. If `bad_photo`: it is not counted, show `t('retake')`. Otherwise, it is added.
   Numeric counter `n / 5` (no words) in `data-testid="photo-count"`. Maximum 10 (then the photo button is disabled).
   Button `t('done_photos')` (`data-testid="photos-done"`) enabled with ≥ 1 counted photo; on tap: `buildSession` and `diagnostico`.
   Hidden test menu: tapping the screen icon 5 times opens a panel (`data-testid="sim-menu"`) with one button per
   `SimOutcome` (text = technical identifier) that appends to `localStorage['jani.sim']`, and a 🗑 one that clears it. Only in simulated mode.
4. Diagnosis: thumbnails with an icon per result (✅ healthy, 🍂 diseased, ❓ unsure). According to `sessionOutcome`:
   consult → `t('unsure')`, ➜ button to `decision` with decision `{suggestion:'CONSULT', phrase:'consult', usedDemoData:false}` without kpis
   and without risk; healthy → `t('all_healthy')`, no risk or economics, ✅ button that saves the case (Task 7 persists it; for now it leaves
   the call in the context) and goes to `confirmacion`; continue → `t('dx_<dominant>')` and ➜ button to `preguntas`.
   `data-testid="dx-outcome"` with `data-outcome` attribute.
5. Questions: two questions in sequence (one at a time): `t('ask_rain')` and then `t('ask_treatment')`, large buttons
   `t('yes')` / `t('no')` (`data-testid="answer-yes"`, `answer-no"`). On answering the second: `predict` with `month = new Date().getMonth()+1`
   and the active pack, and goes to `riesgo`.
6. Risk: traffic light (large green/yellow/red circle) with `t('risk_low|medium|high')`, icons per factor
   (`affected_share_over_30pct` 🍂, `rainy_month` 📅, `user_reports_heavy_rain` 🌧️, `no_treatment_last_60_days` 🚫💧),
   `DemoBadge` if `usedDemoData`. `data-testid="risk-level"` with `data-level`. If CONSULT → `t('consult')` and ➜ to CONSULT decision without kpis.
   ➜ computes `decide({dominant, risk, areaHa})` and goes to `decision`.
7. Decision: large KPIs in kilos with an icon and the label `t('kpi_loss')`, `t('kpi_cost')`, `t('kpi_breakeven')`, `t('kpi_net')`
   (ranges like `a – b kg`; use `pack.units.weight` for the unit), phrase `t(decision.phrase)`, `t('you_decide')`,
   three buttons `t('opt_wait')`, `t('opt_treat')`, `t('opt_consult')` with the suggested one highlighted (`data-suggested="true"`).
   `DemoBadge` (`data-testid="demo-badge"`, text `t('demo_data')`) when `decision.usedDemoData`. Choosing saves `choice` and goes to `confirmacion`.
   `data-testid`: `decision-suggestion` (with `data-suggestion`), `choice-WAIT|TREAT|CONSULT`, `kpi-loss|cost|breakeven|net`.
8. Confirmation: `t('saved')`, ✅ icon, ⌂ button. (SMS in Task 7.)

### Task 6: VOICE (prompt 7)

Files: `app/src/engine/voice.ts`, `app/src/ui.tsx` (repeat button), screens, `app/src/tests/voice.test.ts`.

1. `say(key)` plays the `Blob` from `getPackAudio(activePack, key)` with `HTMLAudioElement` (object URL, revoked on finish) and waits for
   `ended`. If there is no Blob or `play()` fails: try `speechSynthesis` with `lang = pack.language.code` and the text `pack.phrases[key]`,
   only if there is a voice whose `lang` starts with that code; wait for `onend`. If none of that is possible, resolve without error.
   **Never throws.** `sayAll(keys)` in sequence. `stopVoice()` cancels whatever is playing. Inject dependencies (audio source, Audio factory,
   speechSynthesis) so it can be tested in node: tests for "audio missing and no voice → resolves", "play rejects → uses speech",
   "sayAll respects the order".
2. Hook `useScreenAudio(keys: string[])`: on entering the screen it plays `sayAll(keys)` (once per change of keys),
   stops on leaving. Large 🔊 `RepeatButton` (`data-testid="repeat-audio"`) on every screen with audio.
   Phrases per screen (§10): Home `welcome`; Capture `more_photos` on entry, `retake` after a bad photo, `done_photos` on reaching 5;
   Diagnosis `dx_<dominant>` / `all_healthy` / `unsure`; Questions `ask_rain` and then `ask_treatment`; Risk `risk_*` (or `consult`);
   Decision the DECIDE phrase and then `you_decide`; Confirmation `saved`.
3. Numbers (kilos) are not spoken.

### Task 7: Cases, Pending and SMS (prompt 8)

Files: `app/src/store/cases.ts`, `app/src/screens/{Pendientes,Confirmacion,Diagnostico,Decision}.tsx`, `app/src/engine/sms.ts`,
`app/src/tests/sms.test.ts`.

1. `cases.ts` (idb-keyval, key `cases` → `Case[]` or one key per case): `saveCase(c)`, `listCases()` (most recent first),
   `markSent(id)`. `id` with `crypto.randomUUID()`; `date` ISO.
2. A case is saved on choosing in Decision (with `session`, `risk` if any, `decision`, `choice`) and on confirming healthy leaves (without choice).
3. Pending: list (`data-testid="case-item"`) with local date (`toLocaleDateString(pack.language.code)`), result icon,
   `t('dx_<dominant>')` or `t('all_healthy')`/`t('unsure')`, risk level with color, and the choice `t('opt_*')`. Title `t('pending')`.
4. Pure `sms.ts`: `buildCaseSummary(c: Case, pack: Pack): string` composed ONLY of pack phrases, ISO date (YYYY-MM-DD) and
   case values (lines: date; `phrases['dx_<dominant>']` or `all_healthy`/`unsure`; `phrases['risk_<level>']` if any;
   `phrases['opt_<choice>']` if any). No photos or image URLs. `smsHref(phone, body)` → `sms:<phone>?body=<encodeURIComponent(body)>`.
   Tests: the summary contains the expected phrases and does not contain `blob:` or `data:`; `smsHref` encodes.
5. Confirmation: if `choice === 'CONSULT'` or risk HIGH, button `t('send_case')` (`data-testid="send-case"`): if `pack.backup_contact.phone`
   → `location.href = smsHref(...)`; if not → `navigator.share({ text })` if it exists; marks `sent`.

### Task 8: Real SEE with onnxruntime-web (prompt 9)

Files: `app/src/engine/see.ts`, `app/src/engine/infer.ts` (new), `app/src/tests/infer.test.ts`, `app/tests/fixtures/` (new),
`app/tests/fixtures/make_tiny_model.py`.

1. `infer.ts`: `preprocess(rgba: Uint8ClampedArray, card): Float32Array` (RGB, ÷255, −mean, ÷std, NCHW, size `card.input.shape`);
   `getSession(url)` creates **a single** `ort.InferenceSession` per URL and reuses it (module cache); before that configure
   `ort.env.wasm.wasmPaths` to the `ort/` folder served by the app (relative to `document.baseURI`; in node, the
   `onnxruntime-web/dist` folder) and `ort.env.wasm.numThreads = 1`. `runModel(rgba, card, modelUrl): Promise<number[]>` returns logits
   using `card.input.name` and `card.output.name`. Import `onnxruntime-web/wasm` (WASM backend only).
2. `see.ts` real mode (when `recommended_file` is not null): quality → `imageToRgba` → `runModel` with
   `models/arabica-v1/<recommended_file>` → `softmax(logits, card.temperature)` → `applyUnsureRule`.
3. TEST-ONLY fixture: create `.venv` at the repo root (`python -m venv .venv`, `pip install onnx numpy`), and
   `make_tiny_model.py` that writes `app/tests/fixtures/tiny_model.onnx`: input `input` [1,3,224,224] float, output `logits` [1,5];
   graph `GlobalAveragePool → Flatten → Gemm` with known fixed weights (W 5×3, b 5) so the expected result can be computed by hand.
   And `app/tests/fixtures/model_card.test.json` (copy of the structure of the example card with `recommended_file: "tiny_model.onnx"`,
   `temperature` different from 1, e.g. 2). **Never copy to `public/models`.** Commit the generated `.onnx` (it is small).
4. Test (`infer.test.ts`): with a uniform synthetic RGBA image of a known color, verify `preprocess` (values of the first
   pixel of each channel), that `runModel` in node with onnxruntime-web returns the expected logits (tolerance 1e-4), that `getSession`
   returns the same instance twice, and that softmax with temperature + the doubt rule give the expected result.
   If onnxruntime-web does not run in node, cover real inference in the e2e test of Task 11 (serve the fixture with `page.route`)
   and document it in the report.

### Task 9: About (prompt 10)

Files: `app/src/screens/AcercaDe.tsx`.
ℹ️ icon. Shows, without new text in the code: from `model_card.json` the `id`, `recommended_file` (or 🧪 if null = simulated mode),
`size_mb` and all `metrics` entries (key: value); from the active pack: `risk_rules.validated_by`, `risk_rules.note`,
`calendar.source`, `climate_normals.source`, each `source` of `economics` (with its path as key), `audio.status`,
`language.needs_native_review` (⚠️ icon if true), and `demo_values.note` with `DemoBadge` if `demo_values.synthetic`.
`data-testid="about-model"` and `about-sources`.

### Task 10: Offline, check:assets and verify (prompt 11 and input preparation)

Files: `app/vite.config.ts`, `app/scripts/check-assets.mjs`, `app/package.json`.

1. Service worker (vite-plugin-pwa, `generateSW`): precaches `index.html`, JS/CSS, `ort/*.wasm` and `ort/*.mjs`, `models/**`
   (model_card and `.onnx`), `packs/catalog.json`, `packs/*.zip`, icons and manifest. `navigateFallback: 'index.html'`.
   `maximumFileSizeToCacheInBytes` large enough for the `.wasm` (≥ 30 MB). Verify by reading `dist/sw.js` after `npm run build`
   that these appear: `ort-wasm-simd-threaded.wasm`, `ort-wasm-simd-threaded.mjs`, `models/arabica-v1/model_card.json`,
   `packs/catalog.json`, `packs/colombia-andina.zip`, `packs/noor-africa-oriental.zip`.
   The onnxruntime-web JS that Vite bundles must also be precached (include `mjs` in globPatterns).
2. `scripts/check-assets.mjs` (`npm run check:assets`): (a) `public/models/arabica-v1/model_card.json` exists and has `classes` (5),
   `input.mean`/`input.std` (3 numbers), `temperature`, `unsure_rule.min_confidence`, `unsure_rule.min_margin`, `recommended_file`
   not null, and the file it names exists and weighs < 10 MB; (b) for each `packs/<id>/pack.json`, `audio/<key>.mp3` exists for each
   key of `phrases`. Prints a clear list of what is missing (per pack and per key), an OK/FALTA (missing) summary, and exits with code 1 if anything is missing.
3. Scripts: `"typecheck": "tsc -b"`, `"test": "vitest run"`, `"e2e": "playwright test"`,
   `"verify": "npm run typecheck && npm run lint && npm run test && npm run build && npm run e2e"`.
   (`e2e` is completed in Task 11; the script may stay here even though Playwright is not yet there.)

### Task 11: End-to-end tests with Playwright (QA)

Files: `app/playwright.config.ts`, `app/e2e/*.spec.ts`, `app/e2e/fixtures/`, `app/package.json`.

1. Install `@playwright/test` and Chromium **inside the folder** (`PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium`;
   the `e2e` script must export `PLAYWRIGHT_BROWSERS_PATH=0`, in a portable way: use `cross-env` or set it in `playwright.config.ts`
   before launching). `webServer`: `npm run build && npx vite preview --port 4173 --strictPort` (the SW only exists in production).
   Phone viewport (390×844). A single worker.
2. Test photos: PNG images with texture (that pass `assessQuality`), generated in `e2e/fixtures/` (script or in the test via canvas).
   The simulated queue is set with `localStorage['jani.sim']` (addInitScript) and/or the hidden menu.
3. Cases (one `test` per letter, names starting with the letter):
   a. Full flow: install `colombia-andina` from the catalog → area (2) → 5 photos (sim `roya`) → diagnosis → questions
      (yes, no) → risk → decision (verify visible KPIs) → choose → confirmation → appears in Pending.
   b. Same with `noor-africa-oriental`; then, with both installed, switch the active one in Packs and check that `html[lang]` and the
      Home text change (the `welcome` phrase of each `pack.json`, read from the file in the test) and that the KPIs change.
   c. "I am not sure": sim with more than half `low_confidence` → diagnosis shows the `unsure` phrase and the suggestion is CONSULT.
   d. All healthy: sim `sana` → `all_healthy` phrase; no `kpi-*` or `risk-level` appear.
   e. `demo-badge` visible in Decision with the pack's `demo_data` text.
   f. Import `.zip` from file (`setInputFiles` with `public/packs/colombia-andina.zip`) → it is installed and active.
      Also: importing a corrupt file shows `pack-error` and the app does not crash.
   g. Audio absent (no mp3): the flow throws no errors (`page.on('pageerror')` empty) and the phrases are visible on screen.
   h. OFFLINE: load the app, wait for the SW to be active and control the page (`navigator.serviceWorker.ready` + reload),
      `context.setOffline(true)`, reload and repeat the full flow (including installing a pack from the catalog). Record
      all requests (`page.on('requestfailed')`) and verify that none failed and that none went to an origin other than localhost.
4. `npm run e2e` must pass completely. Save the report in `app/playwright-report` (ignored by git).

### Task 12: Android with Capacitor (prompt 12)

The Android SDK and Java are **not** installed on this machine: do not install them.
1. `npm i @capacitor/core` and `npm i -D @capacitor/cli @capacitor/android`; `capacitor.config.ts` with `appId: 'org.jani.app'`,
   `appName: 'Jani'`, `webDir: 'dist'`. Run `npx cap add android` and `npx cap sync android` (if `cap add` fails without the SDK,
   note the exact error).
2. Scripts: `"android:sync": "npm run build && npx cap sync android"`, `"android:apk": "cd android && gradlew assembleDebug"` (Windows) —
   document in the report the steps to generate and install the APK (Android Studio / `adb install`).
3. Verify that `npm run verify` is still green and that `android/` does not break lint or tsc.
