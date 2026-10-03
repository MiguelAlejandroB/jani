# Plan de implementación del MVP (prompts 2 a 12)

Spec vinculante: `JANI_PLAN.md` y `CLAUDE.md` (raíz del repo). Este plan las traduce a tareas.
Rama: `build/mvp`. Un commit (o varios pequeños) por tarea. Mensajes de commit en español,
terminados con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Restricciones globales (aplican a TODAS las tareas)

- Directorio de la app: `app/`. Comandos desde `app/`: `npx tsc -b`, `npm run lint`, `npx vitest run`, `npm run build`.
- TypeScript estricto (`noUncheckedIndexedAccess` activo). ESLint con `--max-warnings 0`.
- **Ningún texto visible o hablado se escribe en el código.** Todo texto de pantalla sale de `pack.phrases[clave]`
  del paquete activo (38 claves; ver `packs/colombia-andina/pack.json`). Donde no haya frase, se usa un ícono (emoji)
  o números. Identificadores técnicos en un menú oculto de pruebas sí se permiten.
- **Ningún número agronómico o económico vive en el código**: se leen del paquete con `resolve()` (`src/engine/resolve.ts`).
  Excepciones fijadas por la spec (no son datos del paquete): umbrales de calidad de foto (§4.3, en `engine/quality.ts`),
  `unsureShare > 0.5` (§4.4), `affectedShare > 0.30` (nombre del factor `affected_share_over_30pct`, §5), rango del área
  0,5–10 ha con inicial 2 (§6).
- Clases, normalización, temperatura y umbrales de duda se leen de `app/public/models/arabica-v1/model_card.json`.
- **No editar** `packs/*/pack.json`, `training/jani_train.ipynb`, `training/make_audio.py`, `JANI_PLAN.md`, `CLAUDE.md`.
- Nada sale a la red en el recorrido. Nada desde CDN. Las fotos nunca salen del teléfono; el SMS solo lleva texto.
- `engine/predict.ts` y `engine/decide.ts` son funciones puras (sin IndexedDB, sin DOM, sin `Date.now()`).
- Pruebas en `app/src/tests/*.test.ts` (Vitest, entorno node). Primero la prueba, luego el código (TDD).
- Interfaz: botones grandes, íconos, una acción por pantalla. Estilos existentes en `src/styles.css`, componentes
  `BigButton` y `Screen` en `src/ui.tsx`. Navegación por hash con `useNav()` de `src/nav.tsx`.
- No instalar nada fuera de `jani/` salvo lo que la tarea indique. No hacer push.

## Tipos compartidos (crear en Task 1, en `app/src/engine/types.ts`, y reutilizar)

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

(`ClassId` en `CLASS_IDS` es el orden de la spec; en ejecución el orden de salidas del modelo se toma de `model_card.classes`.)

---

### Task 1: Esquema, validación y carga de paquetes; empaquetado (prompt 2, parte A)

Archivos: `app/src/engine/types.ts` (tipos de arriba), `app/src/packs/schema.ts`, `app/src/packs/loader.ts`,
`app/src/store/settings.ts`, `scripts/build-packs.mjs` (raíz del repo), `app/src/tests/packs.test.ts`, `app/package.json`.

1. `schema.ts`: tipo `Pack` derivado de los dos `packs/*/pack.json` (campos: `id`, `version`, `language{code,name,needs_native_review}`,
   `crop`, `units`, `backup_contact{role,phone}`, `classes`, `calendar`, `climate_normals`, `risk_rules{validated_by,note,points,thresholds}`,
   `economics`, `demo_values`, `phrases: Record<string,string>`, `audio{dir,format,status,files?}`, `tts`). Campos con `null` permitidos
   donde los paquetes de referencia los traen en `null`. Exportar `REQUIRED_PHRASE_KEYS` (las 38 claves de `phrases` de los paquetes de
   referencia, en su orden) y `validatePack(json: unknown): { ok: true; pack: Pack } | { ok: false; errors: string[] }` escrita a mano
   (sin librerías). Reglas mínimas: objeto; `id` string no vacío y sin `/`; `version` string; `language.code` string; `phrases` contiene
   cada clave de `REQUIRED_PHRASE_KEYS` con string no vacío; `classes` tiene las 5 `ClassId`; `risk_rules.points` tiene números para
   `affected_share_over_30pct`, `rainy_month`, `user_reports_heavy_rain`, `no_treatment_last_60_days`; `risk_rules.thresholds.medium/high`
   números; `calendar`, `economics`, `demo_values` son objetos. Cada error es un string que nombra la ruta (`"phrases.welcome"`).
