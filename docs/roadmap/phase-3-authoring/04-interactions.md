# Task 3.4 — Structured interactions

**Status:** Accepted 2026-09-25. **Depends on:** Tasks 3.1–3.3.

**Outcome:** The owner can add click/hover responses, hotspots, annotations, camera targets, and named actions using structured trigger/action records.

**Work:** Define an allowlisted, serializable event/action schema and a preview mode. Validate referenced scene nodes and camera targets. Separate editing controls from viewer behavior so selecting a part does not accidentally fire its action. Do not execute arbitrary user-provided JavaScript in the initial release.

**Acceptance:**

- [x] Click/hover, hotspot, annotation, and camera-target cases work in preview and after reload.
- [x] Missing targets become visible warnings, not runtime crashes.
- [x] Unsafe script payloads are rejected and never evaluated.
- [x] Browser tests cover save, preview, undo, and full quality-suite regression.

**Evidence to record:** supported action list, test results, documentation and commit.

## Acceptance evidence — 2026-09-25

- The editor offers structured click, hover, and hotspot triggers and toggle-visibility, annotation, and camera-focus actions. The strict schema also recognizes `play-clip`; playback is deferred to Phase 4 and an unavailable clip gives a safe preview message. No script action is implemented. Editing mode selects parts; preview mode invokes actions and remounts the viewer to clear ephemeral visibility/focus state.
- In the isolated browser gate, saved hotspot annotations and camera targets worked after reload; direct viewport click and hover fired their saved annotations; an intentionally missing target rendered a warning; undo removed it. An executable `script` field was rejected with HTTP 400. Focused tests cover trigger matching, target warnings, and structured UI creation.
- Final Phase 3 suite after code changes: `pnpm test` **48 files, 230 passed, 1 optional private-fixture skip**; `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. The isolated restart gate created/migrated/removed its own database and passed import, optimization, project, appearance, scene, interaction, tiny/large framing, and owner-isolation checks.
