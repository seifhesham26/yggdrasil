"use client";

import { useState } from "react";
import type { ProjectSnapshot } from "../domain/project-state";

export type PreviewSize = "desktop" | "tablet" | "mobile";

export function SceneControls({ snapshot, onChange, previewSize, onPreviewSize }: { snapshot: ProjectSnapshot; onChange: (snapshot: ProjectSnapshot) => void; previewSize: PreviewSize; onPreviewSize: (size: PreviewSize) => void }) {
  const [fovInput, setFovInput] = useState(String(snapshot.scene.camera.fov));
  const [error, setError] = useState<string | null>(null);
  const { scene } = snapshot;
  function update(next: Partial<ProjectSnapshot["scene"]>) { onChange({ ...snapshot, scene: { ...scene, ...next } }); }
  function updateCameraVector(key: "position" | "target", index: number, value: string) {
    const number = Number(value);
    if (!Number.isFinite(number) || Math.abs(number) > 100000) { setError(`Camera ${key} must be a finite number within ±100000.`); return; }
    setError(null);
    const next: [number, number, number] = [...scene.camera[key]];
    next[index] = number;
    update({ camera: { ...scene.camera, [key]: next } });
  }
  return <div className="scene-controls"><p>Scene settings are saved with this project. The original model stays unchanged.</p>
    <label>Background color<input aria-label="Background color" type="color" value={scene.background} onChange={(event) => update({ background: event.target.value })} /></label>
    <label>Environment<select value={scene.environment} onChange={(event) => update({ environment: event.target.value as ProjectSnapshot["scene"]["environment"] })}><option value="none">None</option><option value="studio">Studio</option><option value="outdoor">Outdoor</option></select></label>
    <label>Exposure<input type="number" min="-5" max="5" step="0.1" value={scene.exposure} onChange={(event) => { const number = Number(event.target.value); if (Number.isFinite(number) && number >= -5 && number <= 5) { setError(null); update({ exposure: number }); } else setError("Exposure must be between -5 and 5."); }} /></label>
    <label>Shadows<input type="checkbox" checked={scene.shadows} onChange={(event) => update({ shadows: event.target.checked })} /></label>
    <label>Controls<select value={scene.controls} onChange={(event) => update({ controls: event.target.value as ProjectSnapshot["scene"]["controls"] })}><option value="orbit">Orbit</option><option value="turntable">Turntable</option><option value="disabled">Disabled</option></select></label>
    <label>Reduced motion<input type="checkbox" checked={scene.reducedMotion} onChange={(event) => update({ reducedMotion: event.target.checked })} /></label>
    <label>Preview size<select value={previewSize} onChange={(event) => onPreviewSize(event.target.value as PreviewSize)}><option value="desktop">Desktop</option><option value="tablet">Tablet</option><option value="mobile">Mobile</option></select></label>
    <div className="scene-camera"><h3>Camera</h3><label>Camera FOV<input type="number" min="1" max="170" value={fovInput} onChange={(event) => { const value = event.target.value; setFovInput(value); const number = Number(value); if (!Number.isFinite(number) || number < 1 || number > 170) { setError("Camera FOV must be between 1 and 170."); return; } setError(null); update({ camera: { ...scene.camera, fov: number } }); }} /></label>
      {(["position", "target"] as const).map((key) => <div key={key} className="scene-camera-vector"><strong>Camera {key}</strong><div>{(["X", "Y", "Z"] as const).map((axis, index) => <label key={axis}>{axis}<input type="number" step="0.1" aria-label={`Camera ${key} ${axis}`} value={scene.camera[key][index]} onChange={(event) => updateCameraVector(key, index, event.target.value)} /></label>)}</div></div>)}
    </div>
    {error ? <p role="alert" className="scene-field-error">{error}</p> : null}
  </div>;
}