2. `loader.ts` (usa `fflate` e `idb-keyval`):
   - `parsePackZip(bytes: Uint8Array): { pack: Pack; audio: Record<string, Blob> }`. Zip con `pack.json` en la raíz y
     `audio/<clave>.mp3`. Lanza `PackError` (clase exportada, con `code: 'corrupt_zip' | 'missing_pack_json' | 'invalid_json' | 'invalid_pack'`
     y `errors: string[]`) si el zip no se puede descomprimir, falta `pack.json`, el JSON es inválido o `validatePack` falla.
     Audios: solo archivos `audio/*.mp3` cuyo nombre sin extensión sea una clave de `pack.phrases`; Blob con tipo `audio/mpeg`.
   - `installPackFromZip(bytes)`: parsea, guarda en IndexedDB: `pack:<id>` → JSON del paquete; `audio:<id>:<clave>` → Blob;
     actualiza la lista `packs:installed` (string[] sin duplicados; reinstalar reemplaza y borra audios viejos de ese id). Devuelve el `Pack`.
   - `listInstalledPacks(): Promise<Pack[]>`, `getPack(id)`, `getPackAudio(packId, key): Promise<Blob | undefined>`.
   - `fetchCatalog(baseUrl = './packs/')`: lee `catalog.json`. `installPackFromCatalog(entry)`: `fetch` del zip (relativo) e instala.
3. `store/settings.ts` (idb-keyval): `getActivePackId/setActivePackId`, `getAreaHa/setAreaHa` (undefined si nunca se preguntó),
   y constantes `AREA_MIN_HA = 0.5`, `AREA_MAX_HA = 10`, `AREA_STEP_HA = 0.5`, `AREA_DEFAULT_HA = 2` (§6 de la spec).
4. `scripts/build-packs.mjs` (Node, en la raíz del repo; resolver `fflate` desde `app/node_modules` con `createRequire` apuntando a
   `app/package.json`): por cada carpeta de `packs/` con `pack.json`, crear `app/public/packs/<id>.zip` con `pack.json` y `audio/*.mp3`
   si existen (carpeta de audio ausente = zip solo con `pack.json`), y escribir `app/public/packs/catalog.json`:
   `[{ "id", "version", "language": { "code", "name" }, "file": "<id>.zip", "size": <bytes> }]` ordenado por id.
   Imprimir un resumen por paquete (id, tamaño, número de audios / 38).
   Scripts en `app/package.json`: `"packs": "node ../scripts/build-packs.mjs"`, `"predev": "npm run packs"`, `"prebuild": "npm run packs"`.
5. Pruebas (`packs.test.ts`), sin IndexedDB real (probar `validatePack` y `parsePackZip`; construir zips en memoria con `fflate.zipSync`):
   paquete válido (los dos de `packs/` leídos con `fs`) → ok; paquete sin `phrases.welcome` → error que nombra `phrases.welcome`;
   paquete sin `risk_rules.points.rainy_month` → error; bytes aleatorios → `PackError` `corrupt_zip`; zip sin `pack.json` →
   `missing_pack_json`; zip con JSON roto → `invalid_json`; zip válido con `audio/welcome.mp3` y `audio/otra.mp3` → solo `welcome` en audio.
   (Si `Blob` no existe en node, usar el global de Node 20, que sí existe.)

### Task 2: Paquete activo en la app y pantalla Paquetes (prompt 2, parte B)

Archivos: `app/src/packs/PackContext.tsx` (nuevo), borrar `app/src/packs/active.ts`, `app/src/screens/Paquetes.tsx`,
`app/src/App.tsx`, todas las pantallas que hoy importan `t` de `packs/active`.

1. `PackProvider` + `usePack()`: `{ pack: Pack | null; t(key): string; installed: Pack[]; activate(id); refresh(); areaHa: number | undefined; setAreaHa(n) }`.
   Al arrancar carga paquetes instalados y el activo desde IndexedDB. `t(key)` devuelve `pack.phrases[key] ?? ''`.
   Cambiar de paquete actualiza idioma (`document.documentElement.lang = pack.language.code`), frases y valores al instante.
2. Si no hay paquete activo, la app muestra la pantalla Paquetes (cualquier ruta redirige a `paquetes`).
3. Paquetes: (a) lista de instalados, con el activo resaltado; tocar uno lo activa; (b) catálogo desde `fetchCatalog()` con botón
   `t('install')` (o ícono si no hay paquete activo aún) y el nombre del idioma de `catalog.language.name`; (c) botón
   `t('import_file')` que abre `<input type="file" accept=".zip,application/zip">` e instala con `installPackFromZip`; si falla, mostrar
   ícono de error (⚠️) y los `errors` técnicos del `PackError` en letra pequeña; (d) pregunta del área: tras instalar el primer paquete,
   o si `areaHa` es undefined, mostrar `t('ask_area')` con selector grande (botones − / + y número grande, de 0,5 a 10, paso 0,5,
   inicial 2) y botón ✅ que guarda. También accesible siempre en la pantalla Paquetes.
   Al instalar desde catálogo o archivo, el paquete recién instalado queda activo.
