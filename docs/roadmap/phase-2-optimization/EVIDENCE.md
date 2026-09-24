# Phase 2 optimization evidence

Last checked: 2026-09-24. **Phase acceptance remains open because Task 2.3's wider operation set is unimplemented.** Tasks 2.1, 2.2 and the comparison/recovery flow for supported operations passed their acceptance gates.

## Isolated owner browser and restart acceptance — 2026-09-24

- A fresh, empty `yggdrasil_accept_20260924` database in a temporary loopback PostgreSQL 18.4 cluster received all existing migrations through `0006_variant_selection`; schema generation reported no changes. The configured owner database and storage root were not used.
- `pnpm test:e2e` passed **2 tests, 0 skipped**. The owner browser reviewed findings, approved normalization, saw measured comparison metrics and the derived preview, exercised failed promotion/retry, reverted to the original while retaining history, and reopened the selected version. The import flow also checked source bytes and protected derived file access. The final large-archive browser run logged SHA-256 `7e9ceb556aabad6e9903947e2fbf880b83517d11b3264f59734be884e8d07578` for the retained 64 MiB ZIP.
- Against a production build and the same isolated PostgreSQL database, `pnpm exec tsx scripts/restart-import-gate.ts` printed `RESTART_IMPORT_GATE_PASS` and `OPTIMIZATION_RESTART_GATE_PASS`. It restarted the app twice, reopened the original and derived version IDs and the derived GLB, and confirmed the uploaded source SHA-256 remained `cc8470d738c5991504a129d2231056a1a7189e00f429f9749b1f2e0414e9d792`.
- The full unit/integration, lint, typecheck, and build gates passed as recorded in [Phase 1 final evidence](../phase-1-imports/EVIDENCE.md). This closes the earlier browser and process-restart gaps below. The optional private Mega Wyvern fixture was unavailable.
- Texture resizing/compression, geometry/mesh compression, and lower-detail variants are explicitly unsupported, with tested warnings. The complete Phase 2 outcome remains open until these operations and their fidelity/visual gates are implemented.

## Earlier fixture and adapter scope

Fixtures use generated glTF bytes, guarded temporary storage, and an embedded PostgreSQL engine (PGlite) migrated with the project's real SQL migrations. No configured database, owner account, source upload, private model, or configured storage root was modified.

The adapter tests execute real Drizzle queries, PostgreSQL constraints, transactions and failure triggers. The route wiring tests import the actual GET/POST/PATCH and file route exports. Only their database connection, authenticated session and storage configuration are substituted; the repository, persistence adapter, processors, analyzer and storage are real. This is not a test of the production node-postgres connection or Neon service.

## Findings and recommendations

- Normalization is disabled for incomplete material images, error-level analysis findings, and extensions outside the tested rewrite allowlist. Core glTF, `KHR_materials_unlit` and `KHR_materials_clearcoat` are eligible. Other extensions can still be inspected, but optimization is blocked with a compatibility explanation.
- Controls display the recommendation, quality risk and estimated savings before approval. Comparison metrics are measured file bytes and analysis counts, not estimates.
- Resizing textures, compressing geometry and producing lower-detail geometry remain explicitly unsupported. Their rejection paths are tested; no positive implementation is claimed.

## Derived versions and recovery

- Promotion validates the owner and retained parent while holding an asset row lock, then saves version, analysis, success attempt, operation linkage and current selection in one transaction.
- PostgreSQL trigger tests fail each of those five writes. Every rollback leaves only the original retained/current version, records a failed attempt, removes the unreferenced output, and preserves source bytes.
- Lost commit acknowledgement is reconciled before deleting output. A committed version and its binary survive. If reconciliation cannot reach the database, protected output is deliberately retained; automatic orphan reconciliation during a database outage is not implemented.
- Initial selection reuses the imported original ID in a transaction when an upgraded asset has null selection. No second original is synthesized; migration 0004 is unchanged. New imports select their original inside the import transaction.
- Revert waits for the saved selection before updating memory or acknowledging HTTP success. Cross-owner, cross-asset, nonexistent and partial versions cannot be selected.
- Retry uses the recorded parent and settings, including after revert and fresh-instance reload; its `retryOf` relationship and actual output ID round trip through SQL.
- Reload preserves original identity and both supported operation names. Repeated reload does not duplicate attempts.

## Selected version, protected access and UI

- Retained version rows supply the manifest for derived single-file GLBs. The existing private file route authorizes them through the owning asset; source files and dependencies remain retained separately. Cross-owner access returns 404; unauthenticated access returns 401.
- The asset repository resolves selected preview file, byte size and analysis from the same saved version. The report refreshes and remounts its viewer after apply/revert. Library metrics follow selection too.
- Controls show the current version, operation outcomes, measured comparison table and a separate comparison preview. Failed HTTP and network requests report errors and release the busy state.
- Supported processor fixtures preserve required material extensions, base color, clearcoat parameters and animation. Unknown optional/required extensions and missing images are rejected. Outputs are reopened and reanalyzed before promotion.

## Earlier executed checks

| Command | Result |
| --- | --- |
| `rtk proxy pnpm test` | 23 files passed; **131 tests passed, 1 skipped** |
| `rtk proxy pnpm exec tsc --noEmit --incremental false` | Passed |
| `rtk proxy pnpm lint` | Passed |
| `rtk proxy pnpm build` | Passed (Next.js 16.3.5) |
| `rtk proxy pnpm test:e2e` | **1 smoke passed, 1 owner workflow skipped** |
| `rtk git diff --check` | Passed |

The skipped unit test is the optional private Mega Wyvern fixture (`YGGDRASIL_PRIVATE_FIXTURE_DIR` is not configured). The suite emits the existing Three.js CommonJS deprecation warning. Playwright emits color-environment warnings.

Focused red/green runs covered adapter rollback/backfill/provenance, delayed selection, recorded-parent retry, material fidelity, actual route wiring and UI error recovery. The final full suite includes these tests.

Graph refresh completed through the installed Python module with `PYTHONHASHSEED=0` after the Windows launcher failed: 682 nodes, 1,377 edges. Graphify reports a missing optional SQL parser; this does not affect executed migration/SQL tests.

## Earlier acceptance gaps, closed by the isolated gate above

At the earlier fixture-only checkpoint, `e2e/import-flow.spec.ts` contained the owner import/apply/compare/failed-promotion/revert/retry/reopen workflow but was skipped because the isolated database variable was unset. The isolated owner browser run above executed it successfully.

At that checkpoint, external PostgreSQL, process-restart durability, and the authenticated browser workflow were unverified. The temporary PostgreSQL cluster and built-app gate above verify those paths locally; a Neon service run is not claimed.
