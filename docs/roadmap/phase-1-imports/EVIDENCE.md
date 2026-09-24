# Phase 1 import evidence

Last checked: 2026-09-24

## Current status

Phase 1 is in progress. Tasks 1.1 and 1.2 are accepted. Task 1.3 remains open for reviewable variant resources and attribution; Task 1.4 awaits the final phase gate.

## Variant selection and app restart gate — 2026-09-24

- The Task 1.3 patch stores ambiguous candidate paths on a failed import job. The owner can select one candidate and retry the same job ID. The chosen path is persisted, all alternate source models and dependencies are retained, and license text is a protected attribution file. A focused Vitest run passed **4 files, 47 tests**.
- The first isolated PostgreSQL owner browser run failed at the new variant step. The generated glTF fixture referenced `triangle.bin` but the test uploaded `model.bin` under each variant directory. Correcting the fixture paths produced **2 Playwright tests passed, 0 skipped**. The strengthened browser assertions verify persisted candidate paths, the selected `high/model.gltf` version storage key, completed job state, retained source paths, and exact license text.
- An isolated PostgreSQL 18.4 database was created under the existing temporary test cluster and all Drizzle migrations, including `0006_variant_selection`, applied successfully. No configured owner database or asset root was used.
- `scripts/restart-import-gate.ts` runs a built app on a separate loopback port with a throwaway owner and temporary asset root. It uploads a generated glTF package, persists the job ID in the browser, sets an expired staging checkpoint to model a stopped worker, kills the app process tree, starts a new process, and reloads the same browser session. The gate printed `RESTART_IMPORT_GATE_PASS`: the job completed on its original UUID, exactly one asset was stored, and the source SHA-256 matched the uploaded bytes. It checks that the test database is empty and separate from `DATABASE_URL` before writing; cleanup targets only its owner and validated temporary asset folder.
- This closes browser selection and one process-restart recovery path. Task 1.3 remains open because candidate dependency sets, license/credit review before confirmation, unknown attribution display, and post-import variant switching are not yet in the owner interface. Task 1.4 and the Phase 1 gate remain open until those dependencies and final full-suite evidence are closed.
- A focused route regression test first failed because a `null` JSON job control body threw a `TypeError`; the request now returns HTTP 400 with `INVALID_REQUEST`. The focused test passed after the fix.
- Final checks for this increment: `pnpm test` **29 files, 171 passed, 1 optional private fixture skipped**; isolated `pnpm test:e2e` **2 passed, 0 skipped**; the separate built-app restart gate passed; `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. `pnpm db:generate` reported **no schema changes** after adding the missing `0006_snapshot.json`; the new migration applied successfully to the isolated database. `graphify update .` rebuilt the code graph at 821 nodes and 1,766 edges; its optional SQL parser is absent, so the SQL migration was verified by Drizzle and PostgreSQL instead.

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

## Task 1.2 streamed route and ZIP integration — in progress, 2026-09-24

- The authenticated route now uses the disk spool. Manifest validation accepts file-backed sources, extracts ZIP entries one at a time with yauzl, rejects unsafe paths, links, malformed metadata, high ratios, and actual expansion over the limit, and keeps the original archive byte-identical. The importer copies spooled sources into protected staging without materializing the entire package. The browser sends native `File` objects by XHR and shows upload byte progress; it no longer calls `arrayBuffer()` on each file.
- Focused red/green checks covered file-backed OBJ dependencies and ZIP expansion, symlink and traversal rejection, malformed ZIP diagnostics, file processing cap, protected file copying, route spool wiring and cleanup, and native browser `File` forwarding.
- Isolated owner Playwright run after the route change: **2 passed, 0 skipped**. It imported and reopened the CC0 FBX and OBJ packages plus a generated ZIP, checked source bytes after reload, and exercised the existing optimization workflow against temporary PostgreSQL 18.4. The E2E owner and asset root were removed by guarded teardown.
- The current limit is 1 GiB of upload/archive input, 10,000 entries, 1 GiB ZIP expansion, 256 MiB per processed file, and 100:1 declared compression ratio; [local development guidance](../../development.md) records them. A measured peak-memory stress run is still needed. Persisted jobs, server-side processing progress, cancellation after upload, and restart/retry remain open, so Task 1.2 stays unchecked.
- Full verification after this increment: `pnpm test` **24 files, 152 passed, 1 optional private fixture skipped**; `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` exited 0. A new storage test initially compared `Uint8Array` with `Buffer`; correcting that assertion produced the final green run. The Ponytail review found the source union, streaming parser, and archive reader are required for this path; no speculative layer or wrapper was added.

## Task 1.2 persisted job foundation — in progress, 2026-09-24

- Added an owner-scoped `import_jobs` table and Drizzle repository for uploaded source metadata, phase, byte checkpoint, cancellation request, retry, lease, and eventual asset ID. The job runner now uses byte sizes instead of in-memory byte arrays, resets its checkpoint after staging cleanup, and checks cancellation after analysis before promotion.
- Focused red tests caught the old runner skipping cleaned files on retry and committing after cancellation. Embedded PostgreSQL tests then passed for persisted checkpoints across repository instances, cross-owner denial, path-scope validation, cancellation, and retry from zero.
- Migration `0005` was generated from the schema, then corrected before use: the previous snapshot had misplaced `parent_version_id`/`operation_id` columns, so its unrelated add/drop statements were removed. `pnpm db:migrate` succeeded against the empty isolated PostgreSQL 18.4 database. An `information_schema` query confirmed both columns remain on `asset_versions`, absent from `asset_files`, and `import_jobs.upload_prefix` exists.
- `pnpm test`: **25 files, 158 passed, 1 optional private fixture skipped**; `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. The job record is not connected to the HTTP workflow yet. No background processing, restart claim, or browser job recovery acceptance is claimed.

