# JANI — Especificación y plan de construcción (v2)

> Documento de trabajo para el equipo y para Claude Code.
> Hackathon Small AI for Development (Banco Mundial × Hack-Nation), reto 04, sector Agricultura.
> **Todo lo descrito aquí se construye en el MVP.** Donde algo queda para después, está solo en la sección 14.

---

## 1. Qué es Jani

Una app que funciona sin internet y ayuda a un caficultor pequeño a tomar una decisión: ante una señal en la hoja, **¿trato ahora, espero o consulto a una persona?**

Tiene cuatro módulos y los cuatro se construyen y funcionan sin conexión:

| Módulo | Qué se construye | Con qué |
|---|---|---|
| **① SEE** | Clasificador de hojas que corre en el teléfono | Modelo de visión entrenado en Colab, exportado a ONNX |
| **② PREDICT** | Motor de riesgo que da BAJO, MEDIO o ALTO y explica por qué | Sistema de puntos con parámetros del paquete |
| **③ DECIDE** | Motor económico que compara esperar y tratar, en kilos de café | Fórmulas de pérdida esperada y beneficio neto |
| **④ VOICE** | Reproductor que dice cada resultado en el idioma local | Un audio por frase, incluido en el paquete |

**Motor + paquetes.** La app (el motor) es igual en todo el mundo. Lo local vive en un **paquete** instalable: idioma, audios, enfermedades, calendario, clima, precios y contacto de respaldo. El MVP trae dos: `noor-africa-oriental` (suajili) y `colombia-andina` (español).

**Frase del problema (formato del reto).**
> Gracias a esta herramienta, una caficultora de 2 hectáreas decidirá el mismo fin de semana si tratar, esperar o consultar ante una señal de enfermedad en sus hojas, lo que hoy decide tarde, cuando el extensionista pasa dos veces al año; lo sabemos porque [COMPLETAR: dato con fuente, año y país].

---

## 2. Criterios de aceptación (reglas del reto)

1. Corre en un smartphone Android de gama media o baja; en iPhone, como PWA desde Safari.
2. La ruta foto → diagnóstico → riesgo → decisión → voz funciona en **modo avión**.
3. El modelo pesa menos de 10 MB.
4. Hay interacción completa en **suajili** (texto y audio).
5. La persona toma la decisión final; la app sugiere y registra.
6. Si la evidencia no alcanza, la app dice "no estoy segura, consulta a una persona".
7. Ningún texto se genera en ejecución: todo sale de una lista fija en el paquete.
8. Cada dato lleva fuente; los valores de demostración se muestran con una etiqueta visible.

---

## 3. Stack

| Capa | Elección |
|---|---|
| App | PWA con React + Vite + TypeScript (estricto) |
| Offline | `vite-plugin-pwa` (service worker con precarga de modelo, `.wasm`, paquetes y audios) |
| Inferencia | `onnxruntime-web`, backend WASM, archivos `.wasm` servidos desde `public/ort/` |
| Almacenamiento | IndexedDB con `idb-keyval` |
| Zip de paquetes | `fflate` |
| Pruebas | Vitest |
| Android | Capacitor (APK de depuración) |
| Hosting | GitHub Pages, Netlify o Cloudflare Pages (HTTPS) |
| Entrenamiento | Python en Colab: PyTorch, `timm`, `datasets`, `onnx`, `onnxruntime` |
| Voz | Audios `.mp3` generados con `training/make_audio.py` o grabados por el equipo |

iPhone nativo exige Mac y cuenta de desarrollador; en el MVP el iPhone se cubre con la PWA.

---

## 4. Módulo SEE (visión)

### 4.1 Modelo
- Arquitectura principal: **EfficientNet-Lite0** (`timm`: `efficientnet_lite0`), entrada 224×224, cuantizada a int8.
- Plan B: **MobileNetV3-Small** sin cuantizar.
- Clases, en este orden: `sana`, `roya`, `minador`, `phoma`, `cercospora`.
- Lo produce `training/jani_train.ipynb` (sección 9). La app lee todo de `model_card.json`.

