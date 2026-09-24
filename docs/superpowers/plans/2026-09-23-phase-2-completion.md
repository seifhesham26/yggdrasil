# Phase 2 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Complete and prove reversible optimization without replacing source uploads.

**Architecture:** Extend the existing optimization domain/application boundaries and Drizzle schema rather than adding a parallel optimization system. Persist versions and operations behind owner-scoped services, then cover the owner workflow through protected routes and browser fixtures. Keep all binary work in temporary protected storage during tests.

**Tech Stack:** Next.js 16, React 19, TypeScript, Drizzle ORM/Postgres schema, Vitest, Playwright, existing glTF Transform analyzer/processors.

**Spec:** `docs/superpowers/specs/2026-09-22-yggdrasil-design.md`

## Global Constraints

- Preserve source uploads and original hashes; every modification is a separate derived version.
- Require the owner session for mutations and private files.
- Keep binary assets in protected storage and structured state in Neon/Drizzle.
- Failed work must be retryable and must never promote an invalid output.
- Use generated fixtures and temporary storage; never modify real owner data.

## Review Focus

- Restart/reopen: persisted version lineage must reload by ID after a fresh repository instance.
- Failure promotion: processor failure must leave the previous current version and source bytes unchanged.
- Operation coverage: supported operations must validate outputs; unsupported inputs must produce warnings/errors without unsafe controls.
- Browser recovery: apply, compare, revert, failed retry, and reopen must reflect persisted state.
- Privacy: cross-owner version, operation, and file access must be denied.

### Task 2.2: Persisted derived versions

**Files:** existing asset schema/repository/application files and focused tests; add only the smallest migration required.

**Interfaces:** preserve existing `ReversibleOptimizationHistory` behavior while adding a Drizzle-backed persistence boundary for versions, current-version selection, and operation attempts.

- [ ] Add failing tests for fresh-instance reload, successful lineage, failed promotion, source hash preservation, and owner scoping.
- [ ] Implement the minimum transactional persistence and migration.
- [ ] Run focused tests, then the full Vitest suite.
- [ ] Record migration and test evidence in Phase 2 task/evidence files.
- [ ] Commit the task.

### Task 2.3: Complete operation contract

**Files:** existing optimization domain/processor/application modules and tests; add focused processors only for operations supported by installed dependencies.

**Interfaces:** keep approval-required operation requests and explicit unsupported-operation results.

- [ ] Add failing fixture tests for every supported positive operation and each rejected/unsupported case.
- [ ] Implement validation, output reopening/reanalysis, measured metrics, and failure cleanup.
- [ ] Run focused tests, then the full Vitest suite.
- [ ] Record supported operations and fidelity caveats in the task/evidence files.
- [ ] Commit the task.

### Task 2.4: Comparison, recovery, and browser acceptance

**Files:** protected optimization routes/UI, browser fixtures, route/application tests, phase documentation.

**Interfaces:** expose owner-scoped version comparison, operation history, current-version revert, retryable failure state, and reopen behavior without deleting later history.

- [ ] Add failing route/browser tests for apply, compare, revert, failed retry, and reload.
- [ ] Implement the smallest protected UI/API flow using existing auth and storage boundaries.
- [ ] Run browser tests plus unit, typecheck, lint, and build checks.
- [ ] Update all Phase 2 checkboxes, README status, and EVIDENCE.md with commands/results.
- [ ] Commit the complete Phase 2 gate.

