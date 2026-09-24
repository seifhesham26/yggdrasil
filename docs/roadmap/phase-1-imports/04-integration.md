# Task 1.4 — Import integration and recovery

**Status:** [x] Accepted on 2026-09-24. **Depends on:** Tasks 1.1–1.3.

**Outcome:** The broader import flow is usable end to end, including failure recovery, without weakening the existing GLTF/GLB path.

**Work:** Exercise browser paths for file, folder, and ZIP; verify database/file consistency, conversion warnings, job progress, variant selection, and reopening after app restart. Document supported/unsupported format features and operational limits. Run the full quality suite and private Mega Wyvern check locally if available.

**Acceptance:**

- [x] Browser tests cover successful FBX, OBJ, and ZIP imports plus an interrupted retry.
- [x] Original package hashes match input; incomplete jobs are distinguishable from completed assets.
- [x] Existing GLTF/GLB import tests and viewer checks still pass.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build` pass.

**Evidence to record:** exact commands/results, known format limitations, documentation link, commit.

**Current evidence:** The isolated owner Playwright flow passes for glTF, CC0 FBX and OBJ packages, ZIP source retention, a 64 MiB archive, variant review and switching, and optimization recovery. A separate Windows gate restarts the built app with an expired staged job, verifies browser resume, exactly one asset, and unchanged source hash; it then restarts again and reopens a derived optimization version. All five quality commands passed. See [exact evidence](EVIDENCE.md) and [local development](../../development.md).
