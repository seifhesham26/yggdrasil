# Task 5.1 — Export representation and validation

**Status:** [x] Accepted on 2026-09-28. **Depends on:** Phase 4.

**Outcome:** All export targets share a validated, portable representation of the selected asset version, scene/appearance, interactions, animation, attribution, and loading policy.

**Work:** Define a versioned manifest/schema and export-target boundary. Resolve every referenced file and reject missing/private-only paths before marking an artifact ready. Freeze a project snapshot per export job so ongoing editing does not change the output mid-build. Include provenance and license text when available; warn when attribution is unknown.

**Acceptance:**

- [x] Valid project serializes and revalidates with stable file references.
- [x] Missing assets, unsupported actions, and incompatible configuration fail before publication.
- [x] Manifest and generated files contain no Neon URL, Better Auth secret, or machine-local absolute path.
- [x] Export failure leaves a retryable job, not a falsely ready artifact.

**Likely touchpoints:** project service/schema, protected storage, export jobs/artifact records. **Evidence to record:** manifest version, validation tests, security scan.

**Evidence (2026-09-28):** Format version 1 freezes the saved revision, retained asset version, portable file hashes, scene, interactions, animation, attribution, and loading policy. Domain tests round-trip the schema and reject missing/changed files, unsupported actions, unsafe paths, and invalid critical assets. Repository/API tests prove owner isolation, a failed job without an artifact, and retry. The authenticated production restart gate downloaded revision 12, forced `SOURCE_UNAVAILABLE` without an artifact, retried successfully, and confirmed the original source SHA-256 `cc8470d738c5991504a129d2231056a1a7189e00f429f9749b1f2e0414e9d792`; its isolated database was removed. The manifest security scan rejected source storage keys, database URLs, auth secret names, and machine-local Windows paths. `pnpm test`: **58 files, 271 passed, 1 existing optional skip**. `pnpm lint`, `pnpm typecheck`, `pnpm build` (Next.js 16.3.5), and `git diff --check` passed. The separate isolated Playwright suite reported **2 passed** and removed its database. No test process or `yggdrasil_e2e_` database remained from the earlier lost session. After the root-only `/exports/` ignore fix, graphify rebuilt **1,292 nodes**, including **53 export source nodes**. No acceptance gap remains for the manifest target; React, embed, and downloadable bundles are Tasks 5.2–5.4.
