# Jani — instrucciones para Claude Code

Lee primero `JANI_PLAN.md` completo. Este archivo resume las reglas que no se negocian.

## Qué construimos
Una PWA (React + Vite + TypeScript) que funciona sin conexión y ayuda a un caficultor a decidir, ante una señal en la hoja: tratar, esperar o consultar a una persona. Motor único + paquetes locales instalables (`packs/`).

## Criterios de aceptación
1. La ruta foto → diagnóstico → riesgo → decisión → voz funciona en **modo avión** tras la primera carga.
2. Los cuatro módulos (SEE, PREDICT, DECIDE, VOICE) quedan implementados y conectados. Ninguno se deja como maqueta.
3. Ningún texto visible o hablado se genera en ejecución: todo sale del `pack.json` activo.
4. Ningún número agronómico o económico vive en el código: todo sale del paquete, a través de `engine/resolve.ts`.
5. `resolve` usa el valor real si tiene fuente; si no, el de `demo_values` y marca `usedDemoData`; si no hay ninguno, la función devuelve `CONSULT`. Nunca inventa un valor por defecto.
6. Cuando `usedDemoData` es verdadero, la pantalla muestra la etiqueta de demostración.
7. Clases, normalización, temperatura y umbrales se leen de `app/public/models/arabica-v1/model_card.json`.
8. La app sugiere; la persona elige. La elección se registra.
9. Los `.wasm` de `onnxruntime-web` van en `public/ort/`, no desde un CDN.
10. Las fotos no salen del teléfono. El SMS de escalamiento lleva solo texto.
11. Las pruebas P1–P4 y D1–D4 de `JANI_PLAN.md` pasan con los números exactos de las tablas.

## Reglas de código
- TypeScript estricto. `engine/predict.ts` y `engine/decide.ts` son funciones puras con pruebas en Vitest.
- Interfaz para baja alfabetización digital: botones grandes, íconos, una acción por pantalla, audio automático.
- Commits pequeños, uno por paso del plan.
- No toques `training/jani_train.ipynb` salvo que te lo pidan: lo ejecuta una persona en Colab.

## Orden de trabajo
Sigue la sección 13 de `JANI_PLAN.md`, un prompt a la vez. No esperes al modelo real: mientras `recommended_file` sea `null`, `see` trabaja en modo simulado.

## Estado de los insumos
- `packs/*/pack.json`: estructura completa, 38 frases y `demo_values` para que DECIDE funcione hoy. Los valores reales (`calendar`, `economics`) están en `null` con `source: "TODO"`; el equipo los llena sin tocar código.
- `packs/*/audio/`: lo genera el equipo con `training/make_audio.py` o grabando. Si falta un audio, `voice.ts` no debe fallar (sección 7.2).
- `app/public/models/arabica-v1/`: hoy tiene una ficha de ejemplo; el equipo la reemplaza con la salida de `training/jani_train.ipynb`.
