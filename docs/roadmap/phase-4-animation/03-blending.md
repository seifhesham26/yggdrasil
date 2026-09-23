# Task 4.3 — Blending and sequencing

**Status:** [ ] Planned. **Depends on:** Tasks 4.1–4.2.

**Outcome:** Project clips can be reordered, sequenced, crossfaded/blended, looped, and selectively disabled with predictable playback.

**Work:** Define timing and blending semantics, including source offsets, speed, overlap, weights, and reset behavior. Provide visual playback feedback and serialize the sequence. Avoid mutating shared Three.js animation objects used by other previews.

**Acceptance:**

- [ ] Tests cover sequential clips, overlap/crossfade, loop boundary, and disabled clip.
- [ ] Scrubbing and replay produce consistent state after reload.
- [ ] Incompatible tracks have an explicit warning or supported resolution.
- [ ] Source clip data and original file hashes remain unchanged.

**Likely touchpoints:** viewer playback controller, animation project config, timeline UI. **Evidence to record:** timing fixtures and browser playback checks.
