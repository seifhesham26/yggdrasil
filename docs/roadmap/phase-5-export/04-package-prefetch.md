# Task 5.4 — Downloadable package and loading policies

**Status:** [ ] Planned. **Depends on:** Tasks 5.1–5.3.

**Outcome:** The owner can download a complete, validated bundle and choose when its models, textures, and opening animations load.

**Work:** Assemble source-independent assets, runtime code, typed config, docs, dependency/license manifests, and attribution. Implement four policies: `on-demand`, `metadata-first`, `critical-assets`, and `full-preload`. Let the owner mark critical files; include preload hints, progress events, loading UI hooks, error fallbacks, and lazy loading for noncritical resources. Validate archive paths and output completeness.

**Acceptance:**

- [ ] Each policy's request order is demonstrated in a sample site with network tests.
- [ ] Bundle unpacks safely and runs without Yggdrasil, Neon, or a machine-local path.
- [ ] Referenced files, entry points, docs, and attribution are complete before artifact status becomes ready.
- [ ] Browser tests cover download/reopen and failure/retry; full quality suite passes.

**Evidence to record:** independent sample run, network trace, archive/security checks, documentation and commit.
