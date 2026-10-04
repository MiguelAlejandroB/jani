# MVP QA report

Branch `build/mvp`, code at commit `c7abc11`. Date: 2026-10-03. Machine: Windows 10, Node 20.19, Playwright Chromium.
Statuses: **VERIFIED** (a command or test proves it and its output was read), **NOT VERIFIED** (with the reason)
and **KNOWN FAILURE**.

## 1. Commands run (actual result)

| Command (from `app/`) | Result |
|---|---|
| `npm run verify` | **Exit code 0.** Runs the following in order. |
| ↳ `npm run typecheck` (`tsc -b`, strict) | 0 errors |
| ↳ `npm run lint` (`eslint . --max-warnings 0`) | 0 errors, 0 warnings |
| ↳ `npm run test` (Vitest) | **12 files, 113/113 tests OK** |
| ↳ `npm run build` | OK. JS bundle 334.99 kB (107.81 kB gzip), CSS 3.17 kB; `dist/` total ≈ 14 MB (the onnxruntime `.wasm` weighs 13.6 MB) |
| ↳ service worker precache | 14 entries, 14,272 KiB |
| ↳ `npm run e2e` (Playwright, Chromium, production build) | **19/19 tests OK** in 1.4 min |
| `npm run check:assets` | Code 1, as expected: **77 missing** (the real model's `.onnx` and 38 mp3 × 2 packs). The remaining model card fields are OK. |

## 2. Acceptance criteria from `CLAUDE.md`

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Photo → diagnosis → risk → decision → voice works in **airplane mode** after the first load | **VERIFIED with simulated SEE.** **NOT VERIFIED with the real ONNX model.** | e2e `h. OFFLINE`: loads the app, waits for the SW to control the page and finish the precache, `context.setOffline(true)`, reloads and does the full flow, including installing a pack from the catalog. Result: 0 failed requests, 0 outside the origin and all served by the SW (`fromServiceWorker`). The real model offline cannot be tested in e2e (DECISIONS #13): the precache of the `.wasm` and `model_card.json` is checked. The manual test on the phone is still missing (`HUMAN_TODO.md` §4). |
| 2 | SEE, PREDICT, DECIDE and VOICE implemented and connected, none as a mockup | **VERIFIED** | Real SEE: `engine/see.ts` + `engine/infer.ts`; simulated mode only runs if `recommended_file` is `null`. e2e `i` does real inference in the browser with `tiny_model.onnx` and checks the exact class. PREDICT is called from Questions and DECIDE from Risk. VOICE is used on every screen (`useScreenAudio`, 🔊 button). |
| 3 | No visible or spoken text is generated at runtime | **VERIFIED**, with one accepted exception | All text comes from `t()`/`pack.phrases`; the SMS is built with pack phrases (`sms.test.ts`). The import error panel no longer shows technical text (e2e `f` checks that only ⚠️ is visible). Accepted exception: About uses data keys as labels (DECISIONS #15), and the hidden test menu shows identifiers. |
| 4 | No agronomic or economic number lives in the code | **VERIFIED** | The QA audit grepped for numeric literals in `engine/`, `screens/`, `store/` and `flow/`. All economic and risk values go through `resolve`. The only constants are those fixed by the spec (DECISIONS #5). |
| 5 | `resolve`: real with source → demo + `usedDemoData` → `CONSULT`; never invents | **VERIFIED** | `resolve.test.ts`: real with valid source; non-null real with `TODO` source (uses demo); empty or null source; nearest ancestor governs; absent → `found:false`. P4 and D4 → CONSULT. |
| 6 | With `usedDemoData` the demo label is shown | **VERIFIED** | e2e `e`: the label with the pack's `demo_data` text is shown in Risk and in Decision. |
| 7 | Classes, normalization, temperature and thresholds come from `model_card.json` | **VERIFIED** | `infer.test.ts` (per-channel normalization, temperature, doubt rule); the card is validated on load (no invented default values). e2e `j1`: an invalid card shows ⚠️ and allows retrying. |
| 8 | The app suggests; the person chooses; the choice is recorded | **VERIFIED** | e2e `a`/`b`: the case appears in Pending with the choice. e2e `e`: choosing an option that was **not suggested** is saved as is. e2e `k2`/`k3`: if saving fails, the choice is not lost and can be retried. |
| 9 | The onnxruntime-web `.wasm` files in `public/ort/`, no CDN | **VERIFIED** | `scripts/copy-ort.mjs` (postinstall). e2e `i` checks that `ort/*.wasm` and `ort/*.mjs` load from the same origin and that there are no requests to other origins. There are no external `http(s)://` URLs in `src/`, `index.html` or `vite.config.ts`. |
| 10 | Photos do not leave the phone; the SMS carries only text | **VERIFIED** | Photos only exist as blob URLs in memory; the saved `Case` does not contain them. `sms.test.ts` checks that the body has no `blob:` or `data:`. e2e `h`: no requests outside the origin. e2e `m1`/`m2`: SMS and share menu with text. |
| 11 | P1–P4 and D1–D4 pass with the exact numbers | **VERIFIED** | `predict.test.ts`: P1 5/HIGH, P2 2/MEDIUM, P3 0/LOW, P4 CONSULT. `decide.test.ts`: D1 [300,700]/40/[160,660] TREAT; D2 [100,300]/40/[−40,260] CONSULT; D3 [0,100]/40/[−140,60] WAIT; D4 CONSULT without KPIs. They match the tables in `JANI_PLAN.md`. |

## 3. Unit tests (Vitest, 113/113)

`resolve`, `predict` (P1–P4 and the 0.30 limit), `decide` (D1–D4, Swahili, invalid area), `session`, `quality`
(black, white, flat gray, checkerboard), `see` (simulated probabilities, queue), `modelCard` (stable softmax, doubt
rule, `NaN` tolerated, validation), `packs` (valid pack; invalid; corrupt zip, no `pack.json` or with broken JSON;
audio filtering), `voice` (missing audio, rejected `play`, `voiceschanged`, no voices, timeouts, stop),
`sms` (summary, encoding, no phone number), `infer` (preprocessing, real ONNX inference in node with the test model,
reused session, logits length) and `nav`.

## 4. e2e tests (Playwright, 19/19)

| Test | What it shows | Status |
|---|---|---|
| a | Install pack → area → 5 photos → diagnosis → questions → risk → decision → choose → confirmation → Pending | VERIFIED |
| b | Same flow with the second pack; hot switching: `html[lang]`, home phrase, pack name and KPIs change | VERIFIED |
| c | More than half of the photos doubtful → `unsure` phrase and CONSULT suggestion | VERIFIED |
| d | All healthy → `all_healthy`, no risk or KPIs | VERIFIED |
| e | Demo label in Risk and Decision; choosing a non-suggested option | VERIFIED |
| f | Import valid `.zip`; empty and corrupt ones show ⚠️ with the correct code in `data-errors`, without crashing | VERIFIED |
| g | No audio: no `pageerror`, phrases visible, the repeat button works | VERIFIED |
| h | Airplane mode: full flow without network | VERIFIED (simulated SEE) |
| i | Real ONNX inference in the browser with the test model (served with `page.route`, never copied to `public/models`) | VERIFIED (with connection) |
| j1, j2 | Invalid card → ⚠️ and retry; inference failure → doubtful photo, no "retake the photo" loop | VERIFIED |
| k1–k3 | IndexedDB failing: the app does not go blank and the choice is not lost | VERIFIED |
| l | Installed pack with a different version in the catalog → 🔄 and real reinstall in IndexedDB | VERIFIED |
| m1, m2 | Escalation without a phone number: without a share menu it marks sent; with a menu, cancelling does not mark sent | VERIFIED |
| n | Imported pack that breaks a screen → ⚠️ and ⌂, no blank screen | VERIFIED |
| o | English pack: `html[lang]=en`, all text in English, full flow and hot switch back to Spanish | VERIFIED |

## 5. Service worker (precache)

Read from `dist/sw.js` after the build: `index.html`, JS/CSS, `ort/ort-wasm-simd-threaded.wasm`,
`ort/ort-wasm-simd-threaded.mjs`, `models/arabica-v1/model_card.json`, `packs/catalog.json`,
`packs/colombia-andina.zip`, `packs/noor-africa-oriental.zip`, icon and manifest. The pattern includes `*.onnx`:
the real model enters the precache when it is copied and the app is rebuilt. No second copy of the `.wasm` is precached.

## 6. NOT VERIFIED

- **Real ONNX model in airplane mode** (criterion 1 with the real model): no real model yet and it cannot be tested in e2e
  (DECISIONS #13). Manual test: `HUMAN_TODO.md` §4.
- **Real model weight (< 10 MB) and inference time on a phone**: no model or phone. `check:assets` requires < 10 MB.
- **Real audio**: there are no mp3 files. Only the fallback (system voice or text only) was tested, and that nothing fails.
- **System voice in Swahili on real phones**: depends on the phone.
- **iPhone/Safari**: only Chromium was tested.
- **Android APK**: the Capacitor project is ready (`app/android`, Capacitor 7), but there is no Android SDK or Java
  on this machine; it was not compiled or installed. Steps: `HUMAN_TODO.md` §5.
- **PWA publication**: it was not published (out of scope for this work).

## 7. KNOWN FAILURES / minor limitations (not blocking)

- `check:assets` replaces `NaN` without distinguishing whether it is inside a string (it only affects the checker, not the app).
- If saving "sent" fails, the app still opens the SMS (only a console notice).
- The card validation does not require exactly 5 distinct classes; with 1 or 2 classes simulated mode would fail (real mode is not affected).
- The 🔄 update button appears with any different version, also if the catalog one is older.
- KPIs are formatted according to the language, but no e2e test checks the format.
- `training/build_climate.py` was not created (DECISIONS #11).

## 8. Review process

Each task (1–12) had an implementer and a different reviewer (spec compliance and then quality); 4 tasks
needed rounds of fixes. At the end, an auditor reviewed the full branch against the 11 criteria: it found
5 major problems (silent stalls due to failures of the card, the inference or IndexedDB; packs that were not updated;
visible technical text; SMS with no way out). They were fixed in `10e1ff1..c7abc11` and a review of those fixes found them all resolved.