4. Atributos `data-testid` estables para e2e: `pack-installed-<id>`, `pack-catalog-<id>`, `pack-install-<id>`, `pack-import-input`,
   `area-value`, `area-minus`, `area-plus`, `area-save`, `pack-error`.
5. Sin pruebas unitarias nuevas obligatorias (UI); `tsc`, lint y `vitest` deben seguir verdes y `npm run build` debe pasar.

### Task 3: resolve, PREDICT y DECIDE (prompts 3, 4 y 5)

Archivos: `app/src/engine/resolve.ts`, `app/src/engine/predict.ts`, `app/src/engine/decide.ts`,
`app/src/tests/resolve.test.ts`, `app/src/tests/predict.test.ts`, `app/src/tests/decide.test.ts`.

1. `resolve(pack: Pack, path: string): { found: true; value: unknown; usedDemo: boolean } | { found: false }` con ruta de puntos
   (índices de arreglo como segmento numérico: `economics.treatments.roya.0`).
   - Valor real: recorrer `path` desde la raíz del paquete. Si el nodo final es un objeto con clave `value`, el valor es `node.value`.
     La **fuente que gobierna** es la clave `source` del nodo final si es objeto, o la del ancestro más cercano que tenga `source`
     (p. ej. `economics.loss_share_by_risk.roya.high` la toma de `...roya.source`; `economics.treatments.roya.0` de `treatments.roya[0].source`;
     `calendar.rainy_months` de `calendar.source`). Una fuente es válida si es string no vacío que no empieza por `TODO`.
     Si ningún nodo de la cadena tiene `source` (p. ej. `risk_rules.points.rainy_month`), el valor se toma como real.
   - Un valor está **ausente** si es `null`/`undefined`, o arreglo que contiene `null`, o objeto con algún campo requerido en `null`.
     Para objetos (p. ej. un tratamiento) se considera ausente si cualquiera de sus propiedades numéricas es `null`.
   - Orden: (1) real presente y con fuente válida (o sin fuente en la cadena) → `{found, value, usedDemo:false}`;
     (2) si no, `pack.demo_values` en la misma ruta (sin el envoltorio `value`) presente → `{found, value, usedDemo:true}`; (3) `{found:false}`.
   - Nunca inventa valores por defecto.
   Pruebas: real con fuente → usedDemo false; real con `source: "TODO"` y demo presente → demo, usedDemo true; ausente en ambos →
   found false; ruta con `{value, source}` desenvuelve; `risk_rules.points.rainy_month` → real. Construir variantes clonando el paquete de Colombia.
2. `predict(input, pack)` según §5 de la spec. Puntos y umbrales: `resolve` de `risk_rules.points.<factor>` y `risk_rules.thresholds.medium|high`.
   Meses lluviosos: `resolve(pack, 'calendar.rainy_months')`. Cualquier valor no encontrado → `{ level: 'CONSULT', reason: 'missing:<ruta>' }`.
   Factores en este orden: `affected_share_over_30pct` (`affectedShare > 0.30`), `rainy_month` (`month` en la lista),
   `user_reports_heavy_rain` (`heavyRainThisWeek`), `no_treatment_last_60_days` (`!treatedLast60Days`).
   `points >= high` → HIGH; `>= medium` → MEDIUM; si no, LOW. `usedDemoData` = algún `resolve` usado devolvió `usedDemo`.
   Pruebas EXACTAS con el paquete Colombia sin modificar (demo: lluviosos 4,5,10,11):
   P1 share 0.50, mes 10, llovió, sin tratamiento → 5 puntos, HIGH. P2 share 0.40, mes 7, no llovió, con tratamiento → 2, MEDIUM.
   P3 share 0.20, mes 7, no llovió, con tratamiento → 0, LOW. P4 paquete clonado sin `calendar.rainy_months` real (null) ni
   `demo_values.calendar.rainy_months` → CONSULT. Verificar también `factors` de P1 (los cuatro) y `usedDemoData === true`.
