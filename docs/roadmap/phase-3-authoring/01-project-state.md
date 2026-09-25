# Task 3.1 — Project state and editor workflow

**Status:** Accepted 2026-09-25. **Depends on:** Phase 2.

**Outcome:** A persistent project binds an asset version to editable appearance, scene, interaction, and later animation/export settings.

**Work:** Define project/step records, schema migrations, validation, owner-scoped load/save, autosave state, undo/redo semantics, and migration of older saved configuration. Add a step navigator with completion, warning, processing, and unsaved indicators. A database failure must remain visible and retryable; never show a false “saved” state.

**Acceptance:**

- [x] Save/reopen preserves typed configuration across app restart.
- [x] Undo/redo and step navigation do not discard later edits unexpectedly.
- [x] Offline/Neon failure shows unsaved state and retry path.
- [x] Cross-owner reads and writes are denied.

**Likely touchpoints:** Drizzle project tables, application service, protected studio routes, editor shell. **Evidence to record:** migration and browser tests.

## Implementation evidence — 2026-09-25

- Added project, immutable revision, and workflow-step Drizzle tables plus migration `0007_nebulous_silhouette`. New projects resolve the asset owner and current retained version transactionally; project state is owner-scoped on load and mutation. The original selected asset version and its source hash remain unchanged.
- Added typed snapshot parsing with legacy default migration, strict appearance/scene/interactions validation, allowlisted interaction actions, and rejection of unsupported future schema versions. Animation clips/timelines remain opaque extension records pending Phase 4 schema work; they are not executable in this increment.
- Added project create/load/save/undo/redo/step API handlers. Stale revision writes return HTTP 409; invalid requests return 400; storage failures return a retryable 503 and do not claim a save succeeded.
- PGlite/Drizzle verification passed: project rows and typed snapshots persist; branch saves retain revisions with a monotonic write revision; undo/redo move the cursor; cross-owner access is denied; write failure rolls back transaction state; step order is deterministic; retained asset version/hash is unchanged.
- Verification: project slice **5 files, 15 tests passed**; full `pnpm test` **38 files, 208 passed, 1 existing optional private-fixture test skipped**; `pnpm lint`, `pnpm typecheck`, `pnpm build` (Next.js 16.3.5), and `git diff --check` passed. `pnpm db:generate` produced migration 0007 and the isolated PGlite suite applied all migrations.
- These were the gaps at the start of the 2026-09-25 editor work; the browser gate below closes them using an isolated PostgreSQL database and a real Next.js process restart.
- Graph refresh: the Windows launcher still points to a missing script; running the recorded interpreter with `PYTHONHASHSEED=0 python -m graphify update .` refreshed the code graph to **966 nodes and 2,226 edges**. Semantic documentation extraction was not run.

## Editor and acceptance evidence — 2026-09-25

- The asset report now lists owner-scoped projects and creates a project against the selected retained version. The protected `/projects/[projectId]` route reloads the project and its exact retained model version; a different owner receives 404. The editor shows persisted step status, explicit save, unsaved and retry states, and local/server undo and redo.
- Focused tests cover project listing and first-save undo with branching, editor failed-save/retry and step navigation, local undo/redo, and launcher create/open behavior. The full suite passed **42 files, 219 tests passed, 1 optional private-fixture skip**; `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed before the browser gate.
- `pnpm exec tsx scripts/with-isolated-postgres.ts exec tsx scripts/restart-import-gate.ts` created a separate PostgreSQL database, applied all eight migrations, and removed the database afterward. The gate passed `PROJECT_RESTART_GATE_PASS`: a forced `project_revisions` insert failure returned an unsaved/retry UI while retaining the changed color; retry saved; the active Scene step and color `#123456` survived a real Next.js process restart; undo restored `#111417` and redo restored `#123456`; GET/PATCH and the editor page denied the original session after ownership transferred to a second throwaway user; original source SHA-256 remained `cc8470d738c5991504a129d2231056a1a7189e00f429f9749b1f2e0414e9d792`.
- The same gate passed the earlier import/optimization restart checks. Its optimization check now verifies both retained version IDs independent of list ordering; the selected derived ID remained correct.
