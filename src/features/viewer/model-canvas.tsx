"use client";

import { useCallback, useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import { Grid2X2, RotateCcw } from "lucide-react";
import { ModelScene } from "./model-scene";
import { ViewerErrorBoundary } from "./viewer-error-boundary";
import type { ProjectSnapshot } from "@/features/projects/domain/project-state";
import type { PartSummary } from "@/features/projects/ui/scene-parts";
import { PerspectiveCamera, type Camera, type WebGLRenderer } from "three";
import { matchingInteractions } from "@/features/projects/ui/interaction-runtime";

export type ViewerFile = { relativePath: string; storageKey: string };
export type ProjectPresentation = {
  snapshot: ProjectSnapshot;
  onParts: (parts: PartSummary[]) => void;
  onSelectPart: (id: string) => void;
  onMissingParts: (ids: string[]) => void;
  previewInteractions?: boolean;
};

function applyProjectCamera(camera: Camera, gl: WebGLRenderer, settings: ProjectSnapshot["scene"], focusTarget?: [number, number, number] | null) {
  const target = focusTarget ?? settings.camera.target;
  const position = focusTarget ? settings.camera.position.map((coordinate, index) => coordinate + target[index] - settings.camera.target[index]) as [number, number, number] : settings.camera.position;
  camera.position.fromArray(position);
  camera.lookAt(...target);
  if (camera instanceof PerspectiveCamera) { camera.fov = settings.camera.fov; camera.updateProjectionMatrix(); }
  gl.toneMappingExposure = 2 ** settings.exposure;
  gl.setClearColor(settings.background);
}

function ProjectCamera({ settings, resetVersion, focusTarget }: { settings: ProjectSnapshot["scene"]; resetVersion: number; focusTarget?: [number, number, number] | null }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    applyProjectCamera(camera, gl, settings, focusTarget);
  }, [camera, gl, settings, resetVersion, focusTarget]);
  return null;
}

