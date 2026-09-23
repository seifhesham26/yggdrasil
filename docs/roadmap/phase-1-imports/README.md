# Phase 1 — Broader imports and processing

**Status:** Planned. **Depends on:** acceptance of the current GLTF/GLB import-and-analysis milestone.

Goal: reliably ingest FBX, OBJ, large folders/ZIPs, and model variants while preserving originals and provenance. Work through the tasks in order:

- [ ] [1.1 — FBX and OBJ ingestion](01-fbx-obj.md)
- [ ] [1.2 — Large-package streaming and jobs](02-large-packages.md)
- [ ] [1.3 — Variants and attribution](03-variants-attribution.md)
- [ ] [1.4 — Import integration and recovery](04-integration.md)

**Phase exit:** A legal representative FBX, OBJ+MTL+textures, and large archive import can be resumed or safely retried; all open as web-ready previews with their unchanged source packages retained. Missing dependencies, unsafe paths, and incompatible variants produce actionable errors. No partial library entry is presented as complete.

Source: [approved design](../../superpowers/specs/2026-09-22-yggdrasil-design.md), “Import,” “Error Handling and Recovery,” and “Security and Privacy.”
