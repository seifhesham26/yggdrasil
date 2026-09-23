"use client";

import { useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls } from "@react-three/drei";
import { Grid2X2, RotateCcw } from "lucide-react";
import { ModelScene } from "./model-scene";
import { ViewerErrorBoundary } from "./viewer-error-boundary";

export type ViewerFile = { relativePath: string; storageKey: string };

export function ModelCanvas({ modelUrl, primaryRelativePath, files }: { modelUrl: string; primaryRelativePath: string; files: ViewerFile[] }) {
  const [loading, setLoading] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [version, setVersion] = useState(0);
  const [frameVersion, setFrameVersion] = useState(0);
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

  return (
    <div className="viewer-shell">
      <div className="viewer-toolbar"><span>Live preview</span><div><button type="button" aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)}><Grid2X2 size={15} aria-hidden="true" /> Grid</button><button type="button" onClick={() => setFrameVersion((value) => value + 1)}><RotateCcw size={15} aria-hidden="true" /> Reset view</button></div></div>
      <ViewerErrorBoundary key={version} onRetry={retry}>
        <div className="viewer-stage" role="img" aria-label="3D model preview">
          <Canvas aria-label="3D model preview" camera={{ position: [4, 3, 6], fov: 42, near: 0.01, far: 10000 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
            <color attach="background" args={["#0b2028"]} />
            <ambientLight intensity={1.3} />
            <directionalLight position={[5, 8, 6]} intensity={2.2} />
            <directionalLight position={[-5, 3, -5]} intensity={0.8} color="#a4d1cc" />
            {showGrid ? <Grid position={[0, -1.2, 0]} infiniteGrid cellSize={0.5} sectionSize={2} cellColor="#21414a" sectionColor="#315862" fadeDistance={35} fadeStrength={1.4} /> : null}
            <OrbitControls makeDefault enableDamping minDistance={0.01} maxDistance={10000} />
            <Bounds fit clip observe margin={1.3}>
              <ModelScene key={modelUrl} modelUrl={modelUrl} primaryRelativePath={primaryRelativePath} files={files} autoPlay={!reducedMotion} frameVersion={frameVersion} onReady={onReady} />
            </Bounds>
          </Canvas>
          {loading ? <div className="viewer-loading" role="progressbar" aria-label="Loading model" aria-valuetext="Loading model"><span className="viewer-loader-orbit" aria-hidden="true" />Loading model</div> : null}
        </div>
      </ViewerErrorBoundary>
      <div className="viewer-foot"><span>Drag to orbit <span aria-hidden="true">/</span> Scroll to zoom</span><span>Original source preview</span></div>
    </div>
  );
}