3. `decide(input, pack)` según §6. Todo en kilos. Rutas: `economics.typical_yield_kg_per_ha`, `economics.price_per_kg`,
   `economics.loss_share_by_risk.<dominant>.<low|medium|high>` (nivel en minúsculas), `economics.treatments.<dominant>.0`
   (usar `cost_per_ha` y `residual_risk`), y `economics.loss_share_by_risk.<dominant>.<residual_risk>`.
   Fórmulas: producción = rendimiento × área; pérdida_no_act = producción × loss_share[risk] (rango);
   costo_kg = cost_per_ha × área ÷ precio; pérdida_tratada = producción × loss_share[residual];
   neto = [no_act.min − tratada.max − costo, no_act.max − tratada.min − costo]; breakEvenKg = costo_kg.
   Salida: neto.min > 0 → TREAT, `act_cheaper`, high; neto.max < 0 → WAIT, `wait_ok`, high; cruza cero (incluye tocar 0) y LOW → WAIT,
   `wait_ok`, medium; cruza cero y MEDIUM/HIGH → CONSULT, `consult`, low. Falta cualquier valor → `{suggestion:'CONSULT', phrase:'consult', usedDemoData}` sin `kpis`.
   Clasificar con los valores sin redondear; en `kpis` devolver valores redondeados a 2 decimales (`Math.round(x*100)/100`) para
   eliminar ruido de coma flotante. `usedDemoData` = algún `resolve` usó demo.
   Pruebas EXACTAS (paquete Colombia sin modificar, roya, área 2):
   D1 HIGH → expectedLossKg [300, 700], treatmentCostKg 40, breakEvenKg 40, netBenefitKg [160, 660], TREAT, act_cheaper, high, usedDemoData true.
   D2 MEDIUM → [100, 300], 40, [−40, 260], CONSULT, consult, low.
   D3 LOW → [0, 100], 40, [−140, 60], WAIT, wait_ok, medium.
   D4 paquete clonado con `economics.price_per_kg.value = null` y sin `demo_values.economics.price_per_kg` → CONSULT, sin kpis.
   Añadir una prueba con el paquete de suajili (roya, HIGH, 2 ha) que solo verifique que devuelve kpis y `usedDemoData` true.

### Task 4: Sesión, calidad de foto y SEE simulado (prompt 6 parte A; calidad del prompt 9)

Archivos: `app/src/engine/session.ts`, `app/src/engine/quality.ts`, `app/src/engine/see.ts`, `app/src/engine/modelCard.ts`,
`app/src/tests/session.test.ts`, `app/src/tests/quality.test.ts`, `app/src/tests/see.test.ts`.

1. `session.ts`: `buildSession(results: SeeResult[]): Session` — `dominant` = clase no sana más frecuente entre resultados `ok`
   (empate: la primera en el orden de `CLASS_IDS`; `null` si no hay); `affectedShare` = hojas ok no sanas ÷ hojas ok (0 si no hay ok);
   `unsureShare` = unsure ÷ total (0 si total 0). `sessionOutcome(s): 'consult' | 'healthy' | 'continue'`:
   `unsureShare > 0.5` → consult; si hay al menos un ok y todos los ok son sanos → healthy; si no hay ningún ok → consult; si no → continue.
   Pruebas: mezcla con dominante; empate; 3 de 5 unsure → consult; 2 de 4 unsure y 2 sanas → healthy (0.5 no es > 0.5); todas sanas → healthy; affectedShare exacto.
2. `quality.ts`: constantes `MIN_BRIGHTNESS = 40`, `MAX_BRIGHTNESS = 230`, `MIN_LAPLACIAN_VAR = 60`, `QUALITY_SIZE = 224`.
   Puras: `toGray(rgba: Uint8ClampedArray): Float32Array` (luma 0.299R+0.587G+0.114B), `meanBrightness(gray)`,
   `laplacianVariance(gray, w, h)` (kernel 4-vecinos [0,1,0;1,-4,1;0,1,0], solo píxeles interiores, varianza poblacional),
   `assessQuality(rgba, w, h): 'ok' | 'bad_photo'`. Navegador: `imageToRgba(image: ImageBitmap, size = 224): Uint8ClampedArray`
   (OffscreenCanvas si existe, si no `<canvas>`; estira sin recortar). Pruebas con imágenes sintéticas: negra → bad_photo;
   blanca → bad_photo; gris plano 128 → bad_photo (varianza 0); tablero de ajedrez 0/255 de 8 px recortado a gris medio → ok
   (escoger un patrón cuya media esté entre 40 y 230 y varianza alta; documentar el valor esperado calculado).
3. `modelCard.ts`: tipo `ModelCard` (campos de §4.2: `classes`, `input{mean,std,shape,name}`, `output{name}`, `temperature`,
   `unsure_rule{min_confidence,min_margin}`, `files`, `recommended_file: string|null`, `metrics`, `size_mb`) y
   `loadModelCard(baseUrl = './models/arabica-v1/')` (fetch). Puras: `softmax(logits: ArrayLike<number>, temperature): number[]`
   (estable numéricamente) y `applyUnsureRule(probs, card, classes): SeeResult` (max < min_confidence → low_confidence;
   max − segunda < min_margin → low_margin; si no ok con `classId = classes[argmax]`, `confidence = max`).
