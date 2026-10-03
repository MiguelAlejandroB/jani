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
