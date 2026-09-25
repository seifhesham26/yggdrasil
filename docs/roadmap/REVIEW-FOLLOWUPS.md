# Review follow-up task ledger

Last checked: 2026-09-25

This file turns the coordinator and subagent review findings into executable tasks. These tasks supplement the phase briefs; they do not replace their acceptance criteria. Keep every item unchecked until its implementation and evidence are complete.

## Foundation and Phase 1 — imports and recovery

- [ ] Add licensed, redistribution-safe FBX and OBJ+MTL+texture fixtures, then run isolated-owner browser import and reopen checks for FBX, OBJ, ZIP, and an interrupted upload.
- [ ] Retain the complete original ZIP/source package bytes and verify their hash after conversion, retry, restart, and later optimization.
- [ ] Move upload-size enforcement ahead of untrusted multipart buffering and document the bounded memory/disk limits for large packages.
- [ ] Integrate persisted job progress, cancellation, retry, and safe restart recovery into the route and UI; distinguish incomplete jobs from complete library assets.
- [ ] Add explicit variant selection and persistence, including the selected candidate and its required resources after reload.
- [ ] Add isolated database coverage for migrations, job restart recovery, source-hash preservation, traversal/absolute-path/symlink rejection, ZIP expansion limits, and interrupted uploads.
- [ ] Run and record the complete Phase 1 quality suite, including the owner-scoped browser workflow, before marking Phase 1 accepted.

## Phase 2 — reversible optimization

- [ ] Make a healthy nonempty model produce an explicit “no recommendations” result when no rule demonstrates a benefit.
- [ ] Make findings identify actual affected resource IDs and add the missing or incorrect rules for unused resources, missing textures, oversized textures, and expensive geometry/draw calls.
- [ ] Record processor/tool version plus explicit input and output hashes in every optimization operation and expose parameters, timestamps, warnings, and outcomes in history.
- [x] Implement and verify the named texture resize, geometry compression, and lower-detail operations, or revise the phase outcome and acceptance wording to the deliberately narrower supported contract.
- [ ] Add a positive processor test proving that remove-unused actually removes an unused resource, not only that the output remains valid.
- [x] Verify the selected derived preview and visual revert/reopen flow in an authenticated browser session with an empty isolated PostgreSQL database.
- [x] Verify retained-version reopening after an external PostgreSQL process restart and record the exact migration/database evidence.
- [x] Run and record the complete Phase 2 quality suite before marking the phase accepted.

## Phase 3 — visual authoring

- [x] Implement owner-scoped project records with save/reopen, typed configuration persistence, undo/redo, step navigation, and an unsaved-state retry path after Neon or network failure.
- [x] Implement stable part selection shared by hierarchy and viewport, validated appearance overrides, individual reset, and protection against duplicate or renamed nodes targeting the wrong object.
- [x] Implement serializable scene settings with range validation, responsive/reduced-motion previews, predictable camera reset, and large/small model frame selection.
- [x] Implement allowlisted interactions for click/hover, hotspots, annotations, and camera targets with missing-target warnings, safe preview mode, and rejection of executable script payloads.
- [x] Add browser coverage for project save, preview, undo/redo, reload, owner isolation, responsive/reduced-motion behavior, and full-suite regression.

## Phase 4 — animation

- [x] Complete embedded clip inventory and project-only editing for rename, duplicate, trim, retime, loop, disable, remove, playback, reload, missing-target warnings, and source-hash preservation.
- [ ] Implement imported clip validation, explicit bone/track mapping, ambiguity resolution, failure rollback, and reproducible reload behavior.
- [ ] Implement serialized sequencing and blending for sequential clips, overlap/crossfade, loop boundaries, disabled clips, scrubbing, replay, incompatible-track warnings, and immutable source data.
- [ ] Implement the typed GSAP timeline format, target/property validation, supported triggers, reduced-motion behavior, teardown/reopen cleanup, and preview/export parity without arbitrary JavaScript.
- [ ] Add fixture and browser coverage for all supported clip, mapping, blending, timeline, target, and trigger cases.

## Phase 5 — export

- [ ] Implement a versioned portable export manifest with stable references, pre-publication validation, secret/Neon/local-path scanning, and retryable export failures.
- [ ] Generate a React target that builds and renders in an independent sample app with animation, reduced-motion behavior, portable assets, declarations, dependencies, attribution, and integration instructions.
- [ ] Generate a standalone embed target with predictable lifecycle, resize, error, interaction, animation, messaging-safety, keyboard, and reduced-motion behavior.
- [ ] Package and verify all loading policies with network traces, safe unpacking, no Yggdrasil/Neon/local-path dependency, complete references/docs/attribution, download/reopen, and failure/retry browser tests.

## Cross-cutting design decision

- [ ] Resolve the verified private fixture camera-count discrepancy between the roadmap (zero cameras) and the approved design text (one camera), then update the authoritative document and any fixtures before acceptance.

## Runtime database diagnostics — reported 2026-09-25

- [x] Library query failure: a read-only reproduction exposed PostgreSQL SQLSTATE `42703`, `column assets.current_version_id does not exist`. The configured database had applied only migrations 0000-0002, with no asset rows. Applied the pending additive migrations through 0007; the ledger now has eight entries, the column exists, and the exact `listAssets` call completes. The existing PGlite optimization wiring test exercises `listAssets` after applying all migrations. A library error boundary now offers retry without displaying raw SQL.
- [x] PostgreSQL SSL warning: runtime and Drizzle migration URLs now normalize legacy `prefer`, `require`, and `verify-ca` modes to `sslmode=verify-full`, preserving the current driver behavior; explicit libpq compatibility remains unchanged. Unit tests cover both cases. The real migration and repository-query runs completed without the warning, and `.env.example` now uses `verify-full`.

Verification: `pnpm test` passed 40 files with 213 tests passed and one pre-existing optional skip; `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. After restarting the local Next.js dev process, `/library` returned HTTP 200 on port 3000 with no SSL warning in the server error log.
