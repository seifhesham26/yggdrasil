# Task 5.1 — Export representation and validation

**Status:** [ ] Planned. **Depends on:** Phase 4.

**Outcome:** All export targets share a validated, portable representation of the selected asset version, scene/appearance, interactions, animation, attribution, and loading policy.

**Work:** Define a versioned manifest/schema and export-target boundary. Resolve every referenced file and reject missing/private-only paths before marking an artifact ready. Freeze a project snapshot per export job so ongoing editing does not change the output mid-build. Include provenance and license text when available; warn when attribution is unknown.

**Acceptance:**

- [ ] Valid project serializes and revalidates with stable file references.
- [ ] Missing assets, unsupported actions, and incompatible configuration fail before publication.
- [ ] Manifest and generated files contain no Neon URL, Better Auth secret, or machine-local absolute path.
- [ ] Export failure leaves a retryable job, not a falsely ready artifact.

**Likely touchpoints:** project service/schema, protected storage, export jobs/artifact records. **Evidence to record:** manifest version, validation tests, security scan.
