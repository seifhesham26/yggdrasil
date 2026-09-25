import type { ImportFile } from "@/features/assets/domain/types";

/** A generated glTF 2.0 triangle with one animated node. No third-party model bytes. */
export function createGltfFixture(): { model: ImportFile; binary: ImportFile } {
  const binary = new Uint8Array(68);
  const view = new DataView(binary.buffer);
  const values = [
    // Three POSITION vectors, float32.
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    // Two animation timestamps.
    0, 1,
    // Two translation vectors.
    0, 0, 0, 0, 0, 1,
  ];
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  const document = {
    asset: { version: "2.0", generator: "Yggdrasil generated test fixture" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "Animated Triangle", mesh: 0 }],
    meshes: [{ name: "Triangle", primitives: [{ attributes: { POSITION: 0 }, material: 0, mode: 4 }] }],
    materials: [{ name: "Test Material", pbrMetallicRoughness: { baseColorFactor: [0.8, 0.3, 0.2, 1] } }],
    buffers: [{ uri: "triangle.bin", byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 8 },
      { buffer: 0, byteOffset: 44, byteLength: 24 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 2, componentType: 5126, count: 2, type: "VEC3" },
    ],
    animations: [{
      name: "Rise",
      samplers: [{ input: 1, output: 2, interpolation: "LINEAR" }],
      channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
    }],
  };
  return {
    model: { relativePath: "triangle.gltf", bytes: new TextEncoder().encode(JSON.stringify(document)) },
    binary: { relativePath: "triangle.bin", bytes: binary },
  };
}

/** Two clips in deliberately nonalphabetic source order and with distinct durations and targets. */
export function createMultiClipGltfFixture(): { model: ImportFile; binary: ImportFile } {
  const fixture = createGltfFixture();
  const binary = new Uint8Array(76);
  binary.set(fixture.binary.bytes);
  const view = new DataView(binary.buffer);
  view.setFloat32(68, 0, true);
  view.setFloat32(72, 2, true);
  const document = JSON.parse(new TextDecoder().decode(fixture.model.bytes));
  document.buffers[0].byteLength = binary.byteLength;
  document.bufferViews.push({ buffer: 0, byteOffset: 68, byteLength: 8 });
  document.accessors.push({ bufferView: 3, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [2] });
  document.animations[0].name = "Z Rise";
  document.animations.push({ name: "A Scale", samplers: [{ input: 3, output: 2, interpolation: "LINEAR" }], channels: [{ sampler: 0, target: { node: 0, path: "scale" } }] });
  return { model: { ...fixture.model, bytes: new TextEncoder().encode(JSON.stringify(document)) }, binary: { ...fixture.binary, bytes: binary } };
}
