# Progreso del MVP

Rama `build/mvp`. Detalle de cada tarea en `docs/PLAN_MVP.md`. Decisiones en `docs/DECISIONES.md`.
Cada tarea: implementa un subagente, revisa otro (cumplimiento de spec y calidad), commit por tarea.

## Preparación
- [x] Prompt 1 revisado: tsc, pruebas y build en verde.
- [x] Repositorio git, rama `build/mvp`, `.gitignore`, `.gitattributes`.
- [x] ESLint (`npm run lint`), TypeScript fijado en 6.0.
- [x] Plan de tareas (`docs/PLAN_MVP.md`).

## Tareas
- [x] Task 1 — Esquema, validación y carga de paquetes; `scripts/build-packs.mjs` (prompt 2A)
- [x] Task 2 — Paquete activo y pantalla Paquetes, pregunta del área (prompt 2B)
- [x] Task 3 — `resolve`, PREDICT (P1–P4), DECIDE (D1–D4) (prompts 3, 4, 5)
- [x] Task 4 — Sesión, calidad de foto, SEE simulado (prompt 6A, calidad del 9)
- [x] Task 5 — Recorrido de punta a punta en pantallas, etiqueta demo (prompt 6B, 10)
- [x] Task 6 — VOICE (prompt 7)
- [x] Task 7 — Casos, Pendientes, SMS (prompt 8)
- [x] Task 8 — SEE real con onnxruntime-web y modelo de prueba (prompt 9)
- [x] Task 9 — Acerca de (prompt 10)
- [x] Task 10 — Offline, `check:assets`, `verify` (prompt 11)
- [x] Task 11 — Pruebas e2e con Playwright (a–h)
- [x] Task 12 — Capacitor / Android (prompt 12)

## Cierre
- [x] Revisión final de QA contra los 11 criterios (y corrección de sus hallazgos B1–B5, M1–M7)
- [x] `docs/QA_REPORT.md`, `docs/PENDIENTES_HUMANOS.md`, README actualizado
- [x] `npm run verify` completo en verde (112 unitarias, 18 e2e)

## Bloqueos
(ninguno por ahora)

## Estado final
Todo lo de esta lista está hecho y en la rama `build/mvp` (sin push ni merge). Lo que queda para personas está en
`docs/PENDIENTES_HUMANOS.md`; lo no verificado, en `docs/QA_REPORT.md` §6.
