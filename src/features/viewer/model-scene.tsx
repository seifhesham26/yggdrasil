"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useBounds } from "@react-three/drei";
import { AnimationMixer, BufferGeometry, LoadingManager, Material, type Object3D, Texture } from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { ViewerFile } from "./model-canvas";

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

export function ModelScene({ modelUrl, primaryRelativePath, files, autoPlay, frameVersion, onReady }: {
  modelUrl: string;
  primaryRelativePath: string;
  files: ViewerFile[];
  autoPlay: boolean;
  frameVersion: number;
  onReady: () => void;
}) {
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const mixer = useRef<AnimationMixer | null>(null);
  const bounds = useBounds();
  const scene = useMemo(() => gltf ? cloneSkeleton(gltf.scene) : null, [gltf]);

  useEffect(() => {
    let active = true;
    let loaded: GLTF | null = null;
    const manager = new LoadingManager();
    manager.setURLModifier((url) => modelResourceUrl(modelUrl, primaryRelativePath, files, url));
    const loader = new GLTFLoader(manager);
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
    bounds.refresh(scene).clip().fit();
    onReady();
  }, [scene, frameVersion, bounds, onReady]);

  useEffect(() => {
    if (!scene || !gltf?.animations.length || !autoPlay) return;
    const current = new AnimationMixer(scene);
    current.clipAction(gltf.animations[0]).play();
    mixer.current = current;
    return () => {
      current.stopAllAction();
      current.uncacheRoot(scene);
      mixer.current = null;
    };
  }, [scene, gltf, autoPlay]);

  useFrame((_, delta) => mixer.current?.update(delta));

  if (loadError) throw loadError;
  if (!scene) return null;
  // SkeletonUtils clones the hierarchy and bones but shares geometry/materials
  // with this preview's loader. The loader effect disposes them on unmount.
  return <primitive object={scene} />;
}
