"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useBounds } from "@react-three/drei";
import { AnimationMixer, BufferGeometry, LoadingManager, Material, type AnimationAction, type Object3D, Texture } from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { ViewerFile } from "./model-canvas";
import type { ProjectSnapshot } from "@/features/projects/domain/project-state";
import { applyAppearance, indexSceneParts, summarizePart, type PartSummary } from "@/features/projects/ui/scene-parts";
import { projectFramePosition } from "./project-framing";
import { advanceClip, clipTime, inspectClips, playableClip, type AnimationPreview, type ClipSource } from "./animation-clips";

const TRANSPARENT_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/9xkAAAAASUVORK5CYII=";

function normalizedRelative(path: string): string | null {
  const parts: string[] = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(segment);
  }
  return parts.join("/");
}

/** Remap glTF sibling resources to the owner-scoped file route. */
export function modelResourceUrl(modelUrl: string, primaryRelativePath: string, files: ViewerFile[], requestedUrl: string): string {
  if (/^(data:|blob:)/i.test(requestedUrl) || requestedUrl === modelUrl) return requestedUrl;
  const primary = new URL(modelUrl, window.location.href);
  const requested = new URL(requestedUrl, primary);
  if (requested.origin !== primary.origin) return "data:application/octet-stream;base64,";
  const base = primary.pathname.slice(0, primary.pathname.lastIndexOf("/") + 1);
  let relative = requestedUrl.startsWith("/") || /^https?:/i.test(requestedUrl)
    ? requested.pathname.startsWith(base) ? requested.pathname.slice(base.length) : requested.pathname.split("/").at(-1) ?? ""
    : requestedUrl;
  try { relative = decodeURIComponent(relative); } catch { return "data:application/octet-stream;base64,"; }
  const parent = primaryRelativePath.split("/").slice(0, -1).join("/");
  const candidate = normalizedRelative(`${parent}/${relative}`);
  let file = files.find((entry) => entry.relativePath === candidate);
  if (!file) {
    const matches = files.filter((entry) => entry.relativePath.split("/").at(-1) === relative.split("/").at(-1));
    if (matches.length === 1) file = matches[0];
  }
  if (file) return `${primary.pathname}?key=${encodeURIComponent(file.storageKey)}`;
  return /\.(png|jpe?g|webp|ktx2)$/i.test(relative) ? TRANSPARENT_PNG : "data:application/octet-stream;base64,";
}

