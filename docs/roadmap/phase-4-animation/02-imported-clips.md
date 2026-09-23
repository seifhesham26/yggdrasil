# Task 4.2 — Imported clips and bone mapping

**Status:** [ ] Planned. **Depends on:** Task 4.1.

**Outcome:** The owner can import an additional compatible animation and preview bone/track mapping before attaching it to a project.

**Work:** Validate format and clip content; compare skeleton hierarchy, bone names, rest pose/transform assumptions, and morph targets. Present matched, missing, and ambiguous targets with a manual mapping choice where safe. Reject incompatible clips without changing the project; preserve the imported source separately.

**Acceptance:**

- [ ] Compatible fixture attaches and animates the intended rig.
- [ ] Missing/ambiguous bone cases identify exact targets and require resolution or rejection.
- [ ] A failed import leaves project and existing clips unchanged.
- [ ] Attached mappings persist and reload reproducibly.

**Likely touchpoints:** import validation/storage, animation binding records, dark editor mapping UI. **Evidence to record:** compatible/incompatible fixture tests and assumptions.
