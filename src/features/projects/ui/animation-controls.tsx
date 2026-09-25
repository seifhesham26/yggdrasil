"use client";

import type { ProjectSnapshot } from "../domain/project-state";
import { sourceClipEdit, type ClipEdit, type ClipSource } from "@/features/viewer/animation-clips";

export function AnimationControls({ snapshot, sources, selectedKey, progress, playing, onSelect, onProgress, onPlaying, onRestart, onChange }: {
  snapshot: ProjectSnapshot; sources: ClipSource[]; selectedKey: string | null; progress: number; playing: boolean;
  onSelect: (key: string) => void; onProgress: (progress: number) => void; onPlaying: (playing: boolean) => void; onRestart: () => void;
  onChange: (snapshot: ProjectSnapshot) => void;
}) {
  const copies = snapshot.animation.embeddedClips;
  const selectedCopy = copies.find((clip) => clip.id === selectedKey);
  const sourceIndex = selectedCopy?.sourceIndex ?? (selectedKey?.startsWith("source-") ? Number(selectedKey.slice(7)) : -1);
  const source = sources[sourceIndex];
  const selected = selectedCopy ?? (source ? { ...sourceClipEdit(source), id: `source-${sourceIndex}` } : null);

  function change(next: ClipEdit) {
    onChange({ ...snapshot, animation: { ...snapshot.animation, embeddedClips: copies.map((clip) => clip.id === next.id ? next : clip) } });
  }

  function addCopy(source: ClipSource, from?: ClipEdit) {
    if (copies.length >= 200) return;
    const copy = from ? { ...from, id: crypto.randomUUID(), name: `${from.name} copy` } : sourceClipEdit(source);
    onChange({ ...snapshot, animation: { ...snapshot.animation, embeddedClips: [...copies, copy] } });
    onSelect(copy.id);
  }

  return <div className="animation-controls">
    <p>Source clips stay in the model. Add a project copy to change its name, trim, speed, loop, or enablement.</p>
    {!sources.length ? <p role="status">This model has no embedded clips.</p> : null}
    <h3>Source clips</h3>
    <ul aria-label="Source clips">{sources.map((clip) => <li key={clip.sourceIndex}>
      <button type="button" aria-pressed={selectedKey === `source-${clip.sourceIndex}`} onClick={() => onSelect(`source-${clip.sourceIndex}`)}>{clip.name}</button>
      <span>{clip.durationSeconds.toFixed(2)} s · {clip.targets.length} targets</span>
      <button type="button" onClick={() => addCopy(clip)} disabled={copies.length >= 200}>Add project copy</button>
    </li>)}</ul>
    <h3>Project copies</h3>
    <ul aria-label="Project clips">{copies.map((clip) => <li key={clip.id}>
      <button type="button" aria-pressed={selectedKey === clip.id} onClick={() => onSelect(clip.id)}>{clip.name}</button>
      <span>Source {clip.sourceIndex + 1} · {clip.enabled ? "enabled" : "disabled"}</span>
      <button type="button" onClick={() => { const source = sources[clip.sourceIndex]; if (source) addCopy(source, clip); }} disabled={!sources[clip.sourceIndex] || copies.length >= 200}>Duplicate</button>
      <button type="button" aria-label={`Remove ${clip.name}`} onClick={() => { onChange({ ...snapshot, animation: { ...snapshot.animation, embeddedClips: copies.filter((item) => item.id !== clip.id) } }); if (selectedKey === clip.id) onSelect(`source-${clip.sourceIndex}`); }}>Remove</button>
    </li>)}</ul>
    {selected && source ? <section aria-label="Selected clip" className="animation-selected">
      <h3>{selectedCopy ? "Project copy" : "Source clip"}: {selected.name}</h3>
      <p>Duration {source.durationSeconds.toFixed(2)} s · Targets: {source.targets.join(", ") || "none"}</p>
      <p>{source.usesSkeleton ? "Skeleton tracks · " : ""}{source.usesMorph ? "Morph tracks" : ""}</p>
      {source.missingTargets.length ? <p role="alert">Missing target: {source.missingTargets.join(", ")}. Available tracks can still preview.</p> : null}
      {selectedCopy ? <>
        <label>Clip name<input aria-label="Clip name" value={selectedCopy.name} maxLength={120} onChange={(event) => { if (event.target.value.trim()) change({ ...selectedCopy, name: event.target.value }); }} /></label>
        <label><input type="checkbox" checked={selectedCopy.enabled} onChange={(event) => change({ ...selectedCopy, enabled: event.target.checked })} /> Enabled</label>
        <label>Trim start (s)<input type="number" min={0} max={selectedCopy.trimEnd - 0.001} step="0.01" value={selectedCopy.trimStart} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0 && value < selectedCopy.trimEnd) change({ ...selectedCopy, trimStart: value }); }} /></label>
        <label>Trim end (s)<input type="number" min={selectedCopy.trimStart + 0.001} max={source.durationSeconds} step="0.01" value={selectedCopy.trimEnd} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value > selectedCopy.trimStart && value <= source.durationSeconds) change({ ...selectedCopy, trimEnd: value }); }} /></label>
        <label>Speed<input type="number" min={0.05} max={8} step="0.05" value={selectedCopy.speed} onChange={(event) => { const value = Number(event.target.value); if (value >= 0.05 && value <= 8) change({ ...selectedCopy, speed: value }); }} /></label>
        <label>Loop<select value={selectedCopy.loop} onChange={(event) => change({ ...selectedCopy, loop: event.target.value as ClipEdit["loop"] })}><option value="once">Once</option><option value="repeat">Repeat</option><option value="pingpong">Ping pong</option></select></label>
      </> : null}
      <div className="animation-transport"><button type="button" disabled={!selected.enabled} onClick={() => onPlaying(!playing)}>{playing ? "Pause" : "Play"}</button><button type="button" onClick={onRestart}>Restart</button><label>Scrub<input aria-label="Scrub clip" type="range" min={0} max={1} step={0.001} value={progress} onChange={(event) => onProgress(Number(event.target.value))} /></label><output>{((selected.trimStart + progress * (selected.trimEnd - selected.trimStart))).toFixed(2)} s</output></div>
    </section> : null}
  </div>;
}
