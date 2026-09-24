# Task 2.3 — Optimization operations

**Status:** Accepted on 2026-09-24. **Depends on:** Task 2.2.

**Outcome:** Approved operations can remove unused resources, resize/compress selected textures, apply compatible geometry/mesh compression, and create lower-detail variants where quality permits.

**Work:** Specify each operation's preconditions, parameters, expected artifacts, and warning conditions. Implement behind focused processors, not inside UI components. Validate generated GLB/GLTF by reopening and reanalyzing it. Surface visual/fidelity risks before the owner confirms. Resolve exact libraries and encoder capabilities from current primary documentation when implementing.

**Acceptance:**

- [x] Normalization, unused-resource removal, texture resizing/compression, geometry compression, and lower-detail operations have positive fidelity fixtures plus rejected incompatible-input cases.
- [x] The user must approve an operation before it runs; settings are recorded and reused on retry.
- [x] Results record actual size/mesh/texture metrics and are accessible through the owner-scoped file route.
- [x] A failed processor leaves its source and prior versions intact.

**Likely touchpoints:** new processing modules, job records, analysis service, asset detail UI. **Evidence to record:** output validation and fidelity caveats.

See [current evidence](EVIDENCE.md) for the extension allowlist, processor versions, measured outputs, and remaining fidelity limits. The owner browser accepted and ran the compression, normalization, comparison, revert, failure, and retry paths against isolated PostgreSQL. The operation set is complete for the current supported contract; broader exporter-specific fidelity remains a follow-up.
