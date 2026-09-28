# Task 4.2 — Imported clips and bone mapping

**Status:** [x] Accepted 2026-09-26. **Depends on:** Task 4.1.

**Outcome:** The owner can import an additional compatible animation and preview bone/track mapping before attaching it to a project.

**Work:** Validate format and clip content; compare skeleton hierarchy, bone names, rest pose/transform assumptions, and morph targets. Present matched, missing, and ambiguous targets with a manual mapping choice where safe. Reject incompatible clips without changing the project; preserve the imported source separately.

**Acceptance:**

- [x] Compatible fixture attaches and animates the intended rig.
- [x] Missing/ambiguous bone cases identify exact targets and require resolution or rejection.
- [x] A failed import leaves project and existing clips unchanged.
- [x] Attached mappings persist and reload reproducibly.

**Likely touchpoints:** import validation/storage, animation binding records, dark editor mapping UI. **Evidence to record:** compatible/incompatible fixture tests and assumptions.

## Acceptance evidence — 2026-09-26

- The editor accepts self-contained GLB/glTF or a typed JSON animation manifest up to 8 MB. It previews exact source-to-target mappings against the retained project asset version. The API re-parses the original bytes, reconstructs mapped tracks, and rejects mismatched client data before storing anything. Source bytes are kept privately under the project; snapshot revisions contain a SHA-256 and the mapped keyframes. The first animation in a GLB/glTF is currently imported; choosing among multiple source clips is a future extension.
- Focused tests cover a compatible Bone mixer binding, reconstruction of component tracks after JSON reload, dotted names, ambiguous candidate resolution, missing targets, bone/non-bone and hierarchy rejection, rest-transform warning, GLB parsing, owner denial, tampered payload rejection, unchanged existing clips/revision after failure, and staged-byte cleanup on stale revision.
- The authenticated production browser gate attached a generated GLB to the retained model. Scrub endpoints changed the pose by a mean channel difference of **1.85**. Reload retained `Animated_Triangle` mapping and the private imported source SHA-256 `268fba774ccfa7a98096ad21dc4f32cab437964cbfd357aedca1096e1a4cb05e`. A missing target disabled attachment; a tampered direct API import returned 400 and left the revision and clip count unchanged. The original model SHA-256 stayed `cc8470d738c5991504a129d2231056a1a7189e00f429f9749b1f2e0414e9d792`.
- Final code gate: `pnpm test` **52 files, 251 passed, 1 pre-existing optional private-fixture skip**; `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. `pnpm exec tsx scripts/with-isolated-postgres.ts exec tsx scripts/restart-import-gate.ts` created and migrated an empty database, passed import/optimization/project/appearance/scene/interactions/embedded/imported/framing/owner gates, and removed the database afterward. No source asset was rewritten.
- Final review on 2026-09-28 added a failing-then-passing regression test for manually selecting a non-bone target for a source bone. Candidate-specific rig checks now run after manual resolution. `pnpm test` reported **52 files, 252 passed, 1 existing optional skip**; lint, typecheck, build, and diff checks passed. The authenticated production import gate repeated the 1.85 pose difference, private source hash, rejection paths, owner isolation, and unchanged original hash; its isolated database was removed. An existing sign-up navigation race surfaced in the separate Playwright suite, so the successful auth path now performs a full navigation. The isolated Playwright run with one worker then reported **2 passed** and removed its database.
- `graphify update .` through the installed Windows wrapper still reports a missing `graphify` script despite exit code 0. Calling the installed package's `graphify.__main__.main()` with `PYTHONHASHSEED` set rebuilt the graph: **1,133 nodes, 2,722 edges, 68 communities**. The refreshed `graph.json` timestamp and 21 nodes sourced from `imported-clips.ts` were checked directly.
