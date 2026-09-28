import { useEffect, useRef, useState } from "react";
import { AnimationClip, AnimationMixer, AmbientLight, DirectionalLight, Mesh, MeshStandardMaterial, NumberKeyframeTrack, PerspectiveCamera, QuaternionKeyframeTrack, Raycaster, Scene, Vector2, Vector3, VectorKeyframeTrack, WebGLRenderer, type Material, type Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import gsap from "gsap";
import type { ProjectSnapshot } from "@/features/projects/domain/project-state";

export type YggdrasilConfig = {
  formatVersion: 1;
  modelPath: string;
  files: { path: string; sha256: string; byteSize: number; mimeType: string; role: string }[];
  config: Omit<ProjectSnapshot, "animation"> & { animation: Omit<ProjectSnapshot["animation"], "importedClips"> & { importedClips: PortableImportedClip[] } };
};
type PortableImportedClip = Omit<ProjectSnapshot["animation"]["importedClips"][number], "sourceStorageKey">;
export type YggdrasilModelProps = {
  manifest: YggdrasilConfig;
  assetBaseUrl?: string;
  className?: string;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onProgress?: (loaded: number, total: number) => void;
  onInteraction?: (id: string, action: string) => void;
};

type Part = { id: string; object: Object3D };
function indexParts(root: Object3D): Part[] {
  const parts: Part[] = [];
  function visit(parent: Object3D, prefix: string) {
    parent.children.forEach((object, index) => {
      const path = prefix ? `${prefix}.${index}` : String(index);
      parts.push({ id: `${path}:${encodeURIComponent(object.type)}:${encodeURIComponent(object.name || object.type)}`, object });
      visit(object, path);
    });
  }
  visit(root, "");
  return parts;
}

function importedAnimation(clip: PortableImportedClip) {
  const tracks = clip.tracks.flatMap((track) => {
    if (!track.targetNode) return [];
    const path = track.path === "weights" ? "morphTargetInfluences" : track.path;
    const name = `${track.targetNode}.${path}${track.component === null ? "" : `[${track.component}]`}`;
    const Constructor = track.component !== null ? NumberKeyframeTrack : track.path === "quaternion" ? QuaternionKeyframeTrack : track.path === "position" || track.path === "scale" ? VectorKeyframeTrack : NumberKeyframeTrack;
    return [new Constructor(name, track.times, track.values)];
  });
  return new AnimationClip(clip.name, clip.durationSeconds, tracks);
}

function clipTime(edit: { trimStart: number; trimEnd: number; speed: number; loop: string }, seconds: number) {
  const length = edit.trimEnd - edit.trimStart;
  const elapsed = Math.max(0, seconds * edit.speed);
  if (edit.loop === "once") return edit.trimStart + Math.min(length, elapsed);
  if (edit.loop === "repeat") return edit.trimStart + elapsed % length;
  const phase = elapsed % (2 * length);
  return edit.trimStart + (phase <= length ? phase : 2 * length - phase);
}

function applyAppearance(parts: Part[], config: YggdrasilConfig["config"]) {
  const byId = new Map(parts.map((part) => [part.id, part.object]));
  const originalMaterials = new Map(parts.filter((part) => part.object instanceof Mesh).map((part) => [part.id, (part.object as Mesh).material]));
  const owned: Material[] = [];
  for (const [id, override] of Object.entries(config.appearance.nodes)) {
    const object = byId.get(id);
    if (!object) continue;
    if (override.visible !== undefined) object.visible = override.visible;
    if (override.position) object.position.fromArray(override.position);
    if (override.rotation) object.rotation.set(...override.rotation);
    if (override.scale) object.scale.fromArray(override.scale);
    if (!(object instanceof Mesh)) continue;
    if (override.color === undefined && override.opacity === undefined && override.roughness === undefined && override.metalness === undefined && override.materialSourceNodeId === undefined && override.textureSourceNodeId === undefined) continue;
    const source = originalMaterials.get(override.materialSourceNodeId ?? id) ?? object.material;
    const current = Array.isArray(object.material) ? object.material : [object.material];
    const materials = current.map((_, index) => {
      const original = Array.isArray(source) ? source[index] ?? source[0] : source;
      const material = original.clone(); owned.push(material);
      if (material instanceof MeshStandardMaterial) {
        if (override.color) material.color.set(override.color);
        if (override.roughness !== undefined) material.roughness = override.roughness;
        if (override.metalness !== undefined) material.metalness = override.metalness;
        if (override.textureSourceNodeId === null) material.map = null;
        else if (override.textureSourceNodeId) {
          const textureSource = originalMaterials.get(override.textureSourceNodeId);
          const textureMaterial = Array.isArray(textureSource) ? textureSource[index] ?? textureSource[0] : textureSource;
          if (textureMaterial instanceof MeshStandardMaterial && object.geometry.getAttribute("uv")) material.map = textureMaterial.map;
        }
      }
      if (override.opacity !== undefined) { material.opacity = override.opacity; material.transparent = override.opacity < 1; }
      return material;
    });
    object.material = Array.isArray(object.material) ? materials : materials[0];
  }
  return () => owned.forEach((material) => material.dispose());
}

export function YggdrasilModel({ manifest, assetBaseUrl, className, onLoad, onError, onProgress, onInteraction }: YggdrasilModelProps) {
  const mount = useRef<HTMLDivElement>(null);
  const [requested, setRequested] = useState(manifest.config.export.loadingPolicy !== "on-demand");
  const [attempt, setAttempt] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState<string | null>(null);
  const [hotspots, setHotspots] = useState<{ id: string; targetNodeId: string }[]>([]);
  const hotspotAction = useRef<(id: string) => void>(() => {});

  useEffect(() => {
    const host = mount.current;
    if (!host || !requested) return;
    const abort = new AbortController();
    const hints: HTMLLinkElement[] = [];
    setLoadState("loading"); setLoadError(null);
    const config = manifest.config;
    const reduced = config.scene.reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new Scene();
    scene.background = null;
    const camera = new PerspectiveCamera(config.scene.camera.fov, 1, 0.01, 10000);
    camera.position.fromArray(config.scene.camera.position);
    const target = new Vector3(...config.scene.camera.target);
    camera.lookAt(target);
    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    renderer.setClearColor(config.scene.background);
    renderer.toneMappingExposure = 2 ** config.scene.exposure;
    renderer.shadowMap.enabled = config.scene.shadows;
    host.appendChild(renderer.domElement);
    const ambient = new AmbientLight(0xffffff, config.scene.environment === "none" ? 0.5 : config.scene.environment === "outdoor" ? 1.6 : 1.3);
    const key = new DirectionalLight(0xffffff, config.scene.environment === "none" ? 1 : config.scene.environment === "outdoor" ? 2.8 : 2.2);
    key.position.set(5, 8, 6); key.castShadow = config.scene.shadows;
    const fill = new DirectionalLight(0xa4d1cc, 0.8); fill.position.set(-5, 3, -5);
    scene.add(ambient, key, fill);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enabled = config.scene.controls !== "disabled";
    controls.autoRotate = config.scene.controls === "turntable" && !reduced;
    controls.enableDamping = true;
    const resize = () => { const width = Math.max(1, host.clientWidth); const height = Math.max(1, host.clientHeight); camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let root: Object3D | null = null;
    let mixer: AnimationMixer | null = null;
    let parts: Part[] = [];
    let disposeAppearance = () => {};
    let last = performance.now();
    let elapsed = 0;
    let active = true;
    let sequenceEndFired = false;
    let clipEndFired = false;
    let scrollObserver: IntersectionObserver | null = null;
    const actions = new Map<string, ReturnType<AnimationMixer["clipAction"]>>();
    const edits = new Map([...config.animation.embeddedClips, ...config.animation.importedClips].map((clip) => [clip.id, clip]));
    const timelines: { spec: ProjectSnapshot["animation"]["timelines"][number]; tween: gsap.core.Timeline }[] = [];
    const fire = (type: string, id: string | null = null) => { for (const { spec, tween } of timelines) if (spec.enabled && spec.trigger.type === type && (!spec.trigger.targetId || spec.trigger.targetId === id)) reduced ? tween.progress(1) : tween.restart(); };
    const find = (object: Object3D) => { let current: Object3D | null = object; while (current && current !== root) { const part = parts.find((entry) => entry.object === current); if (part) return part; current = current.parent; } return null; };
    const hit = (event: PointerEvent) => {
      if (!root) return null;
      const box = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObject(root, true).map((item) => find(item.object)).find(Boolean) ?? null;
    };
    const interact = (id: string, trigger: "click" | "hover" | "hotspot") => {
      if (!root) return;
      for (const item of config.interactions.filter((entry) => entry.targetNodeId === id && entry.trigger === trigger)) {
        const action = item.action;
        if (action.type === "show-annotation") setAnnotation(action.annotation);
        if (action.type === "toggle-visibility") { const part = parts.find((entry) => entry.id === id); if (part) part.object.visible = !part.object.visible; }
        if (action.type === "focus-camera") { const part = parts.find((entry) => entry.id === action.cameraTargetId); if (part) { const position = part.object.getWorldPosition(new Vector3()); camera.position.add(position.clone().sub(controls.target)); controls.target.copy(position); } }
        onInteraction?.(item.id, action.type);
      }
    };
    hotspotAction.current = (id) => { const item = config.interactions.find((entry) => entry.id === id && entry.trigger === "hotspot"); if (item) interact(item.targetNodeId, "hotspot"); };
    const click = (event: PointerEvent) => { const part = hit(event); if (part) { fire("click", part.id); interact(part.id, "click"); } };
    const hover = (event: PointerEvent) => { const part = hit(event); if (part) { fire("hover", part.id); interact(part.id, "hover"); } };
    renderer.domElement.addEventListener("click", click);
    renderer.domElement.addEventListener("pointermove", hover);
    const frame = (now: number) => {
      if (!active) return;
      const delta = Math.min((now - last) / 1000, 0.1); last = now;
      if (!reduced && mixer) {
        elapsed += delta;
        if (config.animation.sequence.length) {
          let end = 0;
          const schedule = config.animation.sequence.map((segment) => { const start = end - segment.overlapSeconds; end = start + segment.durationSeconds; return { segment, start, end }; });
          const time = config.animation.sequenceLoop && end ? elapsed % end : Math.min(elapsed, Math.max(0, end - 1e-6));
          schedule.forEach(({ segment, start, end: finish }, index) => {
            const action = actions.get(segment.id); const edit = edits.get(segment.clipId);
            if (!action || !edit) return;
            const enabled = segment.enabled && edit.enabled && time >= start && time < finish;
            const fadeIn = segment.overlapSeconds ? Math.min(1, (time - start) / segment.overlapSeconds) : 1;
            const overlapOut = schedule[index + 1]?.segment.overlapSeconds ?? 0;
            const fadeOut = overlapOut ? Math.min(1, (finish - time) / overlapOut) : 1;
            action.setEffectiveWeight(enabled ? segment.weight * Math.min(fadeIn, fadeOut) : 0);
            if (enabled) action.time = clipTime(edit, segment.sourceOffsetSeconds + time - start);
          });
          mixer.update(0);
          if (end && elapsed >= end && !config.animation.sequenceLoop && !sequenceEndFired) { sequenceEndFired = true; fire("clip-end", "sequence"); }
        } else {
          const edit = [...config.animation.embeddedClips, ...config.animation.importedClips].find((item) => item.enabled);
          const action = edit && actions.get(edit.id);
          if (action && edit) { action.time = clipTime(edit, elapsed); mixer.update(0); }
          else mixer.update(delta);
          if (edit?.loop === "once" && !clipEndFired && elapsed >= (edit.trimEnd - edit.trimStart) / edit.speed) { clipEndFired = true; fire("clip-end", edit.id); }
        }
      }
      controls.update(); renderer.render(scene, camera); requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const baseUrl = assetBaseUrl ?? document.baseURI;
    const modelUrl = new URL(manifest.modelPath, baseUrl).href;
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const fail = (error: unknown) => {
      if (!active) return;
      const issue = error instanceof Error ? error : new Error("Model loading failed");
      setLoadState("error"); setLoadError(issue.message); onError?.(issue);
    };
    const startModel = () => loader.load(modelUrl, (gltf) => {
      if (!active) return;
      root = cloneSkeleton(gltf.scene); scene.add(root);
      parts = indexParts(root);
      disposeAppearance = applyAppearance(parts, config);
      mixer = new AnimationMixer(root);
      const clips = new Map<string, AnimationClip>();
      for (const edit of config.animation.embeddedClips) if (gltf.animations[edit.sourceIndex]) clips.set(edit.id, gltf.animations[edit.sourceIndex]);
      for (const edit of config.animation.importedClips) clips.set(edit.id, importedAnimation(edit));
      if (config.animation.sequence.length) {
        for (const segment of config.animation.sequence) { const clip = clips.get(segment.clipId); if (clip) actions.set(segment.id, mixer.clipAction(clip.clone()).setEffectiveWeight(0).play()); }
        fire("clip-start", "sequence");
      } else {
        const edit = [...config.animation.embeddedClips, ...config.animation.importedClips].find((item) => item.enabled);
        const clip = edit ? clips.get(edit.id) : gltf.animations[0];
        if (clip && !reduced) { const action = mixer.clipAction(clip).play(); if (edit) actions.set(edit.id, action); }
        if (edit) fire("clip-start", edit.id);
      }
      for (const spec of config.animation.timelines) {
        const tween = gsap.timeline({ paused: true });
        for (const track of spec.tracks) {
          const part = parts.find((entry) => entry.id === track.targetId || (track.target === "morph" && track.targetId.startsWith(`${entry.id}:`)));
          const object = track.target === "camera" ? camera : track.target === "light" ? ({ ambient, key, fill } as Record<string, Object3D>)[track.targetId] : track.target === "material" && part?.object instanceof Mesh ? (Array.isArray(part.object.material) ? part.object.material[0] : part.object.material) : part?.object;
          let targetObject: unknown = object;
          if (track.target === "morph" && part?.object instanceof Mesh) { const index = Number(track.targetId.slice(part.id.length + 1)); const influences = part.object.morphTargetInfluences; targetObject = influences && Number.isInteger(index) && index >= 0 && index < influences.length ? { get influence() { return influences[index]; }, set influence(value: number) { influences[index] = value; } } : null; }
          const path = track.property.split(".");
          if (path.length === 2) targetObject = (targetObject as Record<string, unknown> | null)?.[path[0]];
          const property = path.at(-1)!;
          if (!targetObject || typeof (targetObject as Record<string, unknown>)[property] !== "number") continue;
          for (let index = 1; index < track.keyframes.length; index++) {
            const before = track.keyframes[index - 1], after = track.keyframes[index];
            tween.fromTo(targetObject, { [property]: before.value }, { [property]: after.value, duration: after.at - before.at, ease: "none", onUpdate: () => { if (object instanceof PerspectiveCamera) object.updateProjectionMatrix(); } }, before.at);
          }
        }
        timelines.push({ spec, tween });
      }
      fire("start"); fire("model-loaded");
      if (config.animation.timelines.some((item) => item.trigger.type === "scroll")) {
        scrollObserver = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) fire("scroll"); }, { threshold: 0.2 });
        scrollObserver.observe(host);
      }
      setHotspots(config.interactions.filter((item) => item.trigger === "hotspot" && parts.some((part) => part.id === item.targetNodeId)).map(({ id, targetNodeId }) => ({ id, targetNodeId })));
      setLoadState("ready"); onLoad?.();
    }, (event) => onProgress?.(event.loaded, event.total), fail);
    const policy = config.export.loadingPolicy;
    const selected = policy === "full-preload" ? manifest.files : policy === "critical-assets" ? manifest.files.filter((file) => config.export.criticalAssetIds.includes(file.path)) : [];
    void (async () => {
      let loaded = 0;
      const total = selected.reduce((sum, file) => sum + file.byteSize, 0);
      for (const file of selected) {
        const url = new URL(file.path, baseUrl).href;
        const hint = document.createElement("link"); hint.rel = "preload"; hint.as = "fetch"; hint.href = url; hint.crossOrigin = "anonymous"; document.head.append(hint); hints.push(hint);
        const response = await fetch(url, { signal: abort.signal });
        if (!response.ok) throw new Error(`Could not preload ${file.path} (${response.status}).`);
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== file.byteSize) throw new Error(`Preloaded ${file.path} has the wrong size.`);
        loaded += bytes.byteLength; if (active) onProgress?.(loaded, total);
      }
      if (active) startModel();
    })().catch((error) => { if (!abort.signal.aborted) fail(error); });
    return () => {
      active = false;
      abort.abort(); hints.forEach((hint) => hint.remove());
      observer.disconnect(); scrollObserver?.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener("click", click); renderer.domElement.removeEventListener("pointermove", hover);
      timelines.forEach(({ tween }) => tween.kill()); mixer?.stopAllAction(); disposeAppearance();
      root?.traverse((object) => { if (object instanceof Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); } });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [manifest, assetBaseUrl, onLoad, onError, onProgress, onInteraction, requested, attempt]);

  return <div className={className} style={{ position: "relative", width: "100%", height: "100%", minHeight: 240 }}>
    <div ref={mount} style={{ width: "100%", height: "100%" }} role="img" aria-label="3D model viewer" />
    {!requested ? <button type="button" style={{ position: "absolute", inset: "auto auto 12px 12px" }} onClick={() => setRequested(true)}>Load model</button> : null}
    {requested && loadState === "loading" ? <div role="status" style={{ position: "absolute", top: 12, left: 12, background: "#fff", color: "#111", padding: 8 }}>Loading model…</div> : null}
    {loadState === "error" ? <div role="alert" style={{ position: "absolute", top: 12, left: 12, background: "#fff", color: "#111", padding: 8 }}>{loadError}<button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry loading</button></div> : null}
    {hotspots.length ? <div style={{ position: "absolute", bottom: 12, left: 12 }}>{hotspots.map((hotspot) => <button key={hotspot.id} type="button" onClick={() => hotspotAction.current(hotspot.id)}>Hotspot {hotspot.id.slice(0, 8)}</button>)}</div> : null}
    {annotation ? <div role="status" style={{ position: "absolute", top: 12, left: 12, background: "#fff", color: "#111", padding: 8 }}>{annotation}<button type="button" onClick={() => setAnnotation(null)} aria-label="Close annotation">×</button></div> : null}
  </div>;
}
