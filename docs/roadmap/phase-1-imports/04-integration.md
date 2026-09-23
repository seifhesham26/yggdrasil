# Task 1.4 — Import integration and recovery

**Status:** [ ] Planned. **Depends on:** Tasks 1.1–1.3.

**Outcome:** The broader import flow is usable end to end, including failure recovery, without weakening the existing GLTF/GLB path.

**Work:** Exercise browser paths for file, folder, and ZIP; verify database/file consistency, conversion warnings, job progress, variant selection, and reopening after app restart. Document supported/unsupported format features and operational limits. Run the full quality suite and private Mega Wyvern check locally if available.

**Acceptance:**

- [ ] Browser tests cover successful FBX, OBJ, and ZIP imports plus an interrupted retry.
- [ ] Original package hashes match input; incomplete jobs are distinguishable from completed assets.
- [ ] Existing GLTF/GLB import tests and viewer checks still pass.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build` pass.

**Evidence to record:** exact commands/results, known format limitations, documentation link, commit.
