# Large-package import jobs implementation plan

**Goal:** Import folders and ZIPs through a bounded, durable workflow with byte progress, cancellation, retry, and restart recovery.

**Architecture:** The browser sends native `File` objects without calling `arrayBuffer()`. The Node route streams multipart parts into owner-scoped temporary storage, with hard compressed, expanded, file-count, and per-file limits. A PostgreSQL job record owns the upload and processing checkpoints. Existing source validation, converter, analyzer, and atomic asset promotion remain the final boundary; source binaries stay unchanged.

**Spec:** `docs/roadmap/phase-1-imports/02-large-packages.md` and `docs/superpowers/specs/2026-09-22-yggdrasil-design.md`.

## Constraints and review focus

- Only the authenticated owner can create, read, cancel, or retry a job. Private source files remain under `YGGDRASIL_ASSET_ROOT`.
- A rejected upload or ZIP never creates a ready asset. Failed and canceled jobs remain distinguishable from ready assets.
- The browser upload does not materialize entire files in JavaScript memory; server receiving and ZIP expansion write chunks to disk before conversion.
- Enforce counts and byte limits while reading, even when `Content-Length` or ZIP metadata lies. Reject traversal, absolute paths, case-folded duplicates, symlinks, encrypted entries, and decompression bombs.
- A restart resumes at a recorded safe boundary. Repeating a commit uses the existing asset instead of duplicating it or deleting its retained source.
- Test only against generated/CC0 fixtures and the empty isolated PostgreSQL cluster. Never point tests at configured owner data or storage.

## Task A: Stream uploads and enforce package limits

- [ ] Add a streaming multipart parser and owner-scoped temporary file storage, with explicit maximum request, file, count, and field sizes. Test an understated `Content-Length`, interrupted body, path traversal, and a limit violation while bytes are still arriving. Verify temp cleanup.
- [ ] Send native browser `File` objects directly in `FormData`; report actual uploaded bytes and allow abort. Keep the existing small import route response contract.
- [ ] Add file-backed source inputs to manifest validation and import staging so accepted packages are not accumulated as one `Uint8Array[]`. Keep byte-backed inputs for current unit tests. Hash while copying source bytes.

## Task B: Expand ZIPs on disk within limits

- [ ] Replace eager ZIP expansion for the streamed path with one-entry-at-a-time extraction into the same temp tree. Preflight central directory metadata, then enforce actual expanded bytes while writing.
- [ ] Test legal ZIP, too many entries, a forged size, high ratio, absolute/traversal path, symlink, encrypted entry, and an interrupted stream. Verify original ZIP hash and exact bytes remain retained.

## Task C: Persist and drive jobs

- [ ] Add a Drizzle migration and repository operations for job owner, stage, byte counts, selected input, checkpoint, error, asset ID, and timestamps. Test ownership and transaction behavior with migrated isolated PostgreSQL.
- [ ] Add status, cancel, and retry routes. Processing records stage transitions and checks cancellation between files and before promotion. Reconcile jobs left running after process restart from their retained temporary files.
- [ ] Show byte progress, processing phase, actionable errors, cancel and retry in the import UI. A completed response links the single ready asset.

## Task D: Acceptance and integration

- [ ] Browser import file, folder, and ZIP fixtures through the job path; interrupt one transfer, retry, restart the app process, and reopen the resulting asset. Assert source hashes, no duplicate asset, and incomplete-vs-ready state.
- [ ] Run focused tests, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e`, `pnpm build`, and a Ponytail diff review. Run `graphify update .` with `PYTHONHASHSEED=0`, record exact evidence in Task 1.2, and commit focused increments. Check Task 1.2 only after every acceptance criterion has evidence.

## Rulings

- Execute in this checkout because the user explicitly requested it; do not create a worktree or another task.
- The already approved roadmap supplies scope and the user explicitly authorized autonomous implementation, so this plan proceeds without another review gate.
