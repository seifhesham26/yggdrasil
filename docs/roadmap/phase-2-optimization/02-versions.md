# Task 2.2 — Derived asset versions

**Status:** Accepted for retained source and derived versions. **Depends on:** Task 2.1.

**Outcome:** Every modification creates a separate, traceable asset version; the immutable source package is never replaced.

**Work:** Define version lineage, storage manifests, current-version selection, and atomic database/file promotion. Capture tool/version and input/output hashes. Ensure failure leaves the prior usable version active. Scope version reads and mutations to the owner.

**Acceptance:**

- [x] A successful operation creates a new version linked to its parent/source (embedded PostgreSQL).
- [x] Failed output never becomes current; all five promotion write failures roll back. Cancellation is not exposed.
- [x] Original bytes/hashes remain identical through operations, failed writes, revert and retry fixtures.
- [x] Restarting the app reopens the original and derived version by ID in the acceptance fixture.

**Likely touchpoints:** `src/db/schema/assets.ts`, asset repository, local storage, protected file route. **Evidence to record:** migration, transaction/failure tests.

See [current evidence](EVIDENCE.md). The built-app process restart gate reopened both retained version IDs through isolated PostgreSQL and verified the source hash. Null selections are backfilled transactionally from the existing original, without changing migration 0004.