export function ModelCanvas({ modelUrl, primaryRelativePath, files, presentation }: { modelUrl: string; primaryRelativePath: string; files: ViewerFile[]; presentation?: ProjectPresentation }) {
  const [loading, setLoading] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [version, setVersion] = useState(0);
  const [frameVersion, setFrameVersion] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);
  const [previewParts, setPreviewParts] = useState<PartSummary[]>([]);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [focusTarget, setFocusTarget] = useState<[number, number, number] | null>(null);
  const [annotation, setAnnotation] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const onReady = useCallback(() => setLoading(false), []);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  function retry() { setLoading(true); setVersion((value) => value + 1); }
  const sceneSettings = presentation?.snapshot.scene;
  const forwardParts = presentation?.onParts;
  const handleParts = useCallback((parts: PartSummary[]) => { setPreviewParts(parts); forwardParts?.(parts); }, [forwardParts]);
  const handleInteraction = useCallback((partId: string, trigger: "click" | "hover" | "hotspot") => {
    if (!presentation?.previewInteractions) return;
    if (!previewParts.some((part) => part.id === partId)) return;
    for (const interaction of matchingInteractions(presentation.snapshot.interactions, partId, trigger)) {
      const action = interaction.action;
      if (action.type === "show-annotation") setAnnotation(action.annotation);
      else if (action.type === "toggle-visibility") setHiddenIds((current) => current.includes(partId) ? current.filter((id) => id !== partId) : [...current, partId]);
      else if (action.type === "focus-camera") {
        const part = previewParts.find((item) => item.id === action.cameraTargetId);
        if (part?.worldPosition) { setFocusTarget(part.worldPosition); setAnnotation(`Camera focused on ${part.name}.`); }
      } else if (action.type === "play-clip") setAnnotation("This clip is unavailable in the current preview.");
    }
  }, [presentation, previewParts]);

  return (
    <div className="viewer-shell">
      <div className="viewer-toolbar"><span>{presentation?.previewInteractions ? "Interaction preview" : "Live preview"}</span><div><button type="button" aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)}><Grid2X2 size={15} aria-hidden="true" /> Grid</button>{presentation ? <button type="button" onClick={() => setFrameVersion((value) => value + 1)}>Frame model</button> : null}<button type="button" onClick={() => { if (presentation) { setFocusTarget(null); setResetVersion((value) => value + 1); } else setFrameVersion((value) => value + 1); }}><RotateCcw size={15} aria-hidden="true" /> Reset view</button></div></div>
      <ViewerErrorBoundary key={version} onRetry={retry}>
        <div className="viewer-stage" role="img" aria-label="3D model preview" data-camera-focus={focusTarget?.join(",") ?? undefined}>
          <Canvas aria-label="3D model preview" camera={{ position: sceneSettings?.camera.position ?? [4, 3, 6], fov: sceneSettings?.camera.fov ?? 42, near: 0.01, far: 10000 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }} shadows={sceneSettings?.shadows}>
            <color attach="background" args={[sceneSettings?.background ?? "#0b2028"]} />
            {sceneSettings ? <ProjectCamera settings={sceneSettings} resetVersion={resetVersion} focusTarget={focusTarget} /> : null}
            <ambientLight intensity={sceneSettings?.environment === "none" ? 0.5 : sceneSettings?.environment === "outdoor" ? 1.6 : 1.3} />
            <directionalLight position={[5, 8, 6]} intensity={sceneSettings?.environment === "none" ? 1 : sceneSettings?.environment === "outdoor" ? 2.8 : 2.2} castShadow={sceneSettings?.shadows} />
            <directionalLight position={[-5, 3, -5]} intensity={0.8} color="#a4d1cc" />
            {showGrid ? <Grid position={[0, -1.2, 0]} infiniteGrid cellSize={0.5} sectionSize={2} cellColor="#21414a" sectionColor="#315862" fadeDistance={35} fadeStrength={1.4} /> : null}
            {sceneSettings?.controls !== "disabled" ? <OrbitControls key={`${resetVersion}:${focusTarget?.join(",") ?? "default"}`} makeDefault enableDamping minDistance={presentation ? 1e-9 : 0.01} maxDistance={presentation ? 1e12 : 10000} target={focusTarget ?? sceneSettings?.camera.target} autoRotate={sceneSettings?.controls === "turntable" && !reducedMotion && !sceneSettings?.reducedMotion} /> : null}
            <Bounds fit={!presentation} clip observe margin={1.3}>
              <ModelScene key={modelUrl} modelUrl={modelUrl} primaryRelativePath={primaryRelativePath} files={files} autoPlay={!reducedMotion && !sceneSettings?.reducedMotion} frameVersion={frameVersion} frameOnLoad={!presentation} frameCamera={sceneSettings?.camera} appearance={presentation?.snapshot.appearance.nodes} previewHiddenIds={presentation?.previewInteractions ? hiddenIds : undefined} onParts={presentation ? handleParts : undefined} onSelectPart={presentation?.previewInteractions ? undefined : presentation?.onSelectPart} onInteract={presentation?.previewInteractions ? handleInteraction : undefined} onMissingParts={presentation?.onMissingParts} onReady={onReady} />
            </Bounds>
          </Canvas>
          {loading ? <div className="viewer-loading" role="progressbar" aria-label="Loading model" aria-valuetext="Loading model"><span className="viewer-loader-orbit" aria-hidden="true" />Loading model</div> : null}
          {presentation?.previewInteractions ? <div className="viewer-interactions">{presentation.snapshot.interactions.filter((interaction) => interaction.trigger === "hotspot").map((interaction) => <button key={interaction.id} type="button" disabled={!previewParts.some((part) => part.id === interaction.targetNodeId)} onClick={() => handleInteraction(interaction.targetNodeId, "hotspot")}>Hotspot {interaction.id.slice(0, 8)}</button>)}{annotation ? <div role="status" className="viewer-annotation">{annotation}<button type="button" aria-label="Close annotation" onClick={() => setAnnotation(null)}>×</button></div> : null}</div> : null}
        </div>
      </ViewerErrorBoundary>
      <div className="viewer-foot"><span>Drag to orbit <span aria-hidden="true">/</span> Scroll to zoom</span><span>Original source preview</span></div>
    </div>
  );
}
