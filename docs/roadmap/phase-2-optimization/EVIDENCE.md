# Phase 2 optimization evidence

Last checked: 2026-09-23

## Scope and safety

Phase 2 is in progress. All optimization fixtures use generated glTF bytes and temporary directories under the operating system temp folder. No original upload, configured storage root, database owner, or private fixture is modified.

## Task 2.1 — Findings and recommendations

- `pnpm test -- --run src/features/assets/domain/optimization.test.ts src/app/api/assets/[assetId]/optimization/route.test.ts`: deterministic findings, explicit `no-recommendations`, unsupported-operation warnings, and owner-scoped access passed.
- Estimates are labeled `estimate`; no measured saving is reported before output generation.
- Thresholds currently covered by the rules: textures over 4096 pixels and triangle counts over 250,000. Required unsupported extensions disable normalization.

## Task 2.2 — Derived versions

- `ReversibleOptimizationHistory` creates a new version with parent ID, output SHA-256, byte size, analysis snapshot, and operation metadata.
- Failed processing removes only the derived version tree; the prior version remains selected. Database schema and migration add `current_version_id`, version lineage, findings, and operation records.
- Database-backed restart/reopen verification is not yet complete, so Task 2.2 remains unchecked.

## Task 2.3 — Operations

- `processOptimization` supports deterministic prune/dedup normalization and reopens the generated GLB through the existing analyzer.
- Geometry compression, texture resizing, and lower-detail simplification return an explicit unsupported error; no unsafe action is exposed.
- Full operation coverage and production operation persistence remain open.

## Task 2.4 — Comparison, history, and recovery

- Temporary-storage tests prove lineage, measured output metrics, owner checks, failed-attempt visibility, and revert without deleting later history.
- Browser apply/compare/revert/reopen coverage and production UI controls remain open.

## Verification

- `pnpm test`: 19 files, 92 passed, 1 skipped.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
