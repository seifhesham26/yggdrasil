# Task 2.4 — Comparison, history, and recovery

**Status:** Accepted for the implemented normalization and remove-unused operations. **Depends on:** Tasks 2.1–2.3.

**Outcome:** The owner can compare source and derived versions, inspect applied operations, and revert the selected version without destroying history.

**Work:** Show before/after file size and technical metrics with a side-by-side or switchable preview. Record operation parameters, time, warnings, and outcome. Revert by changing the selected version reference, not deleting source files. Add browser coverage for apply, compare, revert, and reopen.

**Acceptance:**

- [x] Comparison clearly distinguishes estimates from measured results (component tests).
- [x] Revert restores a prior preview/configuration while retaining later versions in history.
- [x] Failed operations are visible with retry information but do not appear as valid versions.
- [x] Full lint, typecheck, unit/integration, browser, and build checks pass.

**Evidence to record:** acceptance run, sample metrics, documentation and commit.

See [current evidence](EVIDENCE.md). The owner browser applied an operation, compared versions, reverted, retried a failed promotion, and reopened the selected preview. The broader Task 2.3 operation set remains open.
