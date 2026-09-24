# Phase 2 — Reversible optimization

**Status:** Accepted on 2026-09-24. **Depends on:** Phase 1 accepted.

Goal: explain web-performance risks and offer owner-approved, non-destructive improvements. No optimization runs automatically on import.

Findings, version persistence, the complete supported operation set, comparison/recovery, isolated PostgreSQL, authenticated browser, and built-app restart checks pass. Remaining limitations are recorded in [the current evidence and follow-up ledger](EVIDENCE.md).

- [x] [2.1 — Findings and recommendations](01-recommendations.md)
- [x] [2.2 — Derived asset versions](02-versions.md)
- [x] [2.3 — Optimization operations](03-operations.md)
- [x] [2.4 — Comparison, history, and recovery](04-comparison-history.md)

**Phase exit:** The owner can inspect a recommendation's reason, estimated benefit, visual/compatibility trade-off, and affected resources; apply it to a new version; compare versions; and return to a previous version. Original bytes remain unchanged.

Source: [approved design](../../superpowers/specs/2026-09-22-yggdrasil-design.md), “Optimize” and “Error Handling and Recovery.”
