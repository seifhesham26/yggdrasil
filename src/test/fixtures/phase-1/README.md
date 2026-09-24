# Phase 1 redistributable model fixtures

These four files were created specifically for Yggdrasil tests on 2026-09-24. No third-party models, textures, or private uploads were used. The contributors dedicate these fixtures to the public domain under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/); they may be copied and redistributed with the repository.

| File | Content and expected conversion |
| --- | --- |
| `cube.fbx` | Hand-authored ASCII FBX 7.4 cube, eight vertices and six quad faces. The current converter triangulates it to 12 triangles and reports FBX fidelity limits. |
| `painted-panel.obj` | Hand-authored quad with UVs and a material reference. The current converter triangulates it to two triangles. |
| `painted-panel.mtl` | References `checker.png` through `map_Kd`. The current converter retains the source but reports that OBJ materials are not converted. |
| `checker.png` | Original 2×2 red, green, blue, and white RGB texture created from raw pixel values with Python's standard-library PNG/zlib encoding. |

These intentionally small fixtures exercise dependency retention and viewer reopening. They are not a survey of FBX exporters or OBJ material syntax; conversion caveats remain visible in the asset report.

The repository's `.gitattributes` disables line-ending conversion for this directory so fixture bytes and the hashes in the Phase 1 evidence remain stable across checkouts.
