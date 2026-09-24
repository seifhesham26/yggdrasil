# Task 2.2 — Derived asset versions

**Status:** In progress; local SQL/fixture checks pass, external restart acceptance is open. **Depends on:** Task 2.1.

**Outcome:** Every modification creates a separate, traceable asset version; the immutable source package is never replaced.

**Work:** Define version lineage, storage manifests, current-version selection, and atomic database/file promotion. Capture tool/version and input/output hashes. Ensure failure leaves the prior usable version active. Scope version reads and mutations to the owner.

**Acceptance:**

- [x] A successful operation creates a new version linked to its parent/source (embedded PostgreSQL).
- [x] Failed output never becomes current; all five promotion write failures roll back. Cancellation is not exposed.
- [x] Original bytes/hashes remain identical through operations, failed writes, revert and retry fixtures.
- [ ] Restarting the app reopens every retained version by ID.

**Likely touchpoints:** `src/db/schema/assets.ts`, asset repository, local storage, protected file route. **Evidence to record:** migration, transaction/failure tests.

See [current evidence](EVIDENCE.md). Fresh adapter/history reload is covered against real SQL; external PostgreSQL process restart is not claimed. Null selections are backfilled transactionally from the existing original, without changing migration 0004.