4. `see.ts`: `see(image: ImageBitmap, card: ModelCard, opts?): Promise<SeeResult>`. Paso 1 calidad (`imageToRgba` + `assessQuality`)
   → `bad_photo` si falla. Si `card.recommended_file` es `null` → **modo simulado**: tomar el siguiente resultado de la cola simulada
   y construir probabilidades: para clase X, X = 0.9 y el resto reparte 0.1 en partes iguales; `low_confidence` → máximo 0.5;
   `low_margin` → 0.45 / 0.40 / resto; `bad_photo` → unsure bad_photo. Pasar por `applyUnsureRule` las de clase y confianza
   (deben salir `ok` con los umbrales del card de ejemplo: 0.9 ≥ 0.7, margen 0.875 ≥ 0.15). Modo real: lanzar `Error('not_implemented')`
   (Task 8 lo implementa). Cola simulada: `SimOutcome = ClassId | 'low_confidence' | 'low_margin' | 'bad_photo'`;
   `getSimPlan(): SimOutcome[]` lee `localStorage['jani.sim']` (JSON de arreglo; con try/catch) y por defecto `['roya']`;
   la cola se recorre cíclicamente por índice (`nextSimOutcome()` y `resetSim()` al iniciar una revisión).
   Separar la construcción de probabilidades en una función pura `simulatedProbs(outcome, classes)` probada en Vitest.

### Task 5: Recorrido de punta a punta en pantallas (prompt 6 parte B; etiqueta demo del prompt 10)

Archivos: `app/src/flow/FlowContext.tsx` (nuevo), `app/src/screens/{Captura,Diagnostico,Preguntas,Riesgo,Decision,Confirmacion,Inicio}.tsx`,
`app/src/ui.tsx` (componente `DemoBadge`), `app/src/styles.css`.

1. `FlowProvider`/`useFlow()`: estado de la revisión en curso: fotos (object URLs para miniaturas + `SeeResult`), `session`,
   respuestas (`heavyRain`, `treated`), `risk`, `decision`, `choice`, `caseId`. `startReview()` limpia y llama `resetSim()`.
   `ModelCard` se carga una vez (`loadModelCard`).
2. Inicio: botón 📷 → `startReview()` y `captura`.
3. Captura: `<input type="file" accept="image/*" capture="environment">` (`data-testid="photo-input"`) disparado por un botón grande 📷.
   Cada foto → `createImageBitmap` → `see()`. Si `bad_photo`: no se cuenta, mostrar `t('retake')`. Si no, se agrega.
   Contador numérico `n / 5` (sin palabras) en `data-testid="photo-count"`. Máximo 10 (luego el botón de foto se desactiva).
   Botón `t('done_photos')` (`data-testid="photos-done"`) habilitado con ≥ 1 foto contada; al tocar: `buildSession` y `diagnostico`.
   Menú oculto de pruebas: tocar 5 veces el ícono de la pantalla abre un panel (`data-testid="sim-menu"`) con un botón por
   `SimOutcome` (texto = identificador técnico) que agrega a `localStorage['jani.sim']`, y uno 🗑 que lo limpia. Solo en modo simulado.
4. Diagnóstico: miniaturas con ícono por resultado (✅ sana, 🍂 enferma, ❓ unsure). Según `sessionOutcome`:
   consult → `t('unsure')`, botón ➜ a `decision` con decisión `{suggestion:'CONSULT', phrase:'consult', usedDemoData:false}` sin kpis
   y sin riesgo; healthy → `t('all_healthy')`, sin riesgo ni economía, botón ✅ que guarda el caso (Task 7 lo persiste; por ahora deja
   la llamada en el contexto) y va a `confirmacion`; continue → `t('dx_<dominant>')` y botón ➜ a `preguntas`.
   `data-testid="dx-outcome"` con atributo `data-outcome`.
5. Preguntas: dos preguntas en secuencia (una por vez): `t('ask_rain')` y luego `t('ask_treatment')`, botones grandes
   `t('yes')` / `t('no')` (`data-testid="answer-yes"`, `answer-no"`). Al responder la segunda: `predict` con `month = new Date().getMonth()+1`
   y el paquete activo, y va a `riesgo`.