### 4.2 Contrato `model_card.json`

| Campo | Uso en la app |
|---|---|
| `classes` | Orden de las salidas |
| `input.mean`, `input.std` | Normalización tras dividir entre 255 |
| `input.resize` | Estirar la foto a 224×224, sin recorte |
| `temperature` | `softmax(logits / temperature)` |
| `unsure_rule.min_confidence`, `min_margin` | Regla de duda |
| `recommended_file` | Archivo ONNX que se carga |
| `metrics` | Pantalla "Acerca de" y video |

### 4.3 Función `see`

```ts
type ClassId = 'sana' | 'roya' | 'minador' | 'phoma' | 'cercospora';
type SeeResult =
  | { status: 'ok'; classId: ClassId; confidence: number; probs: number[] }
  | { status: 'unsure'; reason: 'bad_photo' | 'low_confidence' | 'low_margin'; probs?: number[] };

async function see(image: ImageBitmap, card: ModelCard): Promise<SeeResult>
```

Pasos, en orden:
1. **Calidad de foto.** Reducir a 224×224 en escala de grises. Si el brillo medio es menor de 40 o mayor de 230, o la varianza del Laplaciano es menor de 60, devolver `bad_photo`. (Constantes en `engine/quality.ts`; se ajustan probando con el teléfono.)
2. **Preprocesar.** RGB, estirar a 224×224, dividir entre 255, restar `mean`, dividir entre `std`, orden NCHW, `Float32Array`.
3. **Inferir** con la sesión ONNX (se crea una sola vez y se reutiliza).
4. **Calibrar.** `probs = softmax(logits / temperature)`.
5. **Regla de duda.** Si la probabilidad máxima es menor que `min_confidence` → `low_confidence`. Si la diferencia con la segunda es menor que `min_margin` → `low_margin`.
6. Si pasa, devolver `ok`.

Mientras no exista el modelo real (`recommended_file` es `null`), `see` devuelve resultados simulados con la misma forma, elegibles desde un menú oculto de pruebas.

### 4.4 Sesión de fotos

Una revisión son varias hojas, no una. La pantalla de captura pide **5 fotos** (mínimo 1, máximo 10).

```ts
type Session = {
  results: SeeResult[];
  dominant: ClassId | null;   // enfermedad más frecuente entre resultados 'ok' no sanos
  affectedShare: number;      // hojas enfermas / hojas con resultado 'ok'
  unsureShare: number;        // resultados 'unsure' / total
};
```

Reglas:
- Si `unsureShare > 0.5` → salida `CONSULT` (frase `unsure`).
- Si todas las hojas `ok` son sanas → frase `all_healthy`; no se calcula riesgo ni economía.
- En otro caso, continuar a PREDICT con `dominant` y `affectedShare`.

---

## 5. Módulo PREDICT (riesgo)

```ts
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type PredictInput = {
  dominant: ClassId; affectedShare: number; month: number;   // 1 a 12
  heavyRainThisWeek: boolean; treatedLast60Days: boolean;
};
type PredictResult =
  | { level: RiskLevel; points: number; factors: string[] }
  | { level: 'CONSULT'; reason: string };

function predict(input: PredictInput, pack: Pack): PredictResult
```

Sistema de puntos. Los valores salen de `pack.risk_rules.points`:

| Factor | Condición | Puntos (inicial) |
|---|---|---|
| `affected_share_over_30pct` | `affectedShare > 0.30` | 2 |
| `rainy_month` | `month` está en `calendar.rainy_months` | 1 |
| `user_reports_heavy_rain` | respondió "sí" | 1 |
| `no_treatment_last_60_days` | respondió "no" | 1 |

Nivel: `points >= thresholds.high` → HIGH; `>= thresholds.medium` → MEDIUM; si no, LOW. `factors` lista los factores que sumaron, para mostrarlos como íconos.

