# Task 1.1 — FBX and OBJ ingestion

**Status:** [ ] Planned. **Depends on:** current import/analysis milestone.

**Outcome:** An owner can import `.fbx` and `.obj` packages and inspect normalized web-ready results while the originals remain byte-identical. OBJ dependency resolution includes MTL and referenced textures; FBX processing reports unsupported features instead of silently losing them.

**Work:** Define format detection by file content/parser behavior, server-side conversion boundary, normalization output manifest, and analysis handoff. Extend the existing import service and protected file delivery rather than bypassing them. Record converter version and warnings on each derived result. Resolve exact converter/tool choice against current upstream documentation during implementation.

**Acceptance:**

- [ ] Tests import a legal FBX and an OBJ with MTL and texture dependencies.
- [ ] Missing MTL/texture and malformed inputs name the failing dependency; no source is altered.
- [ ] A converted version reopens in the Three.js viewer with expected geometry/materials or explicit fidelity warnings.
- [ ] Unauthorized and traversal attempts remain blocked.

**Likely touchpoints:** `src/features/assets/application/import-asset.ts`, `src/features/assets/infrastructure/`, `src/features/viewer/`, `src/db/schema/assets.ts`. **Evidence to record:** fixture licenses, commands/results, conversion caveats.
