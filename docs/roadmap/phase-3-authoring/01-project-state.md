# Task 3.1 — Project state and editor workflow

**Status:** In progress. **Depends on:** Phase 2.

**Outcome:** A persistent project binds an asset version to editable appearance, scene, interaction, and later animation/export settings.

**Work:** Define project/step records, schema migrations, validation, owner-scoped load/save, autosave state, undo/redo semantics, and migration of older saved configuration. Add a step navigator with completion, warning, processing, and unsaved indicators. A database failure must remain visible and retryable; never show a false “saved” state.

**Acceptance:**

- [ ] Save/reopen preserves typed configuration across app restart.
- [ ] Undo/redo and step navigation do not discard later edits unexpectedly.
- [ ] Offline/Neon failure shows unsaved state and retry path.
- [ ] Cross-owner reads and writes are denied.

**Likely touchpoints:** Drizzle project tables, application service, protected studio routes, editor shell. **Evidence to record:** migration and browser tests.

## Implementation evidence — 2026-09-25

- Added project, immutable revision, and workflow-step Drizzle tables plus migration `0007_nebulous_silhouette`. New projects resolve the asset owner and current retained version transactionally; project state is owner-scoped on load and mutation. The original selected asset version and its source hash remain unchanged.
- Added typed snapshot parsing with legacy default migration, strict appearance/scene/interactions validation, allowlisted interaction actions, and rejection of unsupported future schema versions. Animation clips/timelines remain opaque extension records pending Phase 4 schema work; they are not executable in this increment.
- Added project create/load/save/undo/redo/step API handlers. Stale revision writes return HTTP 409; invalid requests return 400; storage failures return a retryable 503 and do not claim a save succeeded.
- PGlite/Drizzle verification passed: project rows and typed snapshots persist; branch saves retain revisions with a monotonic write revision; undo/redo move the cursor; cross-owner access is denied; write failure rolls back transaction state; step order is deterministic; retained asset version/hash is unchanged.
- Verification: project slice **5 files, 15 tests passed**; full `pnpm test` **38 files, 208 passed, 1 existing optional private-fixture test skipped**; `pnpm lint`, `pnpm typecheck`, `pnpm build` (Next.js 16.3.5), and `git diff --check` passed. `pnpm db:generate` produced migration 0007 and the isolated PGlite suite applied all migrations.
- Remaining acceptance gaps: no project editor UI or step navigator yet; no browser save/reopen across app restart; no client unsaved/retry indicator or offline path; no real Neon restart/browser verification. Do not mark Task 3.1 or Phase 3 accepted until those are tested.
- Graph refresh: the Windows launcher still points to a missing script; running the recorded interpreter with `PYTHONHASHSEED=0 python -m graphify update .` refreshed the code graph to **966 nodes and 2,226 edges**. Semantic documentation extraction was not run.