Las dos preguntas se hacen con botones grandes Sí/No y su audio (`ask_rain`, `ask_treatment`).

**Casos de prueba obligatorios** (paquete Colombia con valores de demostración; lluviosos: 4, 5, 10, 11):

| Caso | Entrada | Puntos | Nivel |
|---|---|---|---|
| P1 | share 0.50, mes 10, llovió, sin tratamiento | 5 | HIGH |
| P2 | share 0.40, mes 7, no llovió, con tratamiento | 2 | MEDIUM |
| P3 | share 0.20, mes 7, no llovió, con tratamiento | 0 | LOW |
| P4 | `rainy_months` ausente y sin valor de demostración | — | CONSULT |

El ingeniero agrícola valida los puntos y umbrales y firma en `risk_rules.validated_by`.

---

## 6. Módulo DECIDE (economía)

Todo se calcula **en kilos de café**; la moneda solo se usa para convertir el costo.

```ts
type Range = [number, number];
type DecideInput = { dominant: ClassId; risk: RiskLevel; areaHa: number };
type DecideResult = {
  suggestion: 'WAIT' | 'TREAT' | 'CONSULT';
  kpis?: {
    expectedLossKg: Range;      // si no actúa
    treatmentCostKg: number;    // costo del tratamiento, en kilos
    breakEvenKg: number;        // kilos que debe salvar para que tratar valga la pena
    netBenefitKg: Range;        // lo que gana si trata
    confidence: 'high' | 'medium' | 'low';
  };
  usedDemoData: boolean;
  phrase: 'act_cheaper' | 'wait_ok' | 'consult';
};

function decide(input: DecideInput, pack: Pack): DecideResult
```

Fórmulas:

```
producción      = rendimiento_kg_ha × areaHa
pérdida_no_act  = producción × loss_share[dominant][risk]            → rango
costo_kg        = (cost_per_ha × areaHa) ÷ price_per_kg
pérdida_tratada = producción × loss_share[dominant][residual_risk]   → rango
beneficio_neto  = [ pérdida_no_act.min − pérdida_tratada.max − costo_kg ,
                    pérdida_no_act.max − pérdida_tratada.min − costo_kg ]
punto_equilibrio = costo_kg
```

Reglas de salida:
- Todo el rango de beneficio neto es positivo → `TREAT`, frase `act_cheaper`, confianza alta.
- Todo el rango es negativo → `WAIT`, frase `wait_ok`, confianza alta.
- El rango cruza cero y el riesgo es LOW → `WAIT`, frase `wait_ok`, confianza media.
- El rango cruza cero y el riesgo es MEDIUM o HIGH → `CONSULT`, frase `consult`, confianza baja.
- Falta cualquier valor → `CONSULT`, sin KPIs.

**De dónde salen los valores.** Función única `resolve(pack, ruta)`:
1. Si el valor real existe y su `source` no es `TODO` → se usa.
2. Si no, y existe en `pack.demo_values` → se usa y `usedDemoData = true`.
3. Si no → `CONSULT`.

Cuando `usedDemoData` es verdadero, la pantalla muestra la etiqueta de la frase `demo_data`. Así la app funciona de punta a punta hoy, y los datos reales entran sin tocar código.

El área (`areaHa`) se pregunta una vez al instalar el paquete (frase `ask_area`, selector de 0,5 a 10 hectáreas, valor inicial 2) y se guarda.

**Casos de prueba obligatorios** (paquete Colombia, demostración: 1.000 kg/ha, 20.000 COP/kg, tratamiento 400.000 COP/ha con riesgo residual bajo; área 2 ha):

