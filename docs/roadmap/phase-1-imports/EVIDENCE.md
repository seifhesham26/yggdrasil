# Phase 1 import evidence

Last checked: 2026-09-23

## Current status

Phase 1 remains planned. No task is marked complete because the acceptance checks requiring a real-package browser import, persisted resumable jobs, variant selection, and isolated database evidence are not all satisfied yet.

## Implemented evidence

- `pnpm test`: 16 files, 85 passed, 1 skipped.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed on Next.js 16.3.5.
- `pnpm test:e2e`: smoke test passed; database-backed import test skipped because no isolated E2E owner/database variables were configured.
- `graphify update .`: completed through the recorded interpreter at `graphify-out/.graphify_python`; the Windows launcher itself currently points at a missing script path.

## Task 1.1 work

- Manifest detection accepts OBJ, MTL, FBX, and their retained resources.
- OBJ MTL and texture references are checked by package-relative path; missing dependencies return `MISSING_DEPENDENCY` with the failing path.
- Binary and ASCII FBX signatures are validated before conversion.
- Server-side conversion uses the official Three.js `OBJLoader`, `FBXLoader`, and `GLTFExporter` boundary. Converted models are stored under `__normalized/`; source files remain separately retained and are hashed before promotion.
- OBJ material conversion and FBX fidelity limitations are explicit warnings.

## Task 1.2/1.3 work

- `runImportJob` records byte progress and safe phase checkpoints, resumes without restaging completed files, and cleans up on cancellation/failure.
- `inventoryVariants` reports candidate models, referenced resources, attribution files, and `unknown` attribution when no license/credit text is present.

## Remaining acceptance gaps

- Need legal representative FBX and OBJ+MTL+texture fixtures with licenses and a browser import/reopen check using isolated synthetic owner data.
- Need route/UI integration for persisted job progress, cancellation, retry, and explicit variant selection.
- Need a database migration and isolated end-to-end recovery run proving source hashes and incomplete-vs-complete states.
- Existing GLTF/GLB path is covered by the current unit and smoke suites, but the full Phase 1 acceptance suite is not yet present.
