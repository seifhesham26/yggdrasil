# Task 5.3 — Embed viewer target

**Status:** [ ] Planned. **Depends on:** Task 5.1.

**Outcome:** Export an embeddable viewer and serializable configuration suitable for websites that do not import the React component directly.

**Work:** Define the embed contract, asset URLs, initialization/configuration, lifecycle teardown, host-page events, and safe interaction messaging. Keep the exported viewer self-contained and free of authenticated Yggdrasil dependencies. Test same-origin and cross-origin hosting constraints with documented expectations.

**Acceptance:**

- [ ] Standalone sample page loads the viewer and its local export assets.
- [ ] Resize, mount/unmount, errors, interactions, and animations behave predictably.
- [ ] Host messaging cannot invoke arbitrary code or expose private application data.
- [ ] Reduced-motion and keyboard accessibility remain functional.

**Likely touchpoints:** export target/runtime, sample HTML consumer, browser tests. **Evidence to record:** embed instructions and supported hosting model.