6. Riesgo: semáforo (círculo grande verde/amarillo/rojo) con `t('risk_low|medium|high')`, íconos por factor
   (`affected_share_over_30pct` 🍂, `rainy_month` 📅, `user_reports_heavy_rain` 🌧️, `no_treatment_last_60_days` 🚫💧),
   `DemoBadge` si `usedDemoData`. `data-testid="risk-level"` con `data-level`. Si CONSULT → `t('consult')` y ➜ a decisión CONSULT sin kpis.
   ➜ calcula `decide({dominant, risk, areaHa})` y va a `decision`.
7. Decisión: KPIs grandes en kilos con ícono y la etiqueta `t('kpi_loss')`, `t('kpi_cost')`, `t('kpi_breakeven')`, `t('kpi_net')`
   (rangos como `a – b kg`; usar `pack.units.weight` para la unidad), frase `t(decision.phrase)`, `t('you_decide')`,
   tres botones `t('opt_wait')`, `t('opt_treat')`, `t('opt_consult')` con el sugerido resaltado (`data-suggested="true"`).
   `DemoBadge` (`data-testid="demo-badge"`, texto `t('demo_data')`) cuando `decision.usedDemoData`. Elegir guarda `choice` y va a `confirmacion`.
   `data-testid`: `decision-suggestion` (con `data-suggestion`), `choice-WAIT|TREAT|CONSULT`, `kpi-loss|cost|breakeven|net`.
8. Confirmación: `t('saved')`, ícono ✅, botón ⌂. (SMS en Task 7.)

### Task 6: VOICE (prompt 7)

Archivos: `app/src/engine/voice.ts`, `app/src/ui.tsx` (botón repetir), pantallas, `app/src/tests/voice.test.ts`.

1. `say(key)` reproduce el `Blob` de `getPackAudio(packActivo, key)` con `HTMLAudioElement` (object URL, revocar al terminar) y espera
   `ended`. Si no hay Blob o falla `play()`: intentar `speechSynthesis` con `lang = pack.language.code` y el texto `pack.phrases[key]`,
   solo si existe una voz cuyo `lang` empiece por ese código; esperar `onend`. Si nada de eso es posible, resolver sin error.
   **Nunca lanza.** `sayAll(keys)` en secuencia. `stopVoice()` cancela lo que suene. Inyectar dependencias (fuente de audio, fábrica
   de Audio, speechSynthesis) para poder probar en node: pruebas de "falta audio y no hay voz → resuelve", "play rechaza → usa speech",
   "sayAll respeta el orden".
2. Hook `useScreenAudio(keys: string[])`: al entrar a la pantalla reproduce `sayAll(keys)` (una vez por cambio de claves),
   detiene al salir. Botón grande 🔊 `RepeatButton` (`data-testid="repeat-audio"`) en cada pantalla con audio.
   Frases por pantalla (§10): Inicio `welcome`; Captura `more_photos` al entrar, `retake` tras foto mala, `done_photos` al llegar a 5;
   Diagnóstico `dx_<dominante>` / `all_healthy` / `unsure`; Preguntas `ask_rain` y luego `ask_treatment`; Riesgo `risk_*` (o `consult`);
   Decisión frase de DECIDE y luego `you_decide`; Confirmación `saved`.
3. Los números (kilos) no se dicen.

### Task 7: Casos, Pendientes y SMS (prompt 8)

Archivos: `app/src/store/cases.ts`, `app/src/screens/{Pendientes,Confirmacion,Diagnostico,Decision}.tsx`, `app/src/engine/sms.ts`,
`app/src/tests/sms.test.ts`.

1. `cases.ts` (idb-keyval, clave `cases` → `Case[]` o una clave por caso): `saveCase(c)`, `listCases()` (más reciente primero),
   `markSent(id)`. `id` con `crypto.randomUUID()`; `date` ISO.
2. Se guarda un caso al elegir en Decisión (con `session`, `risk` si hubo, `decision`, `choice`) y al confirmar hojas sanas (sin choice).
3. Pendientes: lista (`data-testid="case-item"`) con fecha local (`toLocaleDateString(pack.language.code)`), ícono del resultado,
   `t('dx_<dominante>')` o `t('all_healthy')`/`t('unsure')`, nivel de riesgo con color, y la elección `t('opt_*')`. Título `t('pending')`.
4. `sms.ts` pura: `buildCaseSummary(c: Case, pack: Pack): string` compuesta SOLO de frases del paquete, fecha ISO (AAAA-MM-DD) y
   valores del caso (líneas: fecha; `phrases['dx_<dominante>']` o `all_healthy`/`unsure`; `phrases['risk_<nivel>']` si hay;
   `phrases['opt_<choice>']` si hay). Sin fotos ni URLs de imágenes. `smsHref(phone, body)` → `sms:<phone>?body=<encodeURIComponent(body)>`.
   Pruebas: el resumen contiene las frases esperadas y no contiene `blob:` ni `data:`; `smsHref` codifica.
