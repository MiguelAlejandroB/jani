# Decisiones tomadas sin consultar

Cada una: qué se decidió, por qué y qué cuesta si está mal.

1. **Commits en la rama `build/mvp`.** El encargo pide un commit por tarea; la regla global de "no commit sin revisión" se respeta
   trabajando en una rama aparte y sin push. Si está mal: basta con no fusionar la rama.
2. **TypeScript 6.0 en lugar de 7.0.** typescript-eslint aún no admite TS 7 (exige `<6.1`). Si está mal: subir la versión cuando
   typescript-eslint lo soporte; el código no usa nada exclusivo de TS 7.
3. **Solo el backend WASM básico de onnxruntime-web** (`ort-wasm-simd-threaded.wasm` + `.mjs`, 14 MB). Las variantes jsep/jspi/asyncify
   (WebGPU) suman ~70 MB y no se usan. Si está mal: copiar la variante en `scripts/copy-ort.mjs`.
4. **Pantallas sin frase en el paquete usan solo íconos** ("Revisar mi café", "Acerca de", contador de fotos `n / 5`). El criterio 3
   prohíbe texto en el código y los paquetes no se pueden editar. Si está mal: agregar claves a los `pack.json` y usarlas.
5. **Constantes fijadas por la spec, no por el paquete:** umbrales de calidad de foto (§4.3), `unsureShare > 0.5` (§4.4),
   `affectedShare > 0.30` (está en el nombre del factor `affected_share_over_30pct`, §5) y el rango de área 0,5–10 ha (§6).
   Si está mal: moverlas al paquete con su ruta en `resolve`.
6. **`resolve` y la fuente que gobierna:** un valor real se usa si no es nulo y la `source` más cercana (en el nodo o un ancestro) no
   empieza por `TODO`. Si en la cadena no hay `source` (p. ej. `risk_rules.points`), el valor del paquete se toma como real: la
   validación de esas reglas se expresa en `risk_rules.validated_by`, que se muestra en Acerca de. Un tratamiento con cualquier campo
   numérico nulo se considera ausente y se usa el de demostración completo (incluido su `residual_risk`), que es lo que producen las
   tablas D1–D3. Si está mal: D1–D3 cambiarían al usar el `residual_risk` real (`medium`).
7. **`PredictResult` lleva también `usedDemoData`** para mostrar la etiqueta en la pantalla de riesgo cuando los meses lluviosos son
   de demostración. Campo adicional, compatible con la spec.
8. **Foto mala (`bad_photo`) no cuenta:** se pide repetirla (`retake`) y no entra en la sesión. Las dudas por confianza o margen sí
   cuentan para `unsureShare`. Si está mal: contar también `bad_photo` en `Session.results`.
9. **"No estoy segura" y riesgo CONSULT llevan a la pantalla de decisión con sugerencia CONSULT y sin KPIs**, para que la persona igual
   elija y quede registrado (criterio 8).
10. **KPIs redondeados a 2 decimales** para quitar ruido de coma flotante; la clasificación usa los valores sin redondear.
11. **`training/build_climate.py` no se crea**: aparece en la estructura (§11) pero ningún prompt lo pide y necesita red (NASA POWER).
    `climate_normals` no lo usa ningún módulo del MVP.
12. **Simulación: `low_confidence` y `low_margin` se devuelven directamente como dudosas.** Con las probabilidades
    previstas en el plan (0,45/0,40), `low_margin` caía siempre en `low_confidence` con la ficha de ejemplo. Si está mal:
    el modo simulado no ejercita la regla de margen con la ficha real; el modo real sí la aplica siempre.
13. **El modo avión con el modelo ONNX real no se prueba en e2e.** `page.route` no intercepta lo que sirve el service worker
    y el modelo de prueba no puede ir a `public/models`. La inferencia real se prueba en navegador con conexión (e2e `i`) y
    el modo avión con SEE simulado (e2e `h`). Si está mal: queda la prueba manual en el teléfono (`PENDIENTES_HUMANOS.md` §4).
14. **Capacitor 7** (no 8): la CLI 8 exige Node 22 y esta máquina tiene Node 20.19. Core, CLI y Android alineados en 7.x.
15. **Acerca de muestra rutas técnicas como etiquetas** (`risk_rules.validated_by`, `audio.status`…). Son claves de los
    datos, no frases; es una pantalla técnica para el jurado. Si está mal: agregar claves de frase al paquete.
16. **Errores al importar un paquete:** se muestra solo ⚠️; el detalle técnico va en `data-errors` y en la consola,
    para no mostrar texto generado en ejecución (criterio 3).
17. **Fallo de inferencia ≠ foto mala:** si el modelo falla, la foto cuenta como dudosa (lleva a "No estoy segura" si son
    mayoría) en lugar de pedir repetirla en bucle. Si la imagen no se puede leer, sí se pide repetirla.
18. **La ficha del modelo se valida al cargarla y tolera `NaN`** (el notebook puede escribirlo en métricas). Ficha
    inválida → ⚠️ con botón de reintentar, nunca valores por defecto inventados.
19. **Actualizar un paquete instalado:** el catálogo muestra 🔄 cuando su `version` difiere de la instalada.
20. **SMS sin teléfono:** si el paquete no trae teléfono y no hay menú de compartir (WebView de Android), se abre
    `sms:?body=…` para que la persona elija el contacto. El caso se marca enviado solo si el envío se inició bien.
21. **Revisión de calidad promovida:** se exigió probar `resolve` con un valor real no nulo y fuente `TODO` (criterio 5),
    aunque el revisor lo marcó como menor.
22. **Paquete `english-demo` (inglés), pedido por el equipo.** Copia de las reglas y de los valores de demostración del
    paquete de África Oriental (USD, sintéticos y marcados como tales), con las 38 frases traducidas y voz MMS
    `facebook/mms-tts-eng` para `make_audio.py`. No representa una región real. Si está mal: ajustar `units`,
    `backup_contact` y los valores reales del país al que apunte.
23. **Notebook: cuantización int8 por canal, evaluada sin optimizaciones de grafo.** Medido localmente: onnxruntime-web
    coincide con onnxruntime de Python *sin* optimizar (diferencia < 0,5 en logits) y difiere hasta 5,6 *con* optimizaciones.
    Por eso el notebook mide la precisión del ONNX de la misma forma que correrá en el teléfono.
24. **Umbrales de captura recalibrados con fotos reales** (reporte del usuario: "todas piden repetir"). Medido con 140
    fotos de campo (Uganda y Perú) y 150 que no son hojas (Food-101): nitidez mínima 60 → 20 (acepta 86 % en vez de 64 %
    y rechaza 97 % de las desenfocadas); fracción mínima de hoja del segmentador 0,25 → 0,10 (acepta 89 % en vez de 48 %
    y sigue rechazando 97 % de las no-hojas por el color). Regresión: `app/src/tests/campo.test.ts`.
25. **Modelos de RIESGO y DECISIÓN según el manual**, en modo informativo por la regla de parada §7 y por los parámetros
    *prior*. Detalle, supuestos añadidos (A5': clima como anomalía; 1.000 partículas; unidad en kilos) y hallazgos
    (el supuesto A4 se viola en los datos de campo) en `docs/MODELOS_RIESGO_DECISION.md`.
26. **Catálogo de acciones de demostración** (poda, sistémico, cobre, biológico, minador) con eficacias Beta de criterio
    experto, ordenadas como sugiere el dataset del USDA. El catálogo real queda en `economics.catalog` con fuente `TODO`
    para que lo firme extensión técnica, sin tocar código.
