# Task 4.1 — Embedded clip management

**Status:** [x] Accepted 2026-09-25. **Depends on:** Phase 3.

**Outcome:** Embedded animations are discoverable and individually previewable; project-level names, enablement, duplicates, trim ranges, speed, and loop settings are editable.

**Work:** Treat imported clip data as immutable; store edit metadata in the project. Expose duration, track targets, skeleton/morph usage, and warnings. Add play/pause/scrub with deterministic reset when switching clips and a clear distinction between source clips and project copies.

**Acceptance:**

- [x] A fixture with multiple clips lists correct durations and targets.
- [x] Rename, duplicate, trim, retime, loop, disable, and remove affect project state only.
- [x] Preview and saved settings survive reload without altering source hashes.
- [x] Missing targets show warnings rather than crashing playback.

**Likely touchpoints:** `gltf-analyzer.ts`, viewer animation controls, project schema/config. **Evidence to record:** clip fixture and playback tests.

## Acceptance evidence — 2026-09-25

- The generated two-clip glTF fixture has intentionally nonalphabetic source order. The analyzer test confirmed source indices 0/1, names `Z Rise`/`A Scale`, durations 1/2 seconds, and translation/scale targets on `Animated Triangle`. Runtime inventory tests cover ordered targets, skeleton and morph flags, and missing targets. The UI test lists multiple clips with durations and a missing-target warning.
- Project copies are typed in `animation.embeddedClips`; older snapshots migrate with an empty copy list. Source clips remain listed separately. The isolated browser gate renamed, duplicated, removed, trimmed, retimed, looped, and disabled a copy, then saved and reloaded it. The API returned exactly one copy with `Edited Rise`, trim 0.2–0.8 seconds, speed 1.5, ping-pong loop, and disabled state. The original source clip still appeared and its SHA-256 remained `cc8470d738c5991504a129d2231056a1a7189e00f429f9749b1f2e0414e9d792`.
- Play, pause, restart and scrub were exercised in the browser. Scrub positions 0 and 1 produced a mean screenshot channel difference of 2.45, confirming a changed pose. Focused playback tests cover trim, speed, once/repeat/ping-pong boundaries and deterministic time mapping. A mixer test filtered a missing target, animated the remaining track, and did not throw.
- Final Task 4.1 suite: `pnpm test` **50 files, 237 passed, 1 optional private-fixture skip**; `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. The isolated browser gate passed import, optimization, project, appearance, scene, interactions, embedded clip reload, tiny/large framing, owner isolation and unchanged source hash; its disposable database was removed. Task 4.2, Task 4.3, Task 4.4, and Phase 5 remain unverified and unaccepted.