| Caso | Riesgo | Pérdida si no actúa | Costo | Beneficio neto | Salida |
|---|---|---|---|---|---|
| D1 | HIGH | [300, 700] kg | 40 kg | [160, 660] kg | TREAT |
| D2 | MEDIUM | [100, 300] kg | 40 kg | [−40, 260] kg | CONSULT |
| D3 | LOW | [0, 100] kg | 40 kg | [−140, 60] kg | WAIT |
| D4 | cualquier, sin precio real ni de demostración | — | — | — | CONSULT |

---

## 7. Módulo VOICE (voz)

### 7.1 Audios
Cada paquete lleva **un archivo por frase**: `audio/<clave>.mp3`, con las mismas claves que `pack.phrases` (38 por paquete).

Cómo se generan:
- **Español:** grabar con voz humana (recomendado) o ejecutar `python training/make_audio.py packs/colombia-andina`.
- **Suajili:** `python training/make_audio.py packs/noor-africa-oriental` (voz sintética MMS de Meta).

El script lee `pack.json`, crea los `.mp3` y anota en el paquete que el audio es sintético. Los audios se generan **antes** de empaquetar; la app nunca sintetiza voz por red.

### 7.2 Reproductor

```ts
async function say(key: string): Promise<void>      // reproduce audio/<key>.mp3 del paquete activo
async function sayAll(keys: string[]): Promise<void> // en secuencia
```

- Al entrar a cada pantalla se reproduce su frase automáticamente. Hay un botón grande para repetir.
- Los números (kilos) no se dicen: se muestran grandes en pantalla con ícono. El audio da el mensaje cualitativo.
- Si falta un archivo: intentar `speechSynthesis` con el idioma del paquete; si no hay voz disponible, mostrar solo el texto. Nunca fallar.
- Los audios se guardan en IndexedDB como `Blob` al instalar el paquete.

---

## 8. Paquetes

### 8.1 Estructura

```
noor-africa-oriental/
  pack.json
  audio/<clave>.mp3
```

`pack.json` contiene: `id`, `version`, `language`, `crop`, `units`, `backup_contact`, `classes`, `calendar`, `climate_normals`, `risk_rules`, `economics`, `demo_values`, `phrases`, `audio`, `tts`. Los dos archivos de `packs/` son la referencia; el esquema de validación se deriva de ellos.

### 8.2 Empaquetado
`scripts/build-packs.mjs` (lo crea Claude Code): comprime cada carpeta de `packs/` en `app/public/packs/<id>.zip` y escribe `app/public/packs/catalog.json` con id, idioma, versión y tamaño. Se ejecuta antes de `vite build`.

### 8.3 Instalación
- **Desde el catálogo:** la pantalla Paquetes lista `catalog.json`. Los zips están precargados por el service worker, así que instalar funciona sin conexión.
- **Desde archivo:** botón "Importar archivo" para un `.zip` recibido por Bluetooth, tarjeta SD o WhatsApp.
- Al instalar: descomprimir con `fflate`, validar, guardar JSON y audios en IndexedDB.
- Cambiar de paquete activo cambia idioma, audios, reglas y valores al instante.

---

## 9. Entrenamiento en Colab

Lo ejecuta una persona del equipo; Claude Code no corre Colab.

1. Subir `training/jani_train.ipynb` a Colab y activar GPU T4.
2. Ejecutar todo con `MODEL_NAME = "efficientnet_lite0"`.
3. Se descarga `jani_model_efficientnet_lite0.zip`. Descomprimir en `app/public/models/arabica-v1/`.
4. Si el notebook recomienda el plan B, repetir con `mobilenetv3_small_100`.

El notebook entrena, calibra la confianza, prueba fuera de distribución, exporta a ONNX, cuantiza, compara y escribe `model_card.json`.

### Datos

| Dataset | País | Tamaño | Uso | Licencia |
|---|---|---|---|---|
| JMuBEN + JMuBEN2 | Kenia | 58.549 imágenes | Entrenamiento | CC BY 4.0 |
| BRACOL | Brasil | 1.747 hojas | Entrenamiento | Por confirmar |
| Uganda (Soroti) | Uganda | 3.312 imágenes | Prueba externa | Por confirmar |
| Perú (Saposoa) | Perú | 1.500 imágenes | Prueba externa | Por confirmar |

