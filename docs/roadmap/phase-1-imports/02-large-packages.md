# Task 1.2 — Large-package streaming and jobs

**Status:** [x] Accepted on 2026-09-24. **Depends on:** Task 1.1's conversion boundary.

**Outcome:** Large folders and ZIP packages process without buffering the whole upload in browser or server memory, with visible progress, cancellation, retry, and logs.

**Work:** Set and document size/expansion limits; stream to temporary protected storage; validate archive entry paths, symlinks, file types, and decompression ratios before promotion. Persist job states and checkpoints, and isolate processing behind an interface that can later move to a worker. Establish cleanup/reconciliation for interrupted jobs.

**Acceptance:**

- [x] Size and ZIP-bomb cases fail within bounded memory/disk use.
- [x] Progress reflects actual bytes and processing stage; cancellation cleans temporary files.
- [x] Restart/retry from a safe boundary neither duplicates assets nor overwrites originals.
- [x] Tests cover traversal, absolute paths, symlinks, and interrupted uploads.

**Likely touchpoints:** storage adapter, import route/service, Drizzle job records, guided import UI. **Evidence to record:** tested limits, peak memory, retry behavior.