/** This loader is per-preview, not cached; clones share these source resources. */
export function disposeLoadedScene(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((node) => {
    const geometry = (node as Object3D & { geometry?: unknown }).geometry;
    if (geometry instanceof BufferGeometry) geometries.add(geometry);
    const attached = (node as Object3D & { material?: Material | Material[] }).material;
    for (const material of attached ? Array.isArray(attached) ? attached : [attached] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

export function ModelScene({ modelUrl, primaryRelativePath, files, autoPlay, frameVersion, frameOnLoad = true, frameCamera, appearance, previewHiddenIds, animationPreview, onClips, onAnimationProgress, onParts, onSelectPart, onInteract, onMissingParts, onReady }: {
  modelUrl: string;
  primaryRelativePath: string;
  files: ViewerFile[];
  autoPlay: boolean;
  frameVersion: number;
  frameOnLoad?: boolean;
  frameCamera?: ProjectSnapshot["scene"]["camera"];
  appearance?: ProjectSnapshot["appearance"]["nodes"];
  previewHiddenIds?: string[];
  animationPreview?: AnimationPreview;
  onClips?: (clips: ClipSource[]) => void;
  onAnimationProgress?: (progress: number, finished: boolean) => void;
  onParts?: (parts: PartSummary[]) => void;
  onSelectPart?: (id: string) => void;
  onInteract?: (id: string, trigger: "click" | "hover") => void;
  onMissingParts?: (ids: string[]) => void;
  onReady: () => void;
}) {
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const mixer = useRef<AnimationMixer | null>(null);
  const playback = useRef<{ mixer: AnimationMixer; action: AnimationAction; time: number; direction: 1 | -1; lastReport: number } | null>(null);
  const bounds = useBounds();
  const camera = useThree((state) => state.camera);
  const sceneData = useMemo(() => {
    if (!gltf) return null;
    const scene = cloneSkeleton(gltf.scene);
    scene.updateMatrixWorld(true);
    const parts = indexSceneParts(scene);
    const summaries = parts.map(summarizePart);
    const applied = applyAppearance(scene, appearance ?? {});
    for (const part of parts) if (previewHiddenIds?.includes(part.id)) part.object.visible = false;
    return { scene, parts, summaries, applied };
  }, [gltf, appearance, previewHiddenIds]);
  const scene = sceneData?.scene;
  const sources = useMemo(() => gltf && scene ? inspectClips(gltf.animations, scene) : [], [gltf, scene]);
  const lastFrameVersion = useRef(-1);

  useEffect(() => () => sceneData?.applied.dispose(), [sceneData]);

  useEffect(() => {
    if (!sceneData) return;
    onParts?.(sceneData.summaries);
    onMissingParts?.(sceneData.applied.missing);
  }, [sceneData, onParts, onMissingParts]);

  useEffect(() => { if (gltf && scene) onClips?.(sources); }, [gltf, scene, sources, onClips]);

  useEffect(() => {
    let active = true;
    let loaded: GLTF | null = null;
    const manager = new LoadingManager();
    manager.setURLModifier((url) => modelResourceUrl(modelUrl, primaryRelativePath, files, url));
    const loader = new GLTFLoader(manager);
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(modelUrl, (result) => {
      if (!active) { disposeLoadedScene(result.scene); return; }
      loaded = result;
      setGltf(result);
    }, undefined, (error) => { if (active) setLoadError(error instanceof Error ? error : new Error("Model loading failed")); });
    return () => {
      active = false;
      if (loaded) disposeLoadedScene(loaded.scene);
    };
  }, [modelUrl, primaryRelativePath, files]);

  useEffect(() => {
    if (!scene) return;
    if ((frameOnLoad && lastFrameVersion.current < 0) || (frameVersion > 0 && frameVersion !== lastFrameVersion.current)) {
      bounds.refresh(scene);
      if (frameCamera) {
        const { center, distance } = bounds.getSize();
        camera.position.copy(projectFramePosition(center, distance, frameCamera.position, frameCamera.target));
        camera.lookAt(center);
        camera.updateMatrixWorld();
      }
      bounds.clip().fit();
    }
    lastFrameVersion.current = frameVersion;
    onReady();
  }, [scene, frameVersion, frameOnLoad, frameCamera, bounds, camera, onReady]);

  const selected = animationPreview?.clip;
  const hasAnimationPreview = animationPreview !== undefined;
  useEffect(() => {
    if (!scene || !gltf?.animations.length) return;
    const source = selected ? gltf.animations[selected.sourceIndex] : !hasAnimationPreview && autoPlay ? gltf.animations[0] : null;
    if (!source || (selected && !selected.enabled)) return;
    const current = new AnimationMixer(scene);
    if (selected) {
      const safeClip = playableClip(source, sources[selected.sourceIndex]?.missingTargets ?? []);
      const action = current.clipAction(safeClip).play();
      const time = clipTime(selected, 0);
      action.time = time;
      current.update(0);
      playback.current = { mixer: current, action, time, direction: 1, lastReport: 0 };
    } else current.clipAction(source).play();
    mixer.current = current;
    return () => {
      current.stopAllAction(); current.uncacheRoot(scene);
      if (mixer.current === current) mixer.current = null;
      if (playback.current?.mixer === current) playback.current = null;
    };
  }, [scene, gltf, selected, animationPreview?.restartToken, sources, autoPlay, hasAnimationPreview]);

  useEffect(() => {
    if (!selected || !playback.current || animationPreview?.playing) return;
    const state = playback.current;
    state.time = clipTime(selected, animationPreview?.progress ?? 0);
    state.direction = 1;
    state.action.time = state.time; state.mixer.update(0);
  }, [animationPreview?.progress, animationPreview?.playing, selected, gltf]);

  useFrame((_, delta) => {
    const state = playback.current;
    if (!state || !selected) { mixer.current?.update(delta); return; }
    if (!animationPreview?.playing) return;
    const next = advanceClip(selected, state.time, Math.min(delta, 0.1), state.direction);
    state.time = next.time; state.direction = next.direction;
    state.action.time = next.time; state.mixer.update(0);
    const now = performance.now();
    if (next.finished || now - state.lastReport > 100) {
      state.lastReport = now;
      onAnimationProgress?.((next.time - selected.trimStart) / (selected.trimEnd - selected.trimStart), next.finished);
    }
  });

  if (loadError) throw loadError;
  if (!scene) return null;
  // SkeletonUtils clones the hierarchy and bones but shares geometry/materials
  // with this preview's loader. The loader effect disposes them on unmount.
  const partFor = (object: Object3D) => sceneData?.parts.find((item) => item.object === object);
  return <primitive object={scene} onClick={onSelectPart || onInteract ? (event: { object: Object3D; stopPropagation: () => void }) => {
    const part = partFor(event.object);
    if (part) { event.stopPropagation(); if (onInteract) onInteract(part.id, "click"); else onSelectPart?.(part.id); }
  } : undefined} onPointerOver={onInteract ? (event: { object: Object3D; stopPropagation: () => void }) => { const part = partFor(event.object); if (part) { event.stopPropagation(); onInteract(part.id, "hover"); } } : undefined} />;
}
