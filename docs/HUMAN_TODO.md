# Pending items for the team (people)

The app is ready to receive the model and the audio files **without touching code**. All commands are run inside `app/`.

## 0. Set up the computer (one time only)

```bash
cd app
npm install            # also copies the onnxruntime-web .wasm files to public/ort/
npm run e2e:install    # downloads Chromium for the tests, inside the project folder
npm run verify         # types + lint + unit tests + build + e2e tests: must finish without errors
```

## 1. When the model arrives (Colab)

1. Unzip `jani_model.zip` **into** `app/public/models/arabica-v1/`, replacing the example
   `model_card.json`. You should end up with `model_card.json` and the single `.onnx` from the zip (the one named by `recommended_file`).
2. Check:
   ```bash
   npm run check:assets
   ```
   The "Model" section must be all `OK`. If it says `FALTA` (missing), the message points to the exact file or field.
   Note: the card may contain `NaN` in some metric; the app tolerates it (treats it as empty).
3. Rebuild and verify:
   ```bash
   npm run build
   npm run verify
   ```
   When `model_card.json` is loaded with `recommended_file` different from `null`, the app leaves simulated mode on its own.
   The hidden test menu (tap the Capture icon 5 times) stops appearing: that is the sign that it is using the real model.
4. There is no manual plan B: the notebook trains both models and leaves in the zip only the best one that weighs ≤ 10 MB.

## 2. When the audio files arrive

1. Copy the `.mp3` files to `packs/<pack>/audio/<key>.mp3` (one for each key in `phrases`, 38 per pack).
   If `training/make_audio.py` was used, the script already puts them there and updates `audio.status` in `pack.json`.
2. Check and rebuild:
   ```bash
   npm run check:assets   # each pack's section must show 38/38 OK
   npm run build          # repackages the zips (scripts/build-packs.mjs) and the app
   ```
3. On a phone that already had the pack installed: open **Packs** and tap 🔄 on the pack (it appears when
   the catalog version differs). For it to appear, **bump `version` in `pack.json`** whenever audio or data changes.

## 3. Real data (no code)

In each `packs/<pack>/pack.json`: fill in `calendar`, `economics` with their `source` (which must not start with `TODO`),
`risk_rules.validated_by` and `backup_contact.phone`. While a value has no source, the app uses the demo one
and shows the "Demo data" label. Then `npm run build`.

## 4. Manual test on the phone (airplane mode)

What the automated tests **cannot** cover (see `docs/QA_REPORT.md`):

1. Publish or serve the app over HTTPS (see section 6) and open it on the phone with internet **once**.
   Wait a few seconds for the precache to finish (≈ 15 MB + the model). On Android Chrome: "Add to home screen".
2. Install both packs from **Packs** and choose the farm area.
3. Turn on **airplane mode**. Close and reopen the app.
4. Do the full flow with real leaves: 5 photos → diagnosis → two questions → risk → decision → choose →
   confirmation → see the case in Pending.
5. Check: the audio of each screen plays (or the text is read if it is missing), switching packs on the fly changes
   language and values, a dark or blurry photo asks to be retaken, and with doubtful leaves "I am not sure" appears.
6. With HIGH risk or choosing Consult: the send button opens the SMS app with text only (no photos).
7. Measure: weight of the `.onnx` (< 10 MB), time per photo and whether the phone heats up.

## 5. Android APK (Capacitor)

Requires installing Android Studio and Java; they were not installed on this machine.

1. Install Android Studio (it ships JDK 21) and, from the SDK Manager, Android SDK Platform 35, Build-Tools and Platform-Tools.
2. Set `ANDROID_HOME` (e.g. `C:\Users\<user>\AppData\Local\Android\Sdk`) and `JAVA_HOME` (JDK 21);
   add `platform-tools` to the `PATH`.
3. From `app/`:
   ```bash
   npm run android:sync   # web build + copy to android/ (if OneDrive gives ENOTEMPTY, repeat)
   npm run android:apk    # the first time it downloads Gradle 8.11.1 and AGP 8.7.2: needs internet
   ```
4. The APK ends up at `app/android/app/build/outputs/apk/debug/app-debug.apk`.
5. Install: with USB debugging, `adb install -r app\android\app\build\outputs\apk\debug\app-debug.apk`;
   or copy the APK to the phone and open it (allow unknown sources). Alternative: `npx cap open android` and Run.
6. Open the app once and repeat the airplane-mode test from section 4.

## 6. Publish the PWA

The app is static: publish the contents of `app/dist/` after `npm run build`. It uses relative paths (`base: './'`) and
`#` navigation, so it works in any subfolder without rewrite rules. It must be served over **HTTPS**
(the service worker requires it).

- **Netlify / Cloudflare Pages:** base directory `app`, command `npm run build`, publish folder `app/dist`.
- **GitHub Pages:** upload the contents of `app/dist/` to the `gh-pages` branch (or use an Action that runs `npm ci && npm run build` in `app/`).

After publishing, open the URL once with internet and follow section 4.

## 7. Other known pending items

- Confirm dataset licenses (`docs/DATA.md`).
- Validate the Swahili phrases and audio with a native speaker.
- Review and merge the `build/mvp` branch (no push or merge was done).
