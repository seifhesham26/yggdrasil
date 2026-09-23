# Task 3.2 — Appearance controls

**Status:** [ ] Planned. **Depends on:** Task 3.1.

**Outcome:** The owner can find and select model parts, then alter transforms, visibility, material/texture choices, color, opacity, and common PBR values without editing the original package.

**Work:** Connect a searchable hierarchy to viewport picking; use stable node/material references and handle duplicate names. Persist overrides in project configuration or a derived version. Validate numeric ranges, texture compatibility, and missing-resource fallback. Support reset per property and per part.

**Acceptance:**

- [ ] Hierarchy selection and viewport selection identify the same target.
- [ ] Overrides survive reload and can be reset individually.
- [ ] Duplicate/renamed nodes do not silently apply changes to the wrong object.
- [ ] Original source hashes remain unchanged.

**Likely touchpoints:** viewer scene, analysis node IDs, project configuration, dark editor UI. **Evidence to record:** selection and persistence tests.
