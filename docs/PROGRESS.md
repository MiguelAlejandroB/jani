> Historical planning document. `README.md` describes the current state of the project.

# MVP Progress

Branch `build/mvp`. Details of each task are in `docs/MVP_PLAN.md`. Decisions are in `docs/DECISIONS.md`.
For each task: one subagent implements, another reviews (spec compliance and quality), one commit per task.

## Preparation
- [x] Prompt 1 reviewed: tsc, tests and build all green.
- [x] Git repository, branch `build/mvp`, `.gitignore`, `.gitattributes`.
- [x] ESLint (`npm run lint`), TypeScript pinned to 6.0.
- [x] Task plan (`docs/MVP_PLAN.md`).

## Tasks
- [x] Task 1 — Pack schema, validation and loading; `scripts/build-packs.mjs` (prompt 2A)
- [x] Task 2 — Active pack and Packs screen, area question (prompt 2B)
- [x] Task 3 — `resolve`, PREDICT (P1–P4), DECIDE (D1–D4) (prompts 3, 4, 5)
- [x] Task 4 — Session, photo quality, simulated SEE (prompt 6A, quality from 9)
- [x] Task 5 — End-to-end flow across screens, demo label (prompt 6B, 10)
- [x] Task 6 — VOICE (prompt 7)
- [x] Task 7 — Cases, Pending, SMS (prompt 8)
- [x] Task 8 — Real SEE with onnxruntime-web and a test model (prompt 9)
- [x] Task 9 — About (prompt 10)
- [x] Task 10 — Offline, `check:assets`, `verify` (prompt 11)
- [x] Task 11 — Playwright e2e tests (a–h)
- [x] Task 12 — Capacitor / Android (prompt 12)

## Wrap-up
- [x] Final QA review against the 11 criteria (and fixes for its findings B1–B5, M1–M7)
- [x] `docs/QA_REPORT.md`, `docs/HUMAN_TODO.md`, README updated
- [x] Full `npm run verify` green (112 unit, 18 e2e)

## Blockers
(none for now)

## Final status
Everything on this list is done and lives on the `build/mvp` branch (no push or merge). What remains for people is in
`docs/HUMAN_TODO.md`; what was not verified is in `docs/QA_REPORT.md` §6.
