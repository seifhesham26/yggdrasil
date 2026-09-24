# Task 1.3 — Variants and attribution

**Status:** [x] Accepted on 2026-09-24. **Depends on:** Tasks 1.1–1.2.

**Outcome:** A source package with multiple candidate models, textures, thumbnail images, and license text is presented as one reviewable import with an explicit chosen variant and retained attribution.

**Work:** Inventory candidate entry points and dependency sets; let the owner choose the primary model while preserving alternates; display provenance and license files before confirmation. Persist variant relationships and attribution without inferring a redistribution license. Keep relative paths stable and scoped to the package.

**Acceptance:**

- [x] A multi-variant folder shows all candidates and the resources each needs.
- [x] The selected variant previews; switching variants does not mutate originals.
- [x] License/credit text survives import and is available for later export.
- [x] Missing or ambiguous attribution is labeled unknown, never auto-approved.

**Likely touchpoints:** import manifest, asset repository/schema, import review UI. **Evidence to record:** package fixtures, selection and provenance tests.

**Current evidence:** The staged review lists each model, referenced resources, missing or incompatible inputs, applicable credit files, and attribution status before confirmation. The selected path persists on the job. An owner-scoped switch creates another preview version from retained source bytes and leaves the original files and version history intact. The browser opens both variants after reload and the protected license file remains downloadable. See [exact evidence](EVIDENCE.md).
