# Informe de QA del MVP

Rama `build/mvp`, código en el commit `c7abc11`. Fecha: 2026-10-03. Máquina: Windows 10, Node 20.19, Chromium de Playwright.
Estados: **VERIFICADO** (hay un comando o prueba que lo demuestra y se leyó su salida), **NO VERIFICADO** (con el porqué)
y **FALLA CONOCIDA**.

## 1. Comandos ejecutados (resultado real)

| Comando (desde `app/`) | Resultado |
|---|---|
| `npm run verify` | **Código de salida 0.** Ejecuta en orden lo que sigue. |
| ↳ `npm run typecheck` (`tsc -b`, estricto) | 0 errores |
| ↳ `npm run lint` (`eslint . --max-warnings 0`) | 0 errores, 0 advertencias |
| ↳ `npm run test` (Vitest) | **12 archivos, 113/113 pruebas OK** |
| ↳ `npm run build` | OK. Bundle JS 334,99 kB (107,81 kB gzip), CSS 3,17 kB; `dist/` total ≈ 14 MB (el `.wasm` de onnxruntime pesa 13,6 MB) |
| ↳ precarga del service worker | 14 entradas, 14 272 KiB |
| ↳ `npm run e2e` (Playwright, Chromium, build de producción) | **19/19 pruebas OK** en 1,4 min |
| `npm run check:assets` | Código 1, como se esperaba: **77 faltantes** (el `.onnx` del modelo real y 38 mp3 × 2 paquetes). El resto de campos de la ficha están OK. |

