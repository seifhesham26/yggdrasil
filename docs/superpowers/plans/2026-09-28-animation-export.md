# Animation and export implementation plan

This plan continues the approved Yggdrasil roadmap on the existing main checkout. Each task is a separate commit after its own behavior, persistence, production browser, lint, typecheck, build, and isolated Playwright gates. Preserve source and imported asset bytes, private storage, owner checks, revision history, and earlier work.

## 4.3 Blending and sequencing

1. Add a validated sequence of project clip references to the snapshot, with segment duration, overlap with the prior segment, source offset, weight, enablement, and a sequence loop flag. Keep legacy snapshot migration additive.
2. Implement pure schedule evaluation for sequence time, speed, source trim and loop semantics, linear overlap weights, disabled segments, and boundary behavior. Warn about missing sources/targets and overlapping incompatible track bindings. Clone source clips before mixer use.
3. Add an editor sequence list with add, reorder, remove, segment controls, play, scrub, and warning feedback. Reuse the evaluator and mixer controller for preview and later export.
4. Add timing/mixer, UI, schema persistence, and authenticated isolated browser tests. Recheck original source SHA-256, then record evidence and commit.

## 4.4 Visual GSAP timeline

1. Define strict serializable timeline, track, keyframe, property, and trigger schemas. Reject arbitrary code and invalid target/property pairs.
2. Add timeline editing controls, target inventory, reorder/delete, scrub/play, warning feedback, and project persistence.
3. Build a GSAP runtime controller with trigger registration and full teardown. Support start, scroll, click, hover, model, and clip events; honor reduced motion. Keep runtime reusable by export targets.
4. Cover each target class and trigger with fixtures, persistence, teardown, reduced-motion and authenticated browser checks; record evidence and commit.

## 5.1 Export manifest

1. Add a versioned manifest and export job/artifact records. Freeze the project revision and resolve owner-scoped asset files to portable relative paths.
2. Validate supported interactions, animations, timeline targets, provenance, attribution, private-file references, and complete output before ready status. Keep failure retryable.
3. Test serialization, missing files, secrets/path scan, retry, and authenticated export browser flow; record evidence and commit.

## 5.2 React target

1. Generate a typed React/Three component and package relative assets, runtime config, dependencies, license text, and integration notes from the manifest.
2. Build and render an independent sample consumer with animation, interactions, and reduced-motion checks. Verify no authenticated-route requests; record evidence and commit.

## 5.3 Embed target

1. Generate a standalone viewer, JSON config, and sample host page with mount/unmount, resize, safe host events, errors, keyboard access, and reduced-motion behavior.
2. Verify local and cross-origin hosting expectations in browser checks; record evidence and commit.

## 5.4 Package and loading

1. Assemble a safe downloadable archive with entry points, assets, config, docs, licenses, and attribution. Validate archive paths and completeness before ready.
2. Implement and test request order for on-demand, metadata-first, critical-assets, and full-preload policies, including progress and retry behavior.
3. Download, unpack, and run the independent sample under an isolated browser; scan for secrets and local paths, run the full suite, record evidence, and commit.