Enlaces, citas y límites: `docs/DATOS.md`. La precisión que se reporta es la de **Uganda y Perú**; la validación interna de JMuBEN está inflada por su aumentación.

---

## 10. Pantallas

Una acción por pantalla, botones grandes, íconos, audio automático.

| # | Pantalla | Contenido | Audio |
|---|---|---|---|
| 1 | **Inicio** | Botón "Revisar mi café"; accesos a Pendientes y Paquetes; nombre del paquete activo | `welcome` |
| 2 | **Captura** | Cámara (`<input capture>` o `getUserMedia`), contador 1 de 5, botón "Listo" | `more_photos`, `retake`, `done_photos` |
| 3 | **Diagnóstico** | Miniaturas con el resultado de cada hoja; resultado dominante | `dx_*`, `all_healthy` o `unsure` |
| 4 | **Preguntas** | Dos preguntas Sí/No | `ask_rain`, `ask_treatment` |
| 5 | **Riesgo** | Semáforo BAJO/MEDIO/ALTO e íconos de los factores | `risk_*` |
| 6 | **Decisión** | KPIs en kilos, sugerencia resaltada, tres botones: Esperar, Tratar, Consultar | frase de DECIDE y luego `you_decide` |
| 7 | **Confirmación** | Elección guardada; si eligió Consultar o el riesgo es ALTO, botón para enviar SMS | `saved` |
| 8 | **Pendientes** | Lista de casos guardados con fecha, resultado y elección | — |
| 9 | **Paquetes** | Instalados, catálogo, importar archivo, área de la finca | — |
| 10 | **Acerca de** | Métricas del modelo, fuentes de datos, límites | — |

**Escalamiento.** El botón de SMS abre `sms:<teléfono del paquete>?body=<resumen>` con fecha, resultado, riesgo y elección. Sin fotos. Si no hay teléfono en el paquete, usa el menú de compartir del sistema.

**Caso guardado:**
```ts
type Case = { id: string; date: string; packId: string; session: Session;
  risk?: PredictResult; decision?: DecideResult; choice?: 'WAIT' | 'TREAT' | 'CONSULT'; sent: boolean };
```

---

## 11. Estructura del repositorio

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
      ort/                 ← .wasm de onnxruntime-web
      packs/               ← zips + catalog.json (generados)
  packs/
    noor-africa-oriental/  pack.json  audio/
    colombia-andina/       pack.json  audio/
  scripts/build-packs.mjs
  training/
    jani_train.ipynb
    make_audio.py
    build_climate.py       ← lo crea Claude Code
  docs/DATOS.md