## Task 1.2 persisted job workflow — accepted, 2026-09-24

- Added authenticated `POST /api/assets/import/jobs`, owner-scoped `GET` and `PATCH` status/control routes, and `POST /run`. Uploads retain their protected staging tree while the job runner verifies each stored file by streaming its SHA-256, claims a 15-second lease, reports staging/analyzing/committing byte checkpoints, heartbeats active work, and removes the upload only after completion or cancellation.
- Retry reuses the job UUID as the asset ID. `createImportAsset` reuses the existing source row, recognizes an already-ready asset, and recovers a final source tree after a process stop between storage promotion and the database commit. Failed jobs retain the upload for retry; cancellation is checked between files and before promotion and prevents a canceled checkpoint from advancing.
- The browser import flow now sends native `File` objects to the job endpoint, persists the active job ID in browser storage, displays server byte progress and phase, resumes a saved job after navigation/reload, and exposes cancel/retry controls. Existing injected upload tests remain compatible.
- New focused tests cover job upload wiring, lease recovery, ownership/path validation, idempotent asset retry, final-tree recovery, cancellation before commit, and the process runner's successful and changed-upload paths. `pnpm test`: **28 files, 166 passed, 1 skipped**; `pnpm lint`: passed; `pnpm typecheck`: passed; `git diff --check`: passed.
- Isolated PostgreSQL 18.4 browser acceptance: `pnpm db:migrate` succeeded against the temporary empty `yggdrasil_e2e` database, then `pnpm test:e2e` passed **2 tests, 0 skipped**. The owner workflow uploaded glTF, CC0 FBX, OBJ+MTL+PNG, and ZIP packages through `/api/assets/import/jobs`, reopened all assets, verified retained source bytes and protected access, and completed the existing optimization workflow. Teardown removed only the throwaway owner and guarded temporary asset root.
- Streaming limits remain 1 GiB request/archive, 10,000 files, 1 GiB expanded ZIP data, 256 MiB per processed file, and a 100:1 declared compression ratio. Unit tests cover understated content length, file limits, interrupted multipart bodies, traversal, absolute paths, symlinks, encrypted ZIPs, forged expansion, and compression-ratio rejection. These checks stream to disk and inspect bounded metadata; no private owner fixture was used.
- `graphify update .` was run after the changes with `PYTHONHASHSEED=0`. The migration and workflow are focused in commits `93cbe85` plus the current job workflow increment.
