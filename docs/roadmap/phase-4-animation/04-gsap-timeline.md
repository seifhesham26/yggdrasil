# Task 4.4 — Visual GSAP timeline

**Status:** [x] Accepted 2026-09-28. **Depends on:** Tasks 4.1–4.3 and Phase 3 interactions.

**Outcome:** The owner can build and preview timelines targeting transforms, material properties, cameras, lights, morph values, and named parts, then bind them to timeline start, scroll, click, hover, or model/clip events.

**Work:** Define a typed, serializable track/keyframe/trigger format. Provide add/edit/reorder/delete, scrub, playback, and validation of target/property combinations. Integrate GSAP/ScrollTrigger with cleanup to avoid duplicate listeners or timelines; honor reduced-motion preference. Keep exported runtime behavior aligned with editor preview.

**Acceptance:**

- [x] Timeline serialization round-trips without changing timing or targets.
- [x] Every supported target class and trigger has a fixture/browser test.
- [x] Unavailable targets are warned and safely skipped; arbitrary JavaScript is not accepted.
- [x] Reduced-motion and teardown/reopen behavior pass; full quality suite passes.

**Evidence to record:** documented timeline schema, preview/export parity risks, tests and commit.

## Schema and acceptance evidence — 2026-09-28

- `animation.timelines` is a strict array of at most 50 named, enabled timelines. Each has a UUID, duration, one typed trigger (`start`, `scroll`, `click`, `hover`, `model-loaded`, `clip-start`, or `clip-end`), and at most 100 tracks. Tracks have UUIDs, a target class and ID, an allowlisted numeric property, and 2–100 keyframes starting at zero with strictly increasing times within the timeline duration. The schema rejects extra fields, unsupported target/property pairs, out-of-range material/morph/FOV values, and executable code. Legacy projects with no timelines retain an empty list.
- Supported targets are named model parts (position, rotation, scale), standard materials (opacity, roughness, metalness), the main perspective camera (position, FOV), named ambient/key/fill lights (position, intensity), and indexed morph influences. The editor inventories actual parts and morph names. Missing track targets are warned and skipped; missing click/hover/clip trigger targets are warned. GSAP owns timeline interpolation; ScrollTrigger registers for scroll timelines. The controller kills timelines and scroll listeners and restores touched values on teardown. Reduced motion advances triggered playback to the final pose; manual scrubbing remains available.
- Fixture tests cover all five target classes, seven trigger types, serialization, invalid payloads/timing, missing targets, reduced motion, teardown, and reopen. UI tests cover adding/editing/reordering/removing timelines and tracks, keyframe edits, persistence-valid state, and stale trigger warning. Project history tests cover load, undo, and redo.
- The authenticated isolated production gate added a part track, edited its keyframe and click trigger, visibly scrubbed before and after reload (mean screenshot channel differences **3.17** and **21.67**), clicked the model to fire the trigger, verified reduced-motion completion, rejected an executable timeline payload (HTTP 400), and confirmed the original GLB SHA-256 remained `cc8470d738c5991504a129d2231056a1a7189e00f429f9749b1f2e0414e9d792`. It also passed prior private imported-source, restart, and cross-owner checks; its disposable database was removed.
- Final gate: `pnpm test` **55 files, 265 passed, 1 existing optional private-fixture skip**; `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. Isolated Playwright reported **2 passed** and removed its disposable database. `graphify update .` was run through the actual Python entry point because the installed wrapper silently fails; it reported **1,202 nodes, 2,884 edges, 73 communities**, with 11 nodes from `visual-timeline.ts` verified in `graph.json`.
- Preview/export parity risk for Phase 5: the editor applies only the selected timeline and its current model/clip trigger context. Export targets must instantiate all enabled timelines against their own cloned scene and use the same typed controller and trigger semantics. Timeline effects on the same properties as a clip can overwrite one another; the current preview is deterministic for manual scrubbing but does not compose those tracks into a single blended mixer.
