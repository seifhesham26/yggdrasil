# Task 5.3 — Embed viewer target

**Status:** [x] Accepted on 2026-09-28. **Depends on:** Task 5.1.

**Outcome:** Export an embeddable viewer and serializable configuration suitable for websites that do not import the React component directly.

**Work:** Define the embed contract, asset URLs, initialization/configuration, lifecycle teardown, host-page events, and safe interaction messaging. Keep the exported viewer self-contained and free of authenticated Yggdrasil dependencies. Test same-origin and cross-origin hosting constraints with documented expectations.

**Acceptance:**

- [x] Standalone sample page loads the viewer and its local export assets.
- [x] Resize, mount/unmount, errors, interactions, and animations behave predictably.
- [x] Host messaging cannot invoke arbitrary code or expose private application data.
- [x] Reduced-motion and keyboard accessibility remain functional.

**Likely touchpoints:** export target/runtime, sample HTML consumer, browser tests. **Evidence to record:** embed instructions and supported hosting model.

**Evidence (2026-09-28):** The `embed` job packages a self-contained `viewer.js`, `viewer.html`, `host.html`, validated manifest, relative assets, and hosting/attribution README. `mountYggdrasilViewer` exposes mount/destroy and fixed `loaded`, `progress`, `error`, and `interaction` events. Iframe events use an explicit HTTP(S) host origin; there is no incoming command or script channel. Same-origin hosting works with the sample or programmatic API; cross-origin hosts use an iframe and verify event origin/source, with all exported files hosted together. `pnpm exec tsx scripts/embed-export-gate.ts` unpacked the ZIP into a standalone HTTP server and passed cross-origin event delivery, keyboard hotspot annotation, resize, mount/destroy, error fallback, local glTF/bin requests without Yggdrasil API calls, animated image difference **1.83**, and reduced-motion stillness **0.00**. The authenticated isolated production gate downloaded the complete ZIP with retained derived GLB SHA-256 `2e9281270cbce4c5e3f0616c1753c23cde5261dbb1a3467b51eed307c7ab3dd7`; the manifest security scan passed and the original source hash stayed `cc8470d738c5991504a129d2231056a1a7189e00f429f9749b1f2e0414e9d792`. `pnpm test`: **58 files, 271 passed, 1 existing optional skip**. Lint, typecheck, Next.js 16.3.5 build, and diff check passed. The separate isolated Playwright suite reported **2 passed**. Both isolated databases were removed. No acceptance gap remains for this target.
