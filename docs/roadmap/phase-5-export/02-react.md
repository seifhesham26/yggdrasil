# Task 5.2 — React component target

**Status:** [x] Accepted on 2026-09-28. **Depends on:** Task 5.1.

**Outcome:** Export a reusable React/Three.js component with typed configuration, required assets, loading/error hooks, and documented dependencies.

**Work:** Generate a minimal component entry point and runtime configuration that reproduces the editor's scene, interactions, and animation behavior. Package assets with portable relative references. Document integration into a separate React website and test with the project's then-current supported React/Three versions.

**Acceptance:**

- [x] Generated component builds and renders in an independent sample React app.
- [x] Its behavior matches a representative Yggdrasil preview, including animation and reduced-motion mode.
- [x] Assets resolve without access to Yggdrasil's authenticated routes or local filesystem.
- [x] Type declarations, dependency list, license/attribution, and integration instructions ship with it.

**Likely touchpoints:** export target module, packaging service, sample consumer app. **Evidence to record:** sample build/browser run and dependency versions.

**Evidence (2026-09-28):** The `react` job packages a typed `YggdrasilModel.tsx`, validated manifest, source-independent assets, a runnable Vite sample, `package.json`, and integration/attribution README. The runtime applies saved scene and appearance settings, structured interactions, embedded/imported clips, sequences, timelines, and reduced motion. `pnpm exec tsx scripts/react-export-gate.ts` extracted the ZIP into a separate temporary app, installed its own dependencies, passed TypeScript and Vite build, and rendered the sample in Chromium. It requested only local `triangle.gltf` and `triangle.bin`, changed the image during animation by mean channel difference **1.90**, and stayed still in reduced-motion mode (**0.00**); the temporary app was removed. The sample installed React/React DOM **19.3.0**, Three **0.186.0**, GSAP **3.15.0**, Zod **4.6.5**, TypeScript **5.9.3**, and Vite **8.3.0**. The authenticated isolated production restart gate downloaded the ZIP with the retained derived GLB SHA-256 `2e9281270cbce4c5e3f0616c1753c23cde5261dbb1a3467b51eed307c7ab3dd7`, and its manifest security scan passed; the original source hash remained `cc8470d738c5991504a129d2231056a1a7189e00f429f9749b1f2e0414e9d792`. `pnpm test`: **58 files, 271 passed, 1 existing optional skip**. Lint, typecheck, build, and diff check passed. The isolated Playwright suite reported **2 passed**. Both isolated databases were removed. No acceptance gap remains for this target.
