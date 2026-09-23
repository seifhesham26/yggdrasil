# Yggdrasil — later-phase task ledger

This ledger covers the five workstreams **after** the current foundation/import/analysis milestone. The current milestone's remaining browser acceptance task stays in its [existing plan](../superpowers/plans/2026-09-22-foundation-import-analysis.md); it is intentionally not duplicated here.

Status key: `[ ]` planned, `[x]` complete. Nothing in this ledger is implemented yet. Check off a task only after its acceptance criteria pass and record the evidence in that task file. Complete each phase as a working, independently testable increment before starting the next.

| Phase | Scope | Tasks | Status |
| --- | --- | --- | --- |
| [1 — Broader imports](phase-1-imports/README.md) | FBX/OBJ, large packages, variants, attribution, jobs | 4 | Planned |
| [2 — Reversible optimization](phase-2-optimization/README.md) | Recommendations, versions, comparison, history | 4 | Planned |
| [3 — Visual authoring](phase-3-authoring/README.md) | Appearance, scene, interactions, saved project state | 4 | Planned |
| [4 — Animation studio](phase-4-animation/README.md) | Embedded/imported clips, mapping, blending, GSAP | 4 | Planned |
| [5 — Export](phase-5-export/README.md) | React, embed, package, prefetch policies | 4 | Planned |

The [approved design](../superpowers/specs/2026-09-22-yggdrasil-design.md) defines product behavior. These are scoped task briefs, not implementation-ready API contracts. Before executing a phase, inspect the then-current code and dependency documentation, resolve open design choices, and write a detailed implementation plan with tests. Do not treat suggested file areas as promised paths.

Across every phase: preserve source uploads, require the owner session for mutations and private files, use Neon/Drizzle for structured state, keep binary assets in protected storage, support retryable failures, and verify browser behavior. The private Mega Wyvern model stays local unless its redistribution license permits committing it. Its verified camera count is **zero**, correcting the older design text.
