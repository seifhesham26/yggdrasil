# Task 3.2 — Appearance controls

**Status:** Accepted 2026-09-25. **Depends on:** Task 3.1.

**Outcome:** The owner can find and select model parts, then alter transforms, visibility, material/texture choices, color, opacity, and common PBR values without editing the original package.

**Work:** Connect a searchable hierarchy to viewport picking; use stable node/material references and handle duplicate names. Persist overrides in project configuration or a derived version. Validate numeric ranges, texture compatibility, and missing-resource fallback. Support reset per property and per part.

**Acceptance:**

- [x] Hierarchy selection and viewport selection identify the same target.
- [x] Overrides survive reload and can be reset individually.
- [x] Duplicate/renamed nodes do not silently apply changes to the wrong object.
- [x] Original source hashes remain unchanged.

**Likely touchpoints:** viewer scene, analysis node IDs, project configuration, dark editor UI. **Evidence to record:** selection and persistence tests.

## Acceptance evidence — 2026-09-25

- The project viewer indexes clone nodes by child path, type, and name. The hierarchy and viewport write the same selected ID; the isolated browser gate clicked the model viewport after hierarchy selection and verified the same mesh button remained selected. Duplicate-name and renamed-node unit tests prove references cannot silently redirect. A project remains bound to its retained asset version.
- Appearance controls save visibility, transforms, color, opacity, roughness, metalness, material choices, and compatible existing texture choices as JSONB project overrides. Material and texture application clones source materials. Missing references warn and skip; no-UV targets reject texture overrides. Focused Three.js tests cover distinct duplicate IDs, immutable shared materials, material/texture choice, and no-UV fallback.
- The isolated browser gate saved a part color override, reloaded it, reset only color, and reloaded the original value. It verified the exact selected node ID in the saved snapshot and unchanged original SHA-256 `cc8470d738c5991504a129d2231056a1a7189e00f429f9749b1f2e0414e9d792`. Choices are limited to materials/textures already in the retained model; external texture upload is outside this task.
