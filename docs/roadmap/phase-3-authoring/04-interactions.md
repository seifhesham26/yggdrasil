# Task 3.4 — Structured interactions

**Status:** [ ] Planned. **Depends on:** Tasks 3.1–3.3.

**Outcome:** The owner can add click/hover responses, hotspots, annotations, camera targets, and named actions using structured trigger/action records.

**Work:** Define an allowlisted, serializable event/action schema and a preview mode. Validate referenced scene nodes and camera targets. Separate editing controls from viewer behavior so selecting a part does not accidentally fire its action. Do not execute arbitrary user-provided JavaScript in the initial release.

**Acceptance:**

- [ ] Click/hover, hotspot, annotation, and camera-target cases work in preview and after reload.
- [ ] Missing targets become visible warnings, not runtime crashes.
- [ ] Unsafe script payloads are rejected and never evaluated.
- [ ] Browser tests cover save, preview, undo, and full quality-suite regression.

**Evidence to record:** supported action list, test results, documentation and commit.