5. Confirmación: si `choice === 'CONSULT'` o riesgo HIGH, botón `t('send_case')` (`data-testid="send-case"`): si `pack.backup_contact.phone`
   → `location.href = smsHref(...)`; si no → `navigator.share({ text })` si existe; marca `sent`.

### Task 8: SEE real con onnxruntime-web (prompt 9)

Archivos: `app/src/engine/see.ts`, `app/src/engine/infer.ts` (nuevo), `app/src/tests/infer.test.ts`, `app/tests/fixtures/` (nuevo),
`app/tests/fixtures/make_tiny_model.py`.

1. `infer.ts`: `preprocess(rgba: Uint8ClampedArray, card): Float32Array` (RGB, ÷255, −mean, ÷std, NCHW, tamaño `card.input.shape`);
   `getSession(url)` crea **una sola** `ort.InferenceSession` por URL y la reutiliza (cache en módulo); configurar antes
   `ort.env.wasm.wasmPaths` a la carpeta `ort/` servida por la app (relativa a `document.baseURI`; en node, la carpeta de
   `onnxruntime-web/dist`) y `ort.env.wasm.numThreads = 1`. `runModel(rgba, card, modelUrl): Promise<number[]>` devuelve logits
   usando `card.input.name` y `card.output.name`. Importar `onnxruntime-web/wasm` (solo backend WASM).
2. `see.ts` modo real (cuando `recommended_file` no es null): calidad → `imageToRgba` → `runModel` con
   `models/arabica-v1/<recommended_file>` → `softmax(logits, card.temperature)` → `applyUnsureRule`.
3. Fixture SOLO de prueba: crear `.venv` en la raíz del repo (`python -m venv .venv`, `pip install onnx numpy`), y
   `make_tiny_model.py` que escribe `app/tests/fixtures/tiny_model.onnx`: entrada `input` [1,3,224,224] float, salida `logits` [1,5];
   grafo `GlobalAveragePool → Flatten → Gemm` con pesos fijos conocidos (W 5×3, b 5) para poder calcular el resultado esperado a mano.
   Y `app/tests/fixtures/model_card.test.json` (copia de la estructura del card de ejemplo con `recommended_file: "tiny_model.onnx"`,
   `temperature` distinto de 1, p. ej. 2). **Nunca copiar a `public/models`.** Commitear el `.onnx` generado (es pequeño).
4. Prueba (`infer.test.ts`): con una imagen RGBA sintética uniforme de color conocido, verificar `preprocess` (valores del primer
   píxel de cada canal), que `runModel` en node con onnxruntime-web devuelve los logits esperados (tolerancia 1e-4), que `getSession`
   devuelve la misma instancia dos veces, y que softmax con temperatura + regla de duda dan el resultado esperado.
   Si onnxruntime-web no corre en node, cubrir la inferencia real en la prueba e2e de Task 11 (servir el fixture con `page.route`)
   y documentarlo en el informe.

### Task 9: Acerca de (prompt 10)

Archivos: `app/src/screens/AcercaDe.tsx`.
Ícono ℹ️. Muestra, sin textos nuevos en el código: del `model_card.json` el `id`, `recommended_file` (o 🧪 si es null = modo simulado),
`size_mb` y todas las entradas de `metrics` (clave: valor); del paquete activo: `risk_rules.validated_by`, `risk_rules.note`,
`calendar.source`, `climate_normals.source`, cada `source` de `economics` (con su ruta como clave), `audio.status`,
`language.needs_native_review` (ícono ⚠️ si true), y `demo_values.note` con `DemoBadge` si `demo_values.synthetic`.
`data-testid="about-model"` y `about-sources`.

### Task 10: Offline, check:assets y verify (prompt 11 y preparación de insumos)

Archivos: `app/vite.config.ts`, `app/scripts/check-assets.mjs`, `app/package.json`.

1. Service worker (vite-plugin-pwa, `generateSW`): precarga `index.html`, JS/CSS, `ort/*.wasm` y `ort/*.mjs`, `models/**`
   (model_card y `.onnx`), `packs/catalog.json`, `packs/*.zip`, íconos y manifest. `navigateFallback: 'index.html'`.
   `maximumFileSizeToCacheInBytes` suficiente para el `.wasm` (≥ 30 MB). Verificar leyendo `dist/sw.js` tras `npm run build`
   que aparecen: `ort-wasm-simd-threaded.wasm`, `ort-wasm-simd-threaded.mjs`, `models/arabica-v1/model_card.json`,
   `packs/catalog.json`, `packs/colombia-andina.zip`, `packs/noor-africa-oriental.zip`.
   El JS de onnxruntime-web que Vite empaquete también debe quedar precargado (incluir `mjs` en globPatterns).
