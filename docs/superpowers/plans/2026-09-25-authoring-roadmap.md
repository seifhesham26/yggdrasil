# Yggdrasil Authoring Roadmap Implementation Plan

> **For agentic workers:** Use the repository's test-first and verification workflows. This plan is executed in the current checkout; do not create a branch, commit, or push.

**Goal:** Deliver owner-scoped, durable authoring from project creation through appearance, scene, and safe interactions, then proceed to animation and export as independently testable increments.

**Architecture:** Keep immutable asset versions and source files separate from project snapshots. Server routes enforce owner access and validate every snapshot; the editor holds pending edits locally until a save response confirms persistence. The viewer applies snapshot overrides to a disposable scene clone and reports stable node references to the controls.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle/PostgreSQL, Zod, React Three Fiber, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-yggdrasil-design.md`; task criteria in `docs/roadmap/phase-3-authoring/` through `phase-5-export/`.

## Global Constraints

- Preserve original asset bytes, retained versions, private files, and owner checks.
- Work directly in the uncommitted main checkout without commits or pushes.
- Read the installed Next.js documentation before changing its routes or pages.
- Run `graphify update .` after code changes; record exact evidence and gaps.

## Review Focus

- A failed save must leave edits visible and retryable, with no false saved indicator.
- Step changes and undo/redo must not silently discard pending edits.
- A project must remain bound to its retained asset version when the library selection changes.
- Duplicate or renamed scene nodes must not redirect an override to another object.
- Missing interaction or animation targets must warn and skip safely.

## Task 3.1: Durable project workflow

**Files:** project repository/API, asset detail project launcher, `src/app/(studio)/projects/[projectId]/page.tsx`, `src/features/projects/ui/`, and focused unit/browser tests.

- [x] Test owner-scoped project listing, creation, opening, and retained-version binding; implement and verify.
- [x] Test local edit, explicit save, step change, and retry on network/database failure; implement and verify.
- [x] Test first-save undo, redo, branch save, persistence after app restart, and cross-owner denial in an isolated browser/database run.
- [x] Run the full suite, update Task 3.1 evidence, and accept only if all four criteria have evidence.

## Task 3.2: Appearance

**Files:** viewer clone/selection adapter, editor controls, project snapshot validation, focused tests.

- [x] Test stable node inventory and hierarchy/viewport selection with duplicate names.
- [x] Test transform, visibility, color, opacity, PBR overrides and individual resets on a scene clone.
- [x] Test reload persistence, wrong-target protection, and original source hash preservation in browser.

## Task 3.3: Scene

**Files:** editor scene controls/viewer, schema, focused tests.

- [x] Test valid ranges, field feedback, camera reset/framing, lighting/background, and saved view reload.
- [x] Test tablet/mobile width and reduced motion in browser.

## Task 3.4: Interactions

**Files:** structured interaction editor/preview, validation, focused tests.

- [x] Test allowlisted click/hover/hotspot/annotation/camera actions and missing targets.
- [x] Test editing isolation from preview, script rejection, undo, reload, and browser execution.

## Phase 4: Animation

- [x] Ship embedded clip inventory and project-only clip edits with deterministic playback and persistence.
- [ ] Ship compatible imported clips with explicit mapping and rollback tests.
- [ ] Ship sequence/blend semantics and timeline editing with trigger, reduced-motion, and teardown coverage.

## Phase 5: Export

- [ ] Validate and freeze a portable manifest with owner-scoped asset resolution and retryable failures.
- [ ] Build independent React and embed consumers and test behavior against the editor preview.
- [ ] Package all assets, attribution, docs, and loading policies; verify independent unpack/run and network order.
