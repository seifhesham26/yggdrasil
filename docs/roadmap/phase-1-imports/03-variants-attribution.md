# Task 1.3 — Variants and attribution

**Status:** [ ] In progress. **Depends on:** Tasks 1.1–1.2.

**Outcome:** A source package with multiple candidate models, textures, thumbnail images, and license text is presented as one reviewable import with an explicit chosen variant and retained attribution.

**Work:** Inventory candidate entry points and dependency sets; let the owner choose the primary model while preserving alternates; display provenance and license files before confirmation. Persist variant relationships and attribution without inferring a redistribution license. Keep relative paths stable and scoped to the package.

**Acceptance:**

- [ ] A multi-variant folder shows all candidates and the resources each needs.
- [ ] The selected variant previews; switching variants does not mutate originals.
- [ ] License/credit text survives import and is available for later export.
- [ ] Missing or ambiguous attribution is labeled unknown, never auto-approved.

**Likely touchpoints:** import manifest, asset repository/schema, import review UI. **Evidence to record:** package fixtures, selection and provenance tests.

**Current evidence:** A multi-model package reports its candidate paths, and the owner browser can select a primary model. The selected path is persisted on the import job and becomes the preview version; alternate originals, dependencies, and license text remain protected files. The isolated PostgreSQL browser gate passed. Candidate dependency sets and attribution status are not yet shown before confirmation, and the owner cannot switch the selected variant after import. See [evidence](EVIDENCE.md).