2. `scripts/check-assets.mjs` (`npm run check:assets`): (a) `public/models/arabica-v1/model_card.json` existe y tiene `classes` (5),
   `input.mean`/`input.std` (3 números), `temperature`, `unsure_rule.min_confidence`, `unsure_rule.min_margin`, `recommended_file`
   no nulo, y el archivo que nombra existe y pesa < 10 MB; (b) por cada `packs/<id>/pack.json`, existe `audio/<clave>.mp3` para cada
   clave de `phrases`. Imprime una lista clara de lo que falta (por paquete y por clave), resumen OK/FALTA, y sale con código 1 si falta algo.
3. Scripts: `"typecheck": "tsc -b"`, `"test": "vitest run"`, `"e2e": "playwright test"`,
   `"verify": "npm run typecheck && npm run lint && npm run test && npm run build && npm run e2e"`.
   (`e2e` se completa en Task 11; aquí puede quedar el script aunque Playwright aún no esté.)

### Task 11: Pruebas de extremo a extremo con Playwright (QA)

Archivos: `app/playwright.config.ts`, `app/e2e/*.spec.ts`, `app/e2e/fixtures/`, `app/package.json`.

1. Instalar `@playwright/test` y Chromium **dentro de la carpeta** (`PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium`;
   el script `e2e` debe exportar `PLAYWRIGHT_BROWSERS_PATH=0`, de forma portable: usar `cross-env` o configurarlo en `playwright.config.ts`
   antes de lanzar). `webServer`: `npm run build && npx vite preview --port 4173 --strictPort` (el SW solo existe en producción).
   Viewport de teléfono (390×844). Un solo worker.
2. Fotos de prueba: imágenes PNG con textura (que pasen `assessQuality`), generadas en `e2e/fixtures/` (script o en el test vía canvas).
   La cola simulada se fija con `localStorage['jani.sim']` (addInitScript) y/o el menú oculto.
3. Casos (un `test` por letra, nombres que empiecen por la letra):
   a. Recorrido completo: instalar `colombia-andina` desde catálogo → área (2) → 5 fotos (sim `roya`) → diagnóstico → preguntas
      (sí, no) → riesgo → decisión (verificar KPIs visibles) → elegir → confirmación → aparece en Pendientes.
   b. Igual con `noor-africa-oriental`; luego, con ambos instalados, cambiar el activo en Paquetes y comprobar que `html[lang]` y el
      texto de Inicio cambian (frase `welcome` de cada `pack.json`, leída del archivo en el test) y que los KPIs cambian.
   c. "No estoy segura": sim con más de la mitad `low_confidence` → diagnóstico muestra frase `unsure` y la sugerencia es CONSULT.
   d. Todas sanas: sim `sana` → frase `all_healthy`; no aparecen `kpi-*` ni `risk-level`.
   e. `demo-badge` visible en Decisión con el texto `demo_data` del paquete.
   f. Importar `.zip` desde archivo (`setInputFiles` con `public/packs/colombia-andina.zip`) → queda instalado y activo.
      Además: importar un archivo corrupto muestra `pack-error` y la app no se cae.
   g. Audio ausente (no hay mp3): el recorrido no lanza errores (`page.on('pageerror')` vacío) y las frases se ven en pantalla.
   h. OFFLINE: cargar la app, esperar a que el SW esté activo y controle la página (`navigator.serviceWorker.ready` + recarga),
      `context.setOffline(true)`, recargar y repetir el recorrido completo (instalar paquete desde catálogo incluido). Registrar
      todas las peticiones (`page.on('requestfailed')`) y verificar que ninguna falló y que ninguna fue a un origen distinto de localhost.
4. `npm run e2e` debe pasar completo. Guardar el reporte en `app/playwright-report` (ignorado por git).

### Task 12: Android con Capacitor (prompt 12)

El SDK de Android y Java **no** están instalados en esta máquina: no instalarlos.
1. `npm i @capacitor/core` y `npm i -D @capacitor/cli @capacitor/android`; `capacitor.config.ts` con `appId: 'org.jani.app'`,
   `appName: 'Jani'`, `webDir: 'dist'`. Ejecutar `npx cap add android` y `npx cap sync android` (si `cap add` falla sin SDK,
   anotar el error exacto).
2. Scripts: `"android:sync": "npm run build && npx cap sync android"`, `"android:apk": "cd android && gradlew assembleDebug"` (Windows) —
   documentar en el informe los pasos para generar e instalar el APK (Android Studio / `adb install`).
3. Verificar que `npm run verify` sigue verde y que `android/` no rompe lint ni tsc.
