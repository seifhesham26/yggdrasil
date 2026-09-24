# Phase 1 import evidence

Last checked: 2026-09-24

## Current status

Phase 1 is in progress. Task 1.1 is accepted using the committed CC0 fixtures and an isolated PostgreSQL owner browser run. Tasks 1.2–1.4 remain open for bounded package handling, persisted resumable jobs, variant selection, and restart recovery.

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

- Broader licensed FBX exporter samples are still needed before claiming format-wide fidelity; the Task 1.1 gate covers the current documented parser boundary.
- Need route/UI integration for persisted job progress, cancellation, retry, and explicit variant selection.
- Need a database migration and isolated end-to-end recovery run proving source hashes and incomplete-vs-complete states.
- Existing GLTF/GLB path is covered by the current unit and smoke suites, but the full Phase 1 acceptance suite is not yet present.

## Task 1.1 redistributable fixtures and browser gate — 2026-09-24

- Added original, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) fixtures in `src/test/fixtures/phase-1/`: an ASCII FBX cube and an OBJ quad with MTL and 2×2 PNG texture. The fixture README records authorship, content, and converter limitations. No owner upload or third-party asset was used.
- SHA-256: `cube.fbx` `83d7df92994218f06d057c48baa5f5e37ef10d1fc716e290f91d2f3e47c8af07`; `painted-panel.obj` `e812dd8c14781b285cd25b54bcdd740b6d4b58bebb8c035e7dd97d48481f6e90`; `painted-panel.mtl` `ac86a68714f1fc9bf1911ad01b43ed5aee5790a394594eb781e912fa5abce1d5`; `checker.png` `f78324a3d1694c16d07b199eeae7738382a488185cebfd4633a5929aba9da24f`.
- Red check: focused converter test failed on two missing committed fixture paths. Green check: the same test passed with real FBX and OBJ fixtures; GLB inspection found 12 cube triangles and two panel triangles, dependencies remained present, warnings remained explicit, and input bytes were unchanged. Redundant inline synthetic conversion cases were removed in the Ponytail pass.
- Extended `e2e/import-flow.spec.ts` to import both fixtures through the owner browser, inspect triangle counts and fidelity warnings, wait for the viewer, retrieve byte-identical source files and normalized GLBs through the protected route, deny an anonymous file request, and reopen each asset after page reload. The test requires `YGGDRASIL_E2E_DATABASE_URL` distinct from `DATABASE_URL` and an empty migrated PostgreSQL database.
- `pnpm test:e2e`: smoke passed; the owner workflow, including the new FBX/OBJ browser steps, was skipped because no isolated PostgreSQL URL was configured. Docker and `pg_ctl` were also unavailable. The browser import/reopen gate is **unverified**, so Task 1.1 and Phase 1 remain open. The fixtures cover the current parser boundary but do not represent the range of FBX exporter features.
- Final checks: `pnpm test` passed (23 files, 135 passed, 1 skipped); `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. `graphify update .` completed with `PYTHONHASHSEED=0` and refreshed the ignored graph output; it skipped the model fixture formats because they are not classified as graph code or documents. Ponytail review found no further removable complexity after replacing the duplicated inline converter cases.

## Task 1.1 isolated PostgreSQL browser acceptance — 2026-09-24

- Installed PostgreSQL 18.4 binaries into `%TEMP%/yggdrasil-pg-gate`, initialized a dedicated loopback cluster on port 55479, and created an empty `yggdrasil_e2e` database. No repository dependency or configured owner database/storage was changed. `YGGDRASIL_E2E_DATABASE_URL` pointed only to this temporary database; `DATABASE_URL` was set to that URL only for migration.
- `pnpm db:migrate`: all Drizzle migrations applied successfully with the real `pg` driver. The Playwright `beforeAll` empty-database assertion then passed; a nonempty owner/assets database would have stopped the test.
- `pnpm test:e2e -- e2e/import-flow.spec.ts`: **2 passed, 0 skipped**. The owner workflow created a throwaway owner, imported the generated glTF model, exercised normalization, failed promotion, revert, retry and reload, then imported the committed CC0 FBX cube and OBJ+MTL+PNG package. It checked the expected triangle counts, explicit conversion warnings, live viewer after reload, retained original bytes, normalized GLB headers, and anonymous file denial. The E2E teardown deleted only the throwaway owner and guarded temp asset root.
- Focused manifest/converter/import-route checks: **3 files, 37 passed**, including missing OBJ texture path, malformed OBJ/FBX, unchanged failure inputs, and anonymous import denial. Final full checks: `pnpm test` **23 files, 137 passed, 1 optional private fixture skipped**; `pnpm test:e2e` **2 passed, 0 skipped**; `pnpm lint`, `pnpm typecheck`, and `pnpm build` exited 0. Lint was rerun sequentially after an initial parallel run raced Playwright's `test-results` cleanup. The optional Mega Wyvern check remains unverified without its private local fixture.
- Scope: the FBX fixture exercises the supported ASCII geometry path; animation, skeleton, and exporter-specific FBX fidelity still need broader samples. Large-package memory bounds, persistent jobs, variants, and process-restart recovery remain Tasks 1.2–1.4.

## Task 1.2 streaming upload foundation — in progress, 2026-09-24

- [Implementation plan](../../superpowers/plans/2026-09-24-large-package-jobs.md) records the disk-backed upload, archive, job, and recovery boundaries. Task 1.2 is **not accepted** yet.
- Added a Busboy multipart spool that writes file chunks into random private paths under a configured temporary storage root. It counts actual streamed request bytes, applies file/field/count limits, records byte size and SHA-256, and removes its temp tree after a rejected, interrupted, or completed upload. The current route is not wired to this spool yet; browser and server imports still use the old eager path.
- Red test: the new suite failed because the spool module was absent. Green test: **5/5 passed**, including an understated `Content-Length`, file size limit, malformed relative-path manifest, and broken request stream with cleanup.
- `pnpm test`: **24 files, 142 passed, 1 optional private fixture skipped**. `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check` exited 0. This does not prove large-package memory bounds, ZIP streaming, persisted jobs, cancellation UI, or restart retry.
