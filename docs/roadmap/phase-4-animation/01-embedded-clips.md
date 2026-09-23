# Task 4.1 — Embedded clip management

**Status:** [ ] Planned. **Depends on:** Phase 3.

**Outcome:** Embedded animations are discoverable and individually previewable; project-level names, enablement, duplicates, trim ranges, speed, and loop settings are editable.

**Work:** Treat imported clip data as immutable; store edit metadata in the project. Expose duration, track targets, skeleton/morph usage, and warnings. Add play/pause/scrub with deterministic reset when switching clips and a clear distinction between source clips and project copies.

**Acceptance:**

- [ ] A fixture with multiple clips lists correct durations and targets.
- [ ] Rename, duplicate, trim, retime, loop, disable, and remove affect project state only.
- [ ] Preview and saved settings survive reload without altering source hashes.
- [ ] Missing targets show warnings rather than crashing playback.

**Likely touchpoints:** `gltf-analyzer.ts`, viewer animation controls, project schema/config. **Evidence to record:** clip fixture and playback tests.
