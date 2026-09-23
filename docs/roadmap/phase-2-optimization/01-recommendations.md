# Task 2.1 — Findings and recommendations

**Status:** In progress. **Depends on:** Phase 1.

**Outcome:** Analysis produces specific, explainable optimization suggestions rather than a single opaque score.

**Work:** Add deterministic rules for unused resources, oversized textures, expensive geometry/draw calls, and safe normalization candidates. Each finding identifies affected resource IDs, evidence, expected gain, quality risk, and whether the operation is supported. Keep estimates clearly labeled; do not claim measured savings before generating an output.

**Acceptance:**

- [x] Fixture tests produce stable findings and no duplicate/conflicting recommendations.
- [x] A model requiring no change gets an explicit “no recommendations” state.
- [x] Unsupported compression/material cases show a warning, not an unsafe action button.
- [x] Only the authenticated owner can request and view private findings.

**Likely touchpoints:** `gltf-analyzer.ts`, asset domain types, Drizzle finding records, asset detail UI. **Evidence to record:** fixture metrics and rule thresholds.
