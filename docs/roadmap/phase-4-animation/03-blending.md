# Task 4.3 — Blending and sequencing

**Status:** [x] Accepted 2026-09-28. **Depends on:** Tasks 4.1–4.2.

**Outcome:** Project clips can be reordered, sequenced, crossfaded/blended, looped, and selectively disabled with predictable playback.

**Work:** Define timing and blending semantics, including source offsets, speed, overlap, weights, and reset behavior. Provide visual playback feedback and serialize the sequence. Avoid mutating shared Three.js animation objects used by other previews.

**Acceptance:**

- [x] Tests cover sequential clips, overlap/crossfade, loop boundary, and disabled clip.
- [x] Scrubbing and replay produce consistent state after reload.
- [x] Incompatible tracks have an explicit warning or supported resolution.
- [x] Source clip data and original file hashes remain unchanged.

**Likely touchpoints:** viewer playback controller, animation project config, timeline UI. **Evidence to record:** timing fixtures and browser playback checks.

## Timing contract and acceptance evidence — 2026-09-28

- The validated snapshot stores ordered segments with a clip ID, wall-clock duration, overlap with the previous segment, source offset from its trim start, weight, and enabled flag, plus a sequence loop flag. Segment start is the previous end minus its overlap. Adjacent overlap must fit both segments, and overlapping both neighbors cannot consume an entire middle segment. Reordering keeps each timeline position's overlap. A disabled segment keeps its time slot but contributes no pose. A missing clip is skipped with a warning.
- Source time advances by the referenced clip's speed from its trim start plus source offset. `once` holds the trim end, `repeat` wraps inside the trim, and `pingpong` reflects at the trim boundaries. Adjacent active segments use linear fade weights multiplied by their segment weights. A looping sequence wraps at its total duration; there is no crossfade between the final and first segments. Preview uses distinct cloned Three.js clips/actions, so seeking and blending do not edit embedded source tracks or imported keyframes.
- Pure timing and mixer tests cover sequential playback, overlap weights and a 50/50 blended pose, backwards/forwards deterministic scrubbing, loop boundary, disabled segment, source offset/speed, and unchanged source keyframes. A project history test verifies sequence settings survive load, undo, and redo. UI tests cover adding, overlap, reorder with retained overlap/offset/weight, looping, and an explicit warning for overlapping incompatible track shapes.
- The authenticated production browser gate added an embedded and imported segment, set overlap/offset/weight, played and scrubbed, reordered, saved, reloaded, and played/scrubbed again. Mean screenshot channel differences were **2.64** before reload and **2.65** after reload. Imported speed/loop settings persisted. The original GLB SHA-256 remained `cc8470d738c5991504a129d2231056a1a7189e00f429f9749b1f2e0414e9d792`, and the private imported source retained SHA-256 `268fba774ccfa7a98096ad21dc4f32cab437964cbfd357aedca1096e1a4cb05e`. The isolated database was removed.
- Final gate: `pnpm test` **53 files, 259 passed, 1 existing optional private-fixture skip**; `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. `pnpm exec tsx scripts/with-isolated-postgres.ts exec playwright test --workers=1` reported **2 passed** and removed its database. The production gate also passed prior import, optimization, appearance, scene, interaction, animation, framing, owner isolation, and failure/retry checks.
