# Phase 2 optimization evidence

Last checked: 2026-09-24. **Phase acceptance remains open.**

## Verified scope

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

## Executed checks

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

## Acceptance still required

`e2e/import-flow.spec.ts` now contains the full owner import/apply/compare/failed-promotion/revert/retry/reopen workflow, source-byte verification, derived file fetches and viewer-version assertions. It requires an explicitly configured **empty, isolated** `YGGDRASIL_E2E_DATABASE_URL`, all migrations applied, and a PostgreSQL role able to create the temporary failure trigger. It was skipped here because that variable is unset; the main database opt-in is also unset. It is a present but unexecuted acceptance test, not a missing test or a passing workflow.

The external PostgreSQL/Neon driver, process-restart durability and authenticated browser workflow remain unverified. Embedded PostgreSQL and route/component tests do not close those gates. No commit was made; coordinator review and commit remain pending.
