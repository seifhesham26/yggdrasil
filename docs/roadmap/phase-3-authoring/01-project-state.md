# Task 3.1 — Project state and editor workflow

**Status:** [ ] Planned. **Depends on:** Phase 2.

**Outcome:** A persistent project binds an asset version to editable appearance, scene, interaction, and later animation/export settings.

**Work:** Define project/step records, schema migrations, validation, owner-scoped load/save, autosave state, undo/redo semantics, and migration of older saved configuration. Add a step navigator with completion, warning, processing, and unsaved indicators. A database failure must remain visible and retryable; never show a false “saved” state.

**Acceptance:**

- [ ] Save/reopen preserves typed configuration across app restart.
- [ ] Undo/redo and step navigation do not discard later edits unexpectedly.
- [ ] Offline/Neon failure shows unsaved state and retry path.
- [ ] Cross-owner reads and writes are denied.

**Likely touchpoints:** Drizzle project tables, application service, protected studio routes, editor shell. **Evidence to record:** migration and browser tests.
