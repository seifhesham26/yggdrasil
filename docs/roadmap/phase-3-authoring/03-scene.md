# Task 3.3 — Scene controls

**Status:** [ ] Planned. **Depends on:** Task 3.1.

**Outcome:** The owner can configure environment, lighting, shadows, background, camera, controls, tone mapping, and framing for the chosen model.

**Work:** Define serializable scene settings with valid ranges and defaults. Preview desktop/tablet/mobile viewport dimensions and reduced-motion behavior. Make camera reset and frame-selection predictable. Keep scene settings separate from model source files.

**Acceptance:**

- [ ] Saved settings recreate the same view after reload.
- [ ] Invalid values are rejected with field-level feedback.
- [ ] Narrow viewport and reduced-motion previews remain usable.
- [ ] Camera controls and frame-selection work on large/small models.

**Likely touchpoints:** `src/features/viewer/`, project config, scene editor. **Evidence to record:** screenshot/browser comparison and accessibility checks.