## 2. Criterios de aceptación de `CLAUDE.md`

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Foto → diagnóstico → riesgo → decisión → voz funciona en **modo avión** tras la primera carga | **VERIFICADO con SEE simulado.** **NO VERIFICADO con el modelo ONNX real.** | e2e `h. OFFLINE`: carga la app, espera a que el SW controle la página y termine la precarga, `context.setOffline(true)`, recarga y hace el recorrido completo, incluida la instalación de un paquete desde el catálogo. Resultado: 0 peticiones fallidas, 0 fuera del origen y todas servidas por el SW (`fromServiceWorker`). El modelo real offline no se puede probar en e2e (DECISIONES #13): la precarga del `.wasm` y de `model_card.json` sí se comprueba. Falta la prueba manual en el teléfono (`PENDIENTES_HUMANOS.md` §4). |
| 2 | SEE, PREDICT, DECIDE y VOICE implementados y conectados, ninguno como maqueta | **VERIFICADO** | SEE real: `engine/see.ts` + `engine/infer.ts`; el modo simulado solo corre si `recommended_file` es `null`. e2e `i` hace inferencia real en el navegador con `tiny_model.onnx` y comprueba la clase exacta. PREDICT se llama desde Preguntas y DECIDE desde Riesgo. VOICE se usa en cada pantalla (`useScreenAudio`, botón 🔊). |
| 3 | Ningún texto visible o hablado se genera en ejecución | **VERIFICADO**, con una excepción aceptada | Todo el texto sale de `t()`/`pack.phrases`; el SMS se arma con frases del paquete (`sms.test.ts`). El panel de errores de importación ya no muestra texto técnico (e2e `f` comprueba que solo se ve ⚠️). Excepción aceptada: Acerca de usa claves de datos como etiquetas (DECISIONES #15), y el menú oculto de pruebas muestra identificadores. |
| 4 | Ningún número agronómico o económico vive en el código | **VERIFICADO** | La auditoría de QA hizo grep de los literales numéricos en `engine/`, `screens/`, `store/` y `flow/`. Todos los valores económicos y de riesgo pasan por `resolve`. Las únicas constantes son las fijadas por la spec (DECISIONES #5). |
| 5 | `resolve`: real con fuente → demo + `usedDemoData` → `CONSULT`; nunca inventa | **VERIFICADO** | `resolve.test.ts`: real con fuente válida; real no nulo con fuente `TODO` (usa demo); fuente vacía o nula; ancestro más cercano manda; ausente → `found:false`. P4 y D4 → CONSULT. |
| 6 | Con `usedDemoData` se ve la etiqueta de demostración | **VERIFICADO** | e2e `e`: la etiqueta con el texto `demo_data` del paquete se ve en Riesgo y en Decisión. |
| 7 | Clases, normalización, temperatura y umbrales salen de `model_card.json` | **VERIFICADO** | `infer.test.ts` (normalización por canal, temperatura, regla de duda); la ficha se valida al cargarla (sin valores por defecto inventados). e2e `j1`: una ficha inválida muestra ⚠️ y permite reintentar. |
| 8 | La app sugiere; la persona elige; la elección se registra | **VERIFICADO** | e2e `a`/`b`: el caso aparece en Pendientes con la elección. e2e `e`: elegir una opción **no sugerida** se guarda tal cual. e2e `k2`/`k3`: si guardar falla, la elección no se pierde y se puede reintentar. |
| 9 | Los `.wasm` de onnxruntime-web en `public/ort/`, sin CDN | **VERIFICADO** | `scripts/copy-ort.mjs` (postinstall). e2e `i` comprueba que `ort/*.wasm` y `ort/*.mjs` se cargan del mismo origen y que no hay peticiones a otros orígenes. No hay URLs `http(s)://` externas en `src/`, `index.html` ni `vite.config.ts`. |
| 10 | Las fotos no salen del teléfono; el SMS solo lleva texto | **VERIFICADO** | Las fotos solo existen como blob URLs en memoria; el `Case` guardado no las contiene. `sms.test.ts` comprueba que el cuerpo no tiene `blob:` ni `data:`. e2e `h`: ninguna petición fuera del origen. e2e `m1`/`m2`: SMS y menú de compartir con texto. |
| 11 | P1–P4 y D1–D4 pasan con los números exactos | **VERIFICADO** | `predict.test.ts`: P1 5/HIGH, P2 2/MEDIUM, P3 0/LOW, P4 CONSULT. `decide.test.ts`: D1 [300,700]/40/[160,660] TREAT; D2 [100,300]/40/[−40,260] CONSULT; D3 [0,100]/40/[−140,60] WAIT; D4 CONSULT sin KPIs. Coinciden con las tablas de `JANI_PLAN.md`. |

## 3. Pruebas unitarias (Vitest, 113/113)

`resolve`, `predict` (P1–P4 y límite de 0,30), `decide` (D1–D4, suajili, área inválida), `session`, `quality`
(negra, blanca, gris plano, tablero), `see` (probabilidades simuladas, cola), `modelCard` (softmax estable, regla de
duda, `NaN` tolerado, validación), `packs` (paquete válido; inválido; zip corrupto, sin `pack.json` o con JSON roto;
filtrado de audios), `voice` (falta audio, `play` rechazado, `voiceschanged`, sin voces, tiempos límite, stop),
`sms` (resumen, codificación, sin teléfono), `infer` (preproceso, inferencia ONNX real en node con el modelo de prueba,
sesión reutilizada, longitud de logits) y `nav`.

## 4. Pruebas e2e (Playwright, 19/19)

| Prueba | Qué demuestra | Estado |
|---|---|---|
| a | Instalar paquete → área → 5 fotos → diagnóstico → preguntas → riesgo → decisión → elegir → confirmación → Pendientes | VERIFICADO |
| b | Mismo recorrido con el segundo paquete; cambio en caliente: `html[lang]`, frase de inicio, nombre del paquete y KPIs cambian | VERIFICADO |
| c | Más de la mitad de las fotos dudosas → frase `unsure` y sugerencia CONSULT | VERIFICADO |
| d | Todas sanas → `all_healthy`, sin riesgo ni KPIs | VERIFICADO |
| e | Etiqueta de demostración en Riesgo y Decisión; elegir una opción no sugerida | VERIFICADO |
| f | Importar `.zip` válido; vacío y corrupto muestran ⚠️ con el código correcto en `data-errors`, sin caerse | VERIFICADO |
| g | Sin audios: ningún `pageerror`, frases visibles, botón de repetir funciona | VERIFICADO |
| h | Modo avión: recorrido completo sin red | VERIFICADO (SEE simulado) |
| i | Inferencia ONNX real en navegador con el modelo de prueba (servido con `page.route`, nunca copiado a `public/models`) | VERIFICADO (con conexión) |
| j1, j2 | Ficha inválida → ⚠️ y reintento; fallo de inferencia → foto dudosa, sin bucle de "repite la foto" | VERIFICADO |
| k1–k3 | IndexedDB que falla: la app no queda en blanco y la elección no se pierde | VERIFICADO |
| l | Paquete instalado con otra versión en el catálogo → 🔄 y reinstalación real en IndexedDB | VERIFICADO |
| m1, m2 | Escalamiento sin teléfono: sin menú de compartir marca enviado; con menú, cancelar no marca enviado | VERIFICADO |
| n | Paquete importado que rompe una pantalla → ⚠️ y ⌂, sin pantalla en blanco | VERIFICADO |
| o | Paquete en inglés: `html[lang]=en`, todo el texto en inglés, recorrido completo y vuelta a español en caliente | VERIFICADO |

## 5. Service worker (precarga)

Leído en `dist/sw.js` tras el build: `index.html`, JS/CSS, `ort/ort-wasm-simd-threaded.wasm`,
`ort/ort-wasm-simd-threaded.mjs`, `models/arabica-v1/model_card.json`, `packs/catalog.json`,
`packs/colombia-andina.zip`, `packs/noor-africa-oriental.zip`, ícono y manifiesto. El patrón incluye `*.onnx`:
el modelo real entra en la precarga al copiarlo y recompilar. No se precarga una segunda copia del `.wasm`.

## 6. NO VERIFICADO

- **Modelo ONNX real en modo avión** (criterio 1 con el modelo real): sin modelo real todavía y no se puede probar en e2e
  (DECISIONES #13). Prueba manual: `PENDIENTES_HUMANOS.md` §4.
- **Peso del modelo real (< 10 MB) y tiempo de inferencia en un teléfono**: sin modelo ni teléfono. `check:assets` exige < 10 MB.
- **Audio real**: no hay mp3. Solo se probó el respaldo (voz del sistema o solo texto) y que nada falla.
- **Voz del sistema en suajili en teléfonos reales**: depende del teléfono.
- **iPhone/Safari**: solo se probó Chromium.
- **APK de Android**: el proyecto de Capacitor quedó listo (`app/android`, Capacitor 7), pero no hay Android SDK ni Java
  en esta máquina; no se compiló ni se instaló. Pasos: `PENDIENTES_HUMANOS.md` §5.
- **Publicación de la PWA**: no se publicó (fuera del alcance de este trabajo).

## 7. FALLAS CONOCIDAS / limitaciones menores (no bloquean)

- `check:assets` reemplaza `NaN` sin distinguir si va dentro de un texto (solo afecta al verificador, no a la app).
- Si guardar "enviado" falla, la app igual abre el SMS (solo se avisa en la consola).
- La validación de la ficha no exige exactamente 5 clases distintas; con 1 o 2 clases el modo simulado fallaría (el modo real no se ve afectado).
- El botón 🔄 de actualizar aparece con cualquier versión distinta, también si la del catálogo es más vieja.
- Los KPIs se formatean según el idioma, pero ninguna prueba e2e comprueba el formato.
- `training/build_climate.py` no se creó (DECISIONES #11).

## 8. Proceso de revisión

Cada tarea (1–12) tuvo un implementador y un revisor distinto (cumplimiento de la spec y luego calidad); 4 tareas
necesitaron rondas de corrección. Al final, un auditor revisó la rama completa contra los 11 criterios: encontró
5 problemas importantes (atascos sin aviso por fallos de la ficha, de la inferencia o de IndexedDB; paquetes que no se actualizaban;
texto técnico visible; SMS sin salida). Se corrigieron en `10e1ff1..c7abc11` y una revisión de esas correcciones las dio todas por resueltas.
