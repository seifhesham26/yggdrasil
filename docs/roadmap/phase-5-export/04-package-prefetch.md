# Task 5.4 — Downloadable package and loading policies

**Status:** [x] Accepted on 2026-09-28. **Depends on:** Tasks 5.1–5.3.

**Outcome:** The owner can download a complete, validated bundle and choose when its models, textures, and opening animations load.

**Work:** Assemble source-independent assets, runtime code, typed config, docs, dependency/license manifests, and attribution. Implement four policies: `on-demand`, `metadata-first`, `critical-assets`, and `full-preload`. Let the owner mark critical files; include preload hints, progress events, loading UI hooks, error fallbacks, and lazy loading for noncritical resources. Validate archive paths and output completeness.

**Acceptance:**

- [x] Each policy's request order is demonstrated in a sample site with network tests.
- [x] Bundle unpacks safely and runs without Yggdrasil, Neon, or a machine-local path.
- [x] Referenced files, entry points, docs, and attribution are complete before artifact status becomes ready.
- [x] Browser tests cover download/reopen and failure/retry; full quality suite passes.

**Evidence to record:** independent sample run, network trace, archive/security checks, documentation and commit.

**Evidence (2026-09-28):** The owner can save one of four loading policies and select critical files from the exact portable file list. The frozen package job builds a ZIP with independent `react/` and `embed/` examples, original asset bytes in both, typed manifest, entry points, README files, dependency and direct-license manifests, attribution, and safe paths. The builder checks all referenced files, required entries, reserved Windows names, and case-insensitive path collisions before publishing a ready artifact. Missing installed dependency license metadata is labeled **Check after installation**; asset redistribution terms remain the publisher's responsibility.

`pnpm exec tsx scripts/package-export-gate.ts` unpacked each package into a separate temporary directory and served its embed sample without Yggdrasil or database access. Browser request traces were: `on-demand` manifest → click → model → bin; `metadata-first` manifest → model → bin; `critical-assets` manifest → bin → model → bin; `full-preload` manifest → model → bin → model → bin. The sample also verified an error fallback and successful model-load retry. Preload hints and progress events are emitted for the selected critical or full file set. Opening animations begin after model load; noncritical dependencies load with the model. Every asset copy matched its source SHA-256, and the manifest security scan found no source storage keys, database URLs, auth secret names, or machine-local paths.

The authenticated isolated production restart gate saved `critical-assets` with `assets/model.glb`, downloaded and reopened the same package bytes, verified both bundled GLB copies against retained SHA-256 `2e9281270cbce4c5e3f0616c1753c23cde5261dbb1a3467b51eed307c7ab3dd7`, forced a failed package build with no artifact, retried successfully, and reconfirmed original source SHA-256 `cc8470d738c5991504a129d2231056a1a7189e00f429f9749b1f2e0414e9d792`. Its isolated database was removed. `pnpm test`: **58 files, 271 passed, 1 existing optional skip**. Lint, typecheck, Next.js 16.3.5 build, and diff check passed. The React independent install/build/browser gate and embed cross-origin browser gate passed after the loading runtime changes. The separate isolated Playwright suite reported **2 passed** and removed its database. Graphify rebuilt **1,354 nodes** with package source nodes. No acceptance gap remains for Task 5.4.
