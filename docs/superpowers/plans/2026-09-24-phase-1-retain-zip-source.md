# Retain Original ZIP Source Implementation Plan

> **For agentic workers:** Implement this one bounded task in the current checkout. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the exact uploaded ZIP alongside its extracted model files, with a recorded SHA-256 digest and owner-scoped retrieval.

**Architecture:** `buildImportManifest` validates and expands the ZIP while returning the original archive as a separate source entry. `createImportAsset` stages and records that entry using the existing immutable storage and asset file transaction. The protected file route already authorizes recorded files through the owning asset.

**Tech Stack:** TypeScript, Vitest, fflate, current asset storage and Drizzle repository interfaces.

**Spec:** `docs/superpowers/specs/2026-09-22-yggdrasil-design.md`, Import and Security and Privacy; `docs/roadmap/phase-1-imports/01-fbx-obj.md` and `02-large-packages.md`.

## Constraints

- Work directly in `C:\dev\yggdrasil`; preserve current uploads, owner data, commits, and uncommitted changes.
- Keep ZIP input bytes unchanged and never replace the archive with expanded content.
- Reject unsafe or invalid ZIP input before creating an asset.
- Do not claim Phase 1 acceptance without isolated owner browser and PostgreSQL restart evidence.

## Task 1: Retain and retrieve the original archive

**Files:** `src/features/assets/domain/types.ts`, `src/features/assets/infrastructure/import-manifest.ts`, `src/features/assets/infrastructure/import-manifest.test.ts`, `src/features/assets/application/import-asset.ts`, `src/features/assets/application/import-asset.test.ts`, `src/app/api/assets/[assetId]/file/route.test.ts`, `docs/roadmap/phase-1-imports/EVIDENCE.md`.

**Interface:** `ImportManifest.archive?: ImportFile` exposes the validated original ZIP entry. Existing `StoredAssetFile` uses role `source` and MIME `application/zip`; no new table or dependency is needed.

- [x] Add a manifest test asserting the archive remains byte-identical and is separate from extracted files. It failed because `archive` was absent.
- [x] Add an import service test using a generated ZIP. It failed because no ZIP bytes were stored, then verified path, `source` role, byte size, SHA-256, and MIME.
- [x] Add a protected file test confirming that the existing route streams a recorded ZIP to the owner and returns 404 for a different owner.
- [x] Implement the smallest manifest and import service changes; use the existing owner-scoped file handler without changing its authorization logic.
- [x] Run the focused tests, full `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e`, `pnpm build`, and `git diff --check`. Record exact results and the skipped browser gate.
- [x] Run `graphify update .` with `PYTHONHASHSEED=0` for this Windows launcher and review the diff with the Ponytail simplification lens. Stage explicit paths and commit the focused change.

## Review Focus

- ZIP path collisions: invalid or duplicate names must still fail before persistence.
- Archive bytes: conversion and analysis must consume extracted entries without mutating the original archive.
- Failed import: staged archive and extracted files must follow the existing cleanup path.
- Owner access: a retained source ZIP must remain unavailable to another owner.
- Scope of evidence: unit and route tests do not prove process restart or browser acceptance.
