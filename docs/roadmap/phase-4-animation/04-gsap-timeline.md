# Task 4.4 — Visual GSAP timeline

**Status:** [ ] Planned. **Depends on:** Tasks 4.1–4.3 and Phase 3 interactions.

**Outcome:** The owner can build and preview timelines targeting transforms, material properties, cameras, lights, morph values, and named parts, then bind them to timeline start, scroll, click, hover, or model/clip events.

**Work:** Define a typed, serializable track/keyframe/trigger format. Provide add/edit/reorder/delete, scrub, playback, and validation of target/property combinations. Integrate GSAP/ScrollTrigger with cleanup to avoid duplicate listeners or timelines; honor reduced-motion preference. Keep exported runtime behavior aligned with editor preview.

**Acceptance:**

- [ ] Timeline serialization round-trips without changing timing or targets.
- [ ] Every supported target class and trigger has a fixture/browser test.
- [ ] Unavailable targets are warned and safely skipped; arbitrary JavaScript is not accepted.
- [ ] Reduced-motion and teardown/reopen behavior pass; full quality suite passes.

**Evidence to record:** documented timeline schema, preview/export parity risks, tests and commit.
