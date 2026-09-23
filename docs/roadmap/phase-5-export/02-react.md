# Task 5.2 — React component target

**Status:** [ ] Planned. **Depends on:** Task 5.1.

**Outcome:** Export a reusable React/Three.js component with typed configuration, required assets, loading/error hooks, and documented dependencies.

**Work:** Generate a minimal component entry point and runtime configuration that reproduces the editor's scene, interactions, and animation behavior. Package assets with portable relative references. Document integration into a separate React website and test with the project's then-current supported React/Three versions.

**Acceptance:**

- [ ] Generated component builds and renders in an independent sample React app.
- [ ] Its behavior matches a representative Yggdrasil preview, including animation and reduced-motion mode.
- [ ] Assets resolve without access to Yggdrasil's authenticated routes or local filesystem.
- [ ] Type declarations, dependency list, license/attribution, and integration instructions ship with it.

**Likely touchpoints:** export target module, packaging service, sample consumer app. **Evidence to record:** sample build/browser run and dependency versions.
