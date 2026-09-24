# Phase 1 import evidence

Last checked: 2026-09-24

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

Focused fixture verification on 2026-09-24:

- `pnpm test -- src/features/assets/infrastructure/model-converter.test.ts src/features/assets/infrastructure/import-manifest.test.ts src/features/assets/application/import-asset.test.ts`: 23 test files passed, 133 tests passed, 1 optional private-fixture test skipped.
- Generated ASCII FBX and OBJ+MTL+PNG fixtures reopen through the existing conversion boundary, produce GLB output, retain explicit fidelity warnings, and leave source bytes unchanged.
- The focused check does not close the legal redistribution fixture, persisted owner database, browser import/reopen, or external restart gates below.

## Task 1.2/1.3 work

- `runImportJob` records byte progress and safe phase checkpoints, resumes without restaging completed files, and cleans up on cancellation/failure.
- `inventoryVariants` reports candidate models, referenced resources, attribution files, and `unknown` attribution when no license/credit text is present.

## Original ZIP retention task — 2026-09-24

- `buildImportManifest` now returns the validated, byte-identical input ZIP separately from extracted entries. The import service stages it under the source tree and records its relative path, `source` role, `application/zip` MIME, byte size, and SHA-256. The existing protected file route serves that recorded source only through its owning asset.
- Synthetic fixture: generated ZIP containing `folder/triangle.gltf` and `folder/triangle.bin`. The manifest test also uses a generated ZIP with `folder/hero.glb` and `folder/LICENSE.txt`. No private upload was read or changed.
- Red verification: `pnpm exec vitest run src/features/assets/infrastructure/import-manifest.test.ts src/features/assets/application/import-asset.test.ts` failed with 2 expected assertions (`archive` missing and stored ZIP missing); 31 other tests passed.
- Green verification: the same focused command passed **2 files, 33 tests**. `pnpm exec vitest run src/app/api/assets/[assetId]/file/route.test.ts` passed **1 file, 4 tests**. The ZIP route test confirms owner bytes/MIME and a cross-owner 404 using temporary storage.
- `pnpm test`: **23 files, 135 passed, 1 skipped**. `pnpm lint`: passed. `pnpm typecheck`: passed. `pnpm build`: passed on Next.js 16.3.5. `git diff --check`: passed (Git printed only Windows LF-to-CRLF notices).
- `pnpm test:e2e`: **1 smoke passed, 1 owner workflow skipped** because no isolated PostgreSQL URL and E2E owner fixture variables were configured. This does not prove a browser ZIP import or restart durability.
- `graphify update .`: the bare Windows invocation exited 1 without output. With `PYTHONHASHSEED=0` set for the command, it completed: AST extraction of 91 code files and no topology changes. Documentation semantic extraction was not performed.
- Ponytail review of this task's diff: lean already; no new dependency, job layer, route branch, or database table was introduced.
- This task proves ZIP retention in the existing import/service and protected-file boundaries. It does **not** prove persistence through a real database restart, optimization, large-package memory bounds, or the owner browser workflow; Phase 1 checkboxes remain open.

## Remaining acceptance gaps

- Need legal representative FBX and OBJ+MTL+texture fixtures with licenses and a browser import/reopen check using isolated synthetic owner data.
- Need route/UI integration for persisted job progress, cancellation, retry, and explicit variant selection.
- Need a database migration and isolated end-to-end recovery run proving source hashes and incomplete-vs-complete states.
- Existing GLTF/GLB path is covered by the current unit and smoke suites, but the full Phase 1 acceptance suite is not yet present.
