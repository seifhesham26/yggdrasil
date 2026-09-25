# Task 3.3 — Scene controls

**Status:** Accepted 2026-09-25. **Depends on:** Task 3.1.

**Outcome:** The owner can configure environment, lighting, shadows, background, camera, controls, tone mapping, and framing for the chosen model.

**Work:** Define serializable scene settings with valid ranges and defaults. Preview desktop/tablet/mobile viewport dimensions and reduced-motion behavior. Make camera reset and frame-selection predictable. Keep scene settings separate from model source files.

**Acceptance:**

- [x] Saved settings recreate the same view after reload.
- [x] Invalid values are rejected with field-level feedback.
- [x] Narrow viewport and reduced-motion previews remain usable.
- [x] Camera controls and frame-selection work on large/small models.

**Likely touchpoints:** `src/features/viewer/`, project config, scene editor. **Evidence to record:** screenshot/browser comparison and accessibility checks.

## Acceptance evidence — 2026-09-25

- The editor stores background, environment lighting preset, exposure, shadows, camera position/target/FOV, orbit/turntable/disabled controls, and reduced motion in the validated project snapshot. The browser gate rejected FOV 180 with field feedback, then saved FOV 60, outdoor lighting, turntable, and reduced motion. All reopened with the same values. Matched before/after viewport screenshots had mean RGB channel difference **1.04** after normalization to 390×450 pixels (threshold 5).
- The browser gate selected mobile preview, exercised frame/reset, switched to a 720-pixel page viewport, and confirmed the preview and camera controls remained visible. Reduced motion disabled clip autoplay and turntable autorotation in the viewer.
- Generated tiny and large glTF fixtures framed visibly in the browser: **54,831** model-colored pixels at scale **0.00001**, and **63,531** at scale **100000**. A focused framing test verifies that large models use the saved view direction around their own center. This corrected a real near-distance clamp and an edge-on view bug found by the browser gate.
