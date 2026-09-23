# Task 2.3 — Optimization operations

**Status:** [ ] Planned. **Depends on:** Task 2.2.

**Outcome:** Approved operations can remove unused resources, resize/compress selected textures, apply compatible geometry/mesh compression, and create lower-detail variants where quality permits.

**Work:** Specify each operation's preconditions, parameters, expected artifacts, and warning conditions. Implement behind focused processors, not inside UI components. Validate generated GLB/GLTF by reopening and reanalyzing it. Surface visual/fidelity risks before the owner confirms. Resolve exact libraries and encoder capabilities from current primary documentation when implementing.

**Acceptance:**

- [ ] Each operation has a positive fixture test and a rejected/unsupported case.
- [ ] The user must approve a particular operation and settings before it runs.
- [ ] Results record actual size/mesh/texture metrics and remain viewable.
- [ ] A failed processor leaves its source and prior versions intact.

**Likely touchpoints:** new processing modules, job records, analysis service, asset detail UI. **Evidence to record:** output validation and fidelity caveats.