```

---

## 12. Plan de 8 horas

**Pista A: modelo, audios y datos** (Colab). **Pista B: app** (Claude Code).

| Hora | Pista A | Pista B |
|---|---|---|
| 0:00–0:30 | Lanzar `jani_train.ipynb` | Prompts 1 y 2 |
| 0:30–2:00 | Mientras entrena: generar audios en suajili, grabar los de español | Prompts 3, 4 y 5 |
| 2:00–3:30 | Revisar métricas; plan B si hace falta; entregar el zip del modelo | Prompts 6, 7 y 8 |
| 3:30–5:00 | Validar reglas de riesgo; buscar valores reales con fuente | Prompts 9 y 10 |
| 5:00–6:00 | Integración conjunta: modelo real, audios, cambio de paquete en vivo | Prompt 11 |
| 6:00–7:00 | Prueba en modo avión en teléfonos reales; medir tamaño y tiempo | Prompt 12 |
| 7:00–8:00 | Video (2 a 5 minutos), `DATOS.md`, envío | |

**Punto de control a las 3:30.** Si no hay modelo, la app sigue con resultados simulados y la Pista A corre el plan B.

**Si falta tiempo, se recorta en este orden:** BRACOL en el entrenamiento, APK de Capacitor, pantalla Acerca de. **No se recorta:** modo avión, "no estoy segura", los cuatro módulos, el segundo paquete, el video.

---

## 13. Prompts para Claude Code, en orden

Antes de cada uno: "Lee CLAUDE.md y JANI_PLAN.md". Tras cada uno: ejecutar pruebas y hacer commit.

1. **Andamiaje.** "Crea en `app/` una PWA con React, Vite, TypeScript estricto, `vite-plugin-pwa`, `idb-keyval`, `fflate`, `onnxruntime-web` y Vitest. Copia los `.wasm` de onnxruntime-web a `public/ort/`. Crea las diez pantallas vacías con navegación (sección 10)."
2. **Paquetes.** "Implementa `packs/schema.ts` y `packs/loader.ts` según la sección 8, `scripts/build-packs.mjs` y la pantalla Paquetes con instalación desde catálogo y desde archivo, y la pregunta del área."
3. **Valores.** "Implementa `engine/resolve.ts` según la sección 6 con pruebas: valor real, valor de demostración y ausente."
4. **PREDICT.** "Implementa `engine/predict.ts` según la sección 5. Escribe las pruebas P1 a P4."
5. **DECIDE.** "Implementa `engine/decide.ts` según la sección 6. Escribe las pruebas D1 a D4 con los números exactos de la tabla."
6. **Sesión y SEE simulado.** "Implementa `engine/session.ts` (sección 4.4) con pruebas, y `engine/see.ts` en modo simulado. Conecta Captura, Diagnóstico, Preguntas, Riesgo, Decisión y Confirmación de punta a punta."
7. **VOICE.** "Implementa `engine/voice.ts` según la sección 7.2 y el audio automático por pantalla con botón de repetir."
8. **Casos.** "Implementa `store/cases.ts`, la pantalla Pendientes y el SMS de escalamiento (sección 10)."
9. **SEE real.** "Implementa `engine/quality.ts` y la inferencia con onnxruntime-web según la sección 4.3, leyendo todo de `model_card.json`. Sesión única reutilizable. Si `recommended_file` es null, sigue en modo simulado."
10. **Acerca de y etiqueta de demostración.** "Pantalla Acerca de con métricas del `model_card.json` y fuentes. Etiqueta visible cuando `usedDemoData` es verdadero."
11. **Offline.** "Configura la precarga del service worker: app, `.wasm`, modelo, `catalog.json` y zips de paquetes. Dame los pasos para verificar en modo avión y corrige lo que falle."
12. **Android.** "Agrega Capacitor y genera un APK de depuración. Dame los pasos para instalarlo."

---

## 14. Lo que queda para después

Paquete de robusta (dataset RoCoLe); clase de estrés nutricional (CoLeaf solo tiene 6 hojas sanas, hoy no alcanza); precio de referencia al vender; maíz y frijol; riesgo aprendido con los casos registrados; panel de focos para la cooperativa; app nativa de iOS.

---

## 15. Lista de entrega

- [ ] PWA publicada y repositorio.
- [ ] Modelo real integrado, menos de 10 MB.
- [ ] Audios de los dos paquetes.
- [ ] Pruebas P1–P4 y D1–D4 en verde.
- [ ] Demostración en modo avión, con cambio de paquete y un caso de "no estoy segura".
- [ ] Video de 2 a 5 minutos con la frase del problema, el porqué de la IA, el recorrido, el stack y la visión del equipo.
- [ ] `docs/DATOS.md` completo: licencias confirmadas y valores reales o marcados como demostración.

**Para decir en el video:** el modelo se entrenó con hojas de Kenia y Brasil y se probó en Uganda y Perú (dar la cifra); el riesgo es un índice por reglas validado por un ingeniero agrícola; el clima es histórico; el audio en suajili es sintético y está por validar; los valores económicos marcados son de demostración.
