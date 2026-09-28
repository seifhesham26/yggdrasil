"use client";

import { useState } from "react";
import type { ProjectSnapshot } from "../domain/project-state";
import type { PartSummary } from "./scene-parts";
import type { VisualTimeline } from "@/features/viewer/visual-timeline";

type Track = VisualTimeline["tracks"][number];
const properties: Record<Track["target"], Track["property"][]> = {
  part: ["position.x", "position.y", "position.z", "rotation.x", "rotation.y", "rotation.z", "scale.x", "scale.y", "scale.z"],
  material: ["opacity", "roughness", "metalness"], camera: ["position.x", "position.y", "position.z", "fov"],
  light: ["position.x", "position.y", "position.z", "intensity"], morph: ["influence"],
};
const triggers: VisualTimeline["trigger"]["type"][] = ["start", "scroll", "click", "hover", "model-loaded", "clip-start", "clip-end"];

export function TimelineControls({ snapshot, parts, selectedId, progress, playing, warnings, onSelect, onProgress, onPlaying, onChange }: {
  snapshot: ProjectSnapshot; parts: PartSummary[]; selectedId: string | null; progress: number; playing: boolean; warnings: string[];
  onSelect: (id: string) => void; onProgress: (value: number) => void; onPlaying: (value: boolean) => void; onChange: (snapshot: ProjectSnapshot) => void;
}) {
  const [target, setTarget] = useState<Track["target"]>("part");
  const [targetId, setTargetId] = useState("");
  const [property, setProperty] = useState<Track["property"]>("position.x");
  const timelines = snapshot.animation.timelines;
  const selected = timelines.find((item) => item.id === selectedId);
  const triggerWarning = selected && (selected.trigger.type === "click" || selected.trigger.type === "hover") && !parts.some((part) => part.id === selected.trigger.targetId)
    ? `Timeline trigger part ${selected.trigger.targetId ?? "(none)"} is unavailable.`
    : selected && (selected.trigger.type === "clip-start" || selected.trigger.type === "clip-end") && ![...snapshot.animation.embeddedClips, ...snapshot.animation.importedClips].some((clip) => clip.id === selected.trigger.targetId) && !(selected.trigger.targetId === "sequence" && snapshot.animation.sequence.length)
      ? `Timeline trigger clip ${selected.trigger.targetId ?? "(none)"} is unavailable.` : null;
  const targets = target === "camera" ? [{ id: "main", name: "Main camera" }] : target === "light" ? ["ambient", "key", "fill"].map((id) => ({ id, name: `${id} light` })) : target === "morph" ? parts.flatMap((part) => (part.morphTargets ?? []).map((name, index) => ({ id: `${part.id}:${index}`, name: `${part.name} / ${name}` }))) : parts.filter((part) => target !== "material" || Boolean(part.materialName));
  const selectedTargetId = targets.some((item) => item.id === targetId) ? targetId : targets[0]?.id ?? "";

  function change(next: VisualTimeline[]) { onChange({ ...snapshot, animation: { ...snapshot.animation, timelines: next } }); }
  function editTimeline(id: string, update: Partial<VisualTimeline>) { change(timelines.map((item) => item.id === id ? { ...item, ...update } : item)); }
  function addTimeline() {
    if (timelines.length >= 50) return;
    const item: VisualTimeline = { id: crypto.randomUUID(), name: `Timeline ${timelines.length + 1}`, enabled: true, durationSeconds: 2, trigger: { type: "start", targetId: null }, tracks: [] };
    change([...timelines, item]); onSelect(item.id);
  }
  function moveTimeline(index: number, direction: -1 | 1) {
    const other = index + direction; if (other < 0 || other >= timelines.length) return;
    const next = [...timelines]; [next[index], next[other]] = [next[other], next[index]]; change(next);
  }
  function editTrack(id: string, update: Partial<Track>) {
    if (!selected) return;
    editTimeline(selected.id, { tracks: selected.tracks.map((item) => item.id === id ? { ...item, ...update } : item) });
  }
  function addTrack() {
    if (!selected || !selectedTargetId || selected.tracks.length >= 100) return;
    const currentProperty = properties[target].includes(property) ? property : properties[target][0];
    const initial = currentProperty === "fov" ? 45 : currentProperty === "opacity" || currentProperty === "roughness" || currentProperty === "metalness" ? 1 : 0;
    const track: Track = { id: crypto.randomUUID(), target, targetId: selectedTargetId, property: currentProperty, keyframes: [{ at: 0, value: initial }, { at: selected.durationSeconds, value: initial }] };
    editTimeline(selected.id, { tracks: [...selected.tracks, track] });
  }
  function changeKeyframe(track: Track, index: number, update: Partial<Track["keyframes"][number]>) {
    const keyframes = track.keyframes.map((frame, frameIndex) => frameIndex === index ? { ...frame, ...update } : frame);
    if (keyframes.some((frame, frameIndex) => frame.at < 0 || frame.at > selected!.durationSeconds || (frameIndex > 0 && frame.at <= keyframes[frameIndex - 1].at))) return;
    if (["opacity", "roughness", "metalness", "influence"].includes(track.property) && keyframes.some((frame) => frame.value < 0 || frame.value > 1)) return;
    if (track.property === "fov" && keyframes.some((frame) => frame.value < 1 || frame.value > 170)) return;
    editTrack(track.id, { keyframes });
  }

  return <section aria-label="Visual timelines" className="visual-timelines">
    <h3>Visual timelines</h3><p>Animate model parts, materials, camera, lights, and morph targets with numeric keyframes.</p>
    <button type="button" onClick={addTimeline} disabled={timelines.length >= 50}>Add timeline</button>
    <ol aria-label="Saved timelines">{timelines.map((item, index) => <li key={item.id}>
      <button type="button" aria-pressed={selectedId === item.id} onClick={() => onSelect(item.id)}>{item.name}</button>
      <span>{item.trigger.type} · {item.tracks.length} tracks</span>
      <button type="button" aria-label={`Move timeline ${index + 1} earlier`} disabled={index === 0} onClick={() => moveTimeline(index, -1)}>↑</button>
      <button type="button" aria-label={`Move timeline ${index + 1} later`} disabled={index === timelines.length - 1} onClick={() => moveTimeline(index, 1)}>↓</button>
      <button type="button" aria-label={`Remove timeline ${index + 1}`} onClick={() => { change(timelines.filter((entry) => entry.id !== item.id)); if (selectedId === item.id) onSelect(""); }}>Remove</button>
    </li>)}</ol>
    {selected ? <div className="visual-timeline-editor">
      <label>Name<input aria-label="Timeline name" maxLength={120} value={selected.name} onChange={(event) => { if (event.target.value.trim()) editTimeline(selected.id, { name: event.target.value }); }} /></label>
      <label><input type="checkbox" checked={selected.enabled} onChange={(event) => editTimeline(selected.id, { enabled: event.target.checked })} /> Enabled</label>
      <label>Duration (s)<input aria-label="Timeline duration" type="number" min={0.01} max={3600} step={0.01} value={selected.durationSeconds} onChange={(event) => { const value = Number(event.target.value); if (value > 0 && value <= 3600 && selected.tracks.every((track) => track.keyframes.at(-1)!.at <= value)) editTimeline(selected.id, { durationSeconds: value }); }} /></label>
      <label>Trigger<select aria-label="Timeline trigger" value={selected.trigger.type} onChange={(event) => { const type = event.target.value as VisualTimeline["trigger"]["type"]; const firstClip = [...snapshot.animation.embeddedClips, ...snapshot.animation.importedClips][0]?.id ?? ""; editTimeline(selected.id, { trigger: { type, targetId: type === "click" || type === "hover" ? parts[0]?.id ?? "" : type === "clip-start" || type === "clip-end" ? firstClip : null } }); }}>{triggers.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
      {selected.trigger.type === "click" || selected.trigger.type === "hover" ? <label>Trigger part<select aria-label="Timeline trigger part" value={selected.trigger.targetId ?? ""} onChange={(event) => editTimeline(selected.id, { trigger: { ...selected.trigger, targetId: event.target.value } })}>{parts.map((part) => <option key={part.id} value={part.id}>{part.name} · {part.id}</option>)}</select></label> : null}
      {selected.trigger.type === "clip-start" || selected.trigger.type === "clip-end" ? <label>Trigger clip<select aria-label="Timeline trigger clip" value={selected.trigger.targetId ?? ""} onChange={(event) => editTimeline(selected.id, { trigger: { ...selected.trigger, targetId: event.target.value } })}>{[...snapshot.animation.embeddedClips, ...snapshot.animation.importedClips].map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}{snapshot.animation.sequence.length ? <option value="sequence">Sequence</option> : null}</select></label> : null}
      <div className="animation-transport"><button type="button" onClick={() => onPlaying(!playing)}>{playing ? "Pause timeline" : "Play timeline"}</button><label>Scrub timeline<input type="range" aria-label="Scrub timeline" min={0} max={1} step={0.001} value={progress} onChange={(event) => onProgress(Number(event.target.value))} /></label><output>{(progress * selected.durationSeconds).toFixed(2)} s</output></div>
      <h4>Tracks</h4><div className="timeline-add-track">
        <label>Target class<select aria-label="Timeline target class" value={target} onChange={(event) => { const next = event.target.value as Track["target"]; setTarget(next); setTargetId(""); setProperty(properties[next][0]); }}>{Object.keys(properties).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Target<select aria-label="Timeline target" value={selectedTargetId} onChange={(event) => setTargetId(event.target.value)}>{targets.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label>
        <label>Property<select aria-label="Timeline property" value={properties[target].includes(property) ? property : properties[target][0]} onChange={(event) => setProperty(event.target.value as Track["property"])}>{properties[target].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <button type="button" onClick={addTrack} disabled={!selectedTargetId || selected.tracks.length >= 100}>Add track</button>
      </div>
      <ol aria-label="Timeline tracks">{selected.tracks.map((track, index) => <li key={track.id}>
        <strong>{track.target} · {track.property}</strong><small>{track.targetId}</small>
        <button type="button" aria-label={`Remove track ${index + 1}`} onClick={() => editTimeline(selected.id, { tracks: selected.tracks.filter((entry) => entry.id !== track.id) })}>Remove</button>
        {track.keyframes.map((frame, frameIndex) => <div key={frameIndex} className="timeline-keyframe">
          <label>Time<input aria-label={`Track ${index + 1} keyframe ${frameIndex + 1} time`} type="number" min={0} max={selected.durationSeconds} step={0.01} disabled={frameIndex === 0} value={frame.at} onChange={(event) => changeKeyframe(track, frameIndex, { at: Number(event.target.value) })} /></label>
          <label>Value<input aria-label={`Track ${index + 1} keyframe ${frameIndex + 1} value`} type="number" step={0.01} value={frame.value} onChange={(event) => changeKeyframe(track, frameIndex, { value: Number(event.target.value) })} /></label>
          <button type="button" aria-label={`Remove track ${index + 1} keyframe ${frameIndex + 1}`} disabled={track.keyframes.length <= 2 || frameIndex === 0} onClick={() => editTrack(track.id, { keyframes: track.keyframes.filter((_, itemIndex) => itemIndex !== frameIndex) })}>Remove keyframe</button>
        </div>)}
        <button type="button" disabled={track.keyframes.length >= 100 || !track.keyframes.some((frame, frameIndex) => frameIndex && frame.at - track.keyframes[frameIndex - 1].at > 0.02)} onClick={() => { const pair = track.keyframes.findIndex((frame, frameIndex) => frameIndex && frame.at - track.keyframes[frameIndex - 1].at > 0.02); if (pair > 0) { const before = track.keyframes[pair - 1]; const after = track.keyframes[pair]; const keyframes = [...track.keyframes]; keyframes.splice(pair, 0, { at: (before.at + after.at) / 2, value: (before.value + after.value) / 2 }); editTrack(track.id, { keyframes }); } }}>Add keyframe</button>
      </li>)}</ol>
      {warnings.map((warning) => <p role="alert" key={warning}>{warning}</p>)}
      {triggerWarning ? <p role="alert">{triggerWarning}</p> : null}
    </div> : null}
  </section>;
}
