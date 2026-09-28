import { describe, expect, it } from "vitest";
import { AnimationClip, AnimationMixer, Bone, Group, NumberKeyframeTrack } from "three";
import { createGltfFixture } from "@/test/fixtures/create-gltf-fixture";
import { analyzeImportedClip, animationClipFromManifest, attachImportedClip, importedClipAnimation, parseImportedAnimationSource, playableImportedClip } from "./imported-clips";

function bone(name: string) {
  const value = new Bone();
  value.name = name;
  return value;
}

describe("imported animation clips", () => {
  it("matches a compatible imported rig and remaps tracks onto the target bone", () => {
    const source = new Group();
    source.add(bone("mixamorig:Arm"));
    const target = new Group();
    const arm = bone("Arm");
    target.add(arm);
    const clip = new AnimationClip("Imported wave", 1, [new NumberKeyframeTrack("mixamorig:Arm.position[x]", [0, 1], [0, 2])]);
    const analysis = analyzeImportedClip(clip, source, target);
    expect(analysis.mapping).toEqual([{ sourceBone: "mixamorig:Arm", targetBone: "Arm", status: "matched", candidates: ["Arm"] }]);
    expect(analysis.compatible).toBe(true);

    const attached = attachImportedClip(analysis, { id: "11111111-1111-4111-8111-111111111111", sourceFileName: "wave.gltf", sourceStorageKey: "projects/p/imports/wave.gltf", sourceSha256: "a".repeat(64) });
    const remapped = playableImportedClip(clip, attached);
    expect(remapped.tracks[0].name).toBe("Arm.position[x]");
    const mixer = new AnimationMixer(target);
    mixer.clipAction(remapped).play();
    mixer.update(0.5);
    expect(arm.position.x).toBeCloseTo(1);
    expect(clip.tracks[0].name).toBe("mixamorig:Arm.position[x]");

    mixer.stopAllAction();
    arm.position.set(0, 0, 0);
    const reloaded = JSON.parse(JSON.stringify(attached));
    expect(importedClipAnimation(reloaded).tracks[0].name).toBe("Arm.position[x]");
    expect(importedClipAnimation(reloaded).tracks[0].getValueSize()).toBe(1);
    const persistedMixer = new AnimationMixer(target);
    persistedMixer.clipAction(importedClipAnimation(reloaded)).play();
    persistedMixer.update(0.5);
    expect(arm.position.x).toBeCloseTo(1);
  });

  it("preserves dotted node names and rejects malformed manifest keyframes", () => {
    const source = new Group();
    source.add(bone("Arm.L"));
    const target = new Group();
    target.add(bone("Arm.L"));
    const clip = new AnimationClip("Dotted", 1, [new NumberKeyframeTrack("Arm.L.position[x]", [0, 1], [0, 1])]);
    expect(analyzeImportedClip(clip, source, target).mapping[0].sourceBone).toBe("Arm.L");
    expect(() => animationClipFromManifest({ tracks: [{ target: "Arm", path: "position", times: [0, 1], values: [0, 1] }] })).toThrow(/three values/);
  });

  it("reports exact missing and ambiguous targets before attachment", () => {
    const source = new Group();
    source.add(bone("Arm"));
    const target = new Group();
    target.add(bone("Arm.L"));
    target.add(bone("Arm_L"));
    const clip = new AnimationClip("Broken wave", 2, [
      new NumberKeyframeTrack("Arm.position[x]", [0, 2], [0, 1]),
      new NumberKeyframeTrack("Missing.position[x]", [0, 2], [0, 1]),
    ]);
    const analysis = analyzeImportedClip(clip, source, target);
    expect(analysis.compatible).toBe(false);
    expect(analysis.mapping).toEqual(expect.arrayContaining([
      { sourceBone: "Arm", targetBone: null, status: "ambiguous", candidates: ["Arm.L", "Arm_L"] },
      { sourceBone: "Missing", targetBone: null, status: "missing", candidates: [] },
    ]));
    expect(() => attachImportedClip(analysis, { id: "11111111-1111-4111-8111-111111111111", sourceFileName: "broken.gltf", sourceStorageKey: "projects/p/imports/broken.gltf", sourceSha256: "b".repeat(64) })).toThrow(/ambiguous|missing/i);
  });

  it("accepts a manual mapping only for a reported ambiguous target", () => {
    const source = new Group();
    source.add(bone("Arm"));
    const target = new Group();
    const left = bone("Arm.L");
    target.add(left);
    target.add(bone("Arm_L"));
    const clip = new AnimationClip("Mapped wave", 1, [new NumberKeyframeTrack("Arm.position[x]", [0, 1], [0, 1])]);
    const analysis = analyzeImportedClip(clip, source, target);
    const attached = attachImportedClip({ ...analysis, manualMapping: { Arm: "Arm.L" } }, { id: "11111111-1111-4111-8111-111111111111", sourceFileName: "mapped.gltf", sourceStorageKey: "projects/p/imports/mapped.gltf", sourceSha256: "c".repeat(64) });
    expect(attached.mapping).toEqual([{ sourceBone: "Arm", targetBone: "Arm.L", status: "manual" }]);
    expect(attached.tracks[0].targetNode).toBe("Arm.L");
  });

  it("rejects a manually selected non-bone target for a source bone", () => {
    const source = new Group();
    source.add(bone("Arm"));
    const target = new Group();
    const nonBone = new Group(); nonBone.name = "Arm.L"; target.add(nonBone);
    target.add(bone("Arm_R"));
    const clip = new AnimationClip("Wave", 1, [new NumberKeyframeTrack("Arm.position[x]", [0, 1], [0, 1])]);
    const analysis = analyzeImportedClip(clip, source, target);
    expect(analysis.mapping[0].status).toBe("ambiguous");
    expect(() => attachImportedClip({ ...analysis, manualMapping: { Arm: "Arm.L" } }, {
      id: crypto.randomUUID(), sourceFileName: "wave.glb", sourceStorageKey: "pending", sourceSha256: "0".repeat(64),
    })).toThrow(/non-bone/);
  });

  it("rejects a bone mapped onto a non-bone and warns about rest transform drift", () => {
    const source = new Group();
    source.add(bone("Arm"));
    const target = new Group();
    const nonBone = new Group(); nonBone.name = "Arm"; target.add(nonBone);
    const clip = new AnimationClip("Wave", 1, [new NumberKeyframeTrack("Arm.position[x]", [0, 1], [0, 1])]);
    const incompatible = analyzeImportedClip(clip, source, target);
    expect(incompatible.problems).toContain("Bone Arm maps to a non-bone target Arm.");
    expect(() => attachImportedClip(incompatible, { id: crypto.randomUUID(), sourceFileName: "wave.glb", sourceStorageKey: "pending", sourceSha256: "0".repeat(64) })).toThrow(/non-bone/);
    target.remove(nonBone);
    const restOffset = bone("Arm"); restOffset.position.x = 0.2; target.add(restOffset);
    expect(analyzeImportedClip(clip, source, target).warnings).toContain("Rest transform differs for Arm; preview the motion before attaching.");
  });

  it("rejects a mapped bone whose parent hierarchy does not match", () => {
    const source = new Group();
    const shoulder = bone("Shoulder"); shoulder.add(bone("Arm")); source.add(shoulder);
    const target = new Group();
    const spine = bone("Spine"); spine.add(bone("Arm")); target.add(spine);
    const clip = new AnimationClip("Wave", 1, [new NumberKeyframeTrack("Arm.position[x]", [0, 1], [0, 1])]);
    expect(analyzeImportedClip(clip, source, target).problems).toContain("Bone hierarchy differs at Arm: expected parent Shoulder.");
  });

  it("loads a self-contained GLB clip from the uploaded bytes", async () => {
    const fixture = createGltfFixture();
    const document = JSON.parse(new TextDecoder().decode(fixture.model.bytes));
    delete document.buffers[0].uri;
    const encoded = new TextEncoder().encode(JSON.stringify(document));
    const jsonLength = Math.ceil(encoded.length / 4) * 4;
    const binLength = Math.ceil(fixture.binary.bytes.length / 4) * 4;
    const glb = new Uint8Array(12 + 8 + jsonLength + 8 + binLength);
    const view = new DataView(glb.buffer);
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, glb.length, true);
    view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
    glb.fill(0x20, 20, 20 + jsonLength); glb.set(encoded, 20);
    view.setUint32(20 + jsonLength, binLength, true); view.setUint32(24 + jsonLength, 0x004e4942, true);
    glb.set(fixture.binary.bytes, 28 + jsonLength);
    const imported = await parseImportedAnimationSource(glb, "rise.glb");
    expect(imported.clip.name).toBe("Rise");
    expect(imported.clip.tracks).toHaveLength(1);
    expect(imported.clip.tracks[0].name).toBe("Animated_Triangle.position");
    expect(imported.root.getObjectByName("Animated_Triangle")).toBeTruthy();
  });
});
