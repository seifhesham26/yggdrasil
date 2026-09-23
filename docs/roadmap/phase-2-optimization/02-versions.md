# Task 2.2 — Derived asset versions

**Status:** [ ] Planned. **Depends on:** Task 2.1.

**Outcome:** Every modification creates a separate, traceable asset version; the immutable source package is never replaced.

**Work:** Define version lineage, storage manifests, current-version selection, and atomic database/file promotion. Capture tool/version and input/output hashes. Ensure failure leaves the prior usable version active. Scope version reads and mutations to the owner.

**Acceptance:**

- [ ] A successful operation creates a new version linked to its parent/source.
- [ ] Failed or canceled output never becomes the current version.
- [ ] Original hashes remain identical before and after multiple operations.
- [ ] Restarting the app reopens every retained version by ID.

**Likely touchpoints:** `src/db/schema/assets.ts`, asset repository, local storage, protected file route. **Evidence to record:** migration, transaction/failure tests.
