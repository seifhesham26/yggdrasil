"use client";

import { useState } from "react";
import type { ProjectSnapshot } from "../domain/project-state";
import { sourceClipEdit, type ClipEdit, type ClipSource } from "@/features/viewer/animation-clips";
import { analyzeImportedClip, attachImportedClip, parseImportedAnimationSource, targetRootFromParts, type ImportedClipAnalysis, type ImportedClipAttachment } from "@/features/viewer/imported-clips";
import type { PartSummary } from "./scene-parts";
import { sequenceDuration, sequenceSchedule, type SequenceSegment } from "@/features/viewer/clip-sequence";

type PendingImport = { file: File; analysis: ImportedClipAnalysis; manualMapping: Record<string, string> };

function normalizeSequence(items: SequenceSegment[]): SequenceSegment[] {
  const result = items.map((item, index) => ({ ...item, overlapSeconds: index ? Math.min(item.overlapSeconds, item.durationSeconds, items[index - 1].durationSeconds) : 0 }));
  for (let index = 1; index < result.length - 1; index++) result[index + 1].overlapSeconds = Math.min(result[index + 1].overlapSeconds, result[index].durationSeconds - result[index].overlapSeconds);
  return result;
}

export function AnimationControls({ snapshot, sources, parts = [], sequenceWarnings = [], selectedKey, progress, playing, onSelect, onProgress, onPlaying, onRestart, onChange, onImport }: {
  snapshot: ProjectSnapshot; sources: ClipSource[]; parts?: PartSummary[]; selectedKey: string | null; progress: number; playing: boolean;
  sequenceWarnings?: string[]; onSelect: (key: string) => void; onProgress: (progress: number) => void; onPlaying: (playing: boolean) => void; onRestart: () => void;
  onChange: (snapshot: ProjectSnapshot) => void; onImport?: (file: File, clip: ImportedClipAttachment) => Promise<void>;
}) {
  const copies = snapshot.animation.embeddedClips;
  const imported = snapshot.animation.importedClips;
  const selectedCopy = copies.find((clip) => clip.id === selectedKey);
  const selectedImported = imported.find((clip) => clip.id === selectedKey);
  const sourceIndex = selectedCopy?.sourceIndex ?? (selectedKey?.startsWith("source-") ? Number(selectedKey.slice(7)) : -1);
  const source = sources[sourceIndex];
  const selected = selectedCopy ?? (source ? { ...sourceClipEdit(source), id: `source-${sourceIndex}` } : null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const sequence = snapshot.animation.sequence;
  const schedule = sequenceSchedule(sequence);

  function changeSequence(items: SequenceSegment[]) {
    onChange({ ...snapshot, animation: { ...snapshot.animation, sequence: normalizeSequence(items) } });
  }

  function addToSequence(clip: ClipEdit | ImportedClipAttachment) {
    if (sequence.length >= 200) return;
    const durationSeconds = Math.max(0.001, (clip.trimEnd - clip.trimStart) / clip.speed);
    changeSequence([...sequence, { id: crypto.randomUUID(), clipId: clip.id, durationSeconds, overlapSeconds: 0, sourceOffsetSeconds: 0, weight: 1, enabled: true }]);
    onSelect("sequence");
  }

  function moveSequence(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sequence.length) return;
    const items = [...sequence];
    [items[index], items[target]] = [items[target], items[index]];
    items.forEach((item, position) => { items[position] = { ...item, overlapSeconds: sequence[position].overlapSeconds }; });
    changeSequence(items);
  }

  function editSegment(id: string, changes: Partial<SequenceSegment>) {
    changeSequence(sequence.map((item) => item.id === id ? { ...item, ...changes } : item));
  }

  function change(next: ClipEdit) {
    onChange({ ...snapshot, animation: { ...snapshot.animation, embeddedClips: copies.map((clip) => clip.id === next.id ? next : clip) } });
  }

  function changeImported(next: ImportedClipAttachment) {
    onChange({ ...snapshot, animation: { ...snapshot.animation, importedClips: imported.map((clip) => clip.id === next.id ? next : clip) } });
  }

  function addCopy(sourceClip: ClipSource, from?: ClipEdit) {
    if (copies.length >= 200) return;
    const copy = from ? { ...from, id: crypto.randomUUID(), name: `${from.name} copy` } : sourceClipEdit(sourceClip);
    onChange({ ...snapshot, animation: { ...snapshot.animation, embeddedClips: [...copies, copy] } });
    onSelect(copy.id);
  }

  async function inspectFile(file: File) {
    setImportError(null);
    try {
      const source = await parseImportedAnimationSource(new Uint8Array(await file.arrayBuffer()), file.name);
      setPending({ file, analysis: analyzeImportedClip(source.clip, source.root, targetRootFromParts(parts)), manualMapping: {} });
    } catch (error) {
      setPending(null);
      setImportError(error instanceof Error ? error.message : "Animation manifest could not be read.");
    }
  }

  async function attachPending() {
    if (!pending || !onImport) return;
    try {
      const clip = attachImportedClip({ ...pending.analysis, manualMapping: pending.manualMapping }, { id: crypto.randomUUID(), sourceFileName: pending.file.name, sourceStorageKey: "pending", sourceSha256: "0".repeat(64), sourceClipIndex: 0 });
      await onImport(pending.file, clip);
      setPending(null);
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Animation import failed.");
    }
  }

  const unresolved = pending?.analysis.mapping.filter((entry) => !pending.manualMapping[entry.sourceBone] && entry.status !== "matched") ?? [];
  return <div className="animation-controls">
    <p>Source clips stay in the model. Add a project copy to change its name, trim, speed, loop, or enablement.</p>
    <section aria-label="Imported animation clips" className="animation-import">
      <h3>Imported clips</h3>
      {!onImport ? <p role="status">Save project changes before importing an animation.</p> : null}
      <label>Import animation<input aria-label="Import animation" type="file" accept=".glb,.gltf,.json,.ygganimation,model/gltf-binary,model/gltf+json,application/json" disabled={!onImport} onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspectFile(file); event.currentTarget.value = ""; }} /></label>
      {importError ? <p role="alert">{importError}</p> : null}
      {pending ? <div className="animation-mapping" aria-label="Imported clip mapping"><p><strong>{pending.analysis.name}</strong> · {pending.analysis.durationSeconds.toFixed(2)} s</p>
        {pending.analysis.mapping.map((entry) => <label key={entry.sourceBone}>{entry.sourceBone}<select aria-label={`Map ${entry.sourceBone}`} value={pending.manualMapping[entry.sourceBone] ?? (entry.status === "matched" ? entry.targetBone ?? "" : "")} onChange={(event) => setPending((current) => current ? { ...current, manualMapping: { ...current.manualMapping, [entry.sourceBone]: event.target.value } } : current)}><option value="">Resolve target</option>{entry.candidates.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}</select></label>)}
        {pending.analysis.warnings.map((warning) => <p role="status" key={warning}>{warning}</p>)}
        {pending.analysis.problems.map((problem) => <p role="alert" key={problem}>{problem}</p>)}
        {unresolved.length ? <p role="alert">Resolve every ambiguous or missing target before attaching.</p> : null}
        <button type="button" onClick={() => void attachPending()} disabled={!onImport || unresolved.length > 0 || pending.analysis.problems.length > 0}>Attach imported clip</button>
      </div> : null}
      <ul aria-label="Imported clips">{imported.map((clip) => <li key={clip.id}><button type="button" aria-pressed={selectedKey === clip.id} onClick={() => onSelect(clip.id)}>{clip.name}</button><span>{clip.sourceFileName} · {clip.enabled ? "enabled" : "disabled"}</span><button type="button" onClick={() => addToSequence(clip)} disabled={sequence.length >= 200}>Add to sequence</button><button type="button" onClick={() => onChange({ ...snapshot, animation: { ...snapshot.animation, importedClips: imported.filter((item) => item.id !== clip.id) } })}>Remove</button></li>)}</ul>
    </section>
    <section aria-label="Clip sequence" className="animation-sequence">
      <h3>Clip sequence</h3>
      <p>Segments play in list order. Overlap crossfades adjacent clips; source offset starts within the clip trim.</p>
      <label><input type="checkbox" checked={snapshot.animation.sequenceLoop} onChange={(event) => onChange({ ...snapshot, animation: { ...snapshot.animation, sequenceLoop: event.target.checked } })} /> Loop sequence</label>
      <p>Total {sequenceDuration(sequence).toFixed(2)} s</p>
      <ol>{schedule.map(({ segment, start, end }, index) => {
        const clip = [...copies, ...imported].find((item) => item.id === segment.clipId);
        return <li key={segment.id}>
          <strong>{clip?.name ?? `Missing clip ${segment.clipId}`}</strong> <span>{start.toFixed(2)}–{end.toFixed(2)} s</span>
          <button type="button" aria-label={`Move segment ${index + 1} earlier`} disabled={index === 0} onClick={() => moveSequence(index, -1)}>↑</button>
          <button type="button" aria-label={`Move segment ${index + 1} later`} disabled={index === sequence.length - 1} onClick={() => moveSequence(index, 1)}>↓</button>
          <button type="button" aria-label={`Remove segment ${index + 1}`} onClick={() => changeSequence(sequence.filter((item) => item.id !== segment.id))}>Remove</button>
          <label><input type="checkbox" checked={segment.enabled} onChange={(event) => editSegment(segment.id, { enabled: event.target.checked })} /> Enabled</label>
          <label>Duration (s)<input aria-label={`Segment ${index + 1} duration`} type="number" min={0.001} max={3600} step={0.01} value={segment.durationSeconds} onChange={(event) => { const value = Number(event.target.value); if (value > 0 && value <= 3600) editSegment(segment.id, { durationSeconds: value }); }} /></label>
          <label>Overlap (s)<input aria-label={`Segment ${index + 1} overlap`} type="number" min={0} max={index ? Math.min(60, segment.durationSeconds, sequence[index - 1].durationSeconds) : 0} step={0.01} disabled={index === 0} value={segment.overlapSeconds} onChange={(event) => { const value = Number(event.target.value); if (value >= 0 && value <= 60) editSegment(segment.id, { overlapSeconds: value }); }} /></label>
          <label>Source offset (s)<input aria-label={`Segment ${index + 1} source offset`} type="number" min={0} step={0.01} value={segment.sourceOffsetSeconds} onChange={(event) => { const value = Number(event.target.value); if (value >= 0) editSegment(segment.id, { sourceOffsetSeconds: value }); }} /></label>
          <label>Weight<input aria-label={`Segment ${index + 1} weight`} type="number" min={0} max={1} step={0.05} value={segment.weight} onChange={(event) => { const value = Number(event.target.value); if (value >= 0 && value <= 1) editSegment(segment.id, { weight: value }); }} /></label>
        </li>;
      })}</ol>
      {sequenceWarnings.map((warning) => <p role="alert" key={warning}>{warning}</p>)}
      <div className="animation-transport"><button type="button" disabled={!sequence.length} onClick={() => onSelect("sequence")}>Preview sequence</button>{selectedKey === "sequence" ? <><button type="button" disabled={!sequence.length} onClick={() => onPlaying(!playing)}>{playing ? "Pause" : "Play"}</button><button type="button" onClick={onRestart}>Restart</button><label>Scrub sequence<input aria-label="Scrub sequence" type="range" min={0} max={1} step={0.001} value={progress} onChange={(event) => onProgress(Number(event.target.value))} /></label><output>{(progress * sequenceDuration(sequence)).toFixed(2)} s</output></> : null}</div>
    </section>
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
      <button type="button" onClick={() => addToSequence(clip)} disabled={sequence.length >= 200}>Add to sequence</button>
      <button type="button" onClick={() => { const sourceClip = sources[clip.sourceIndex]; if (sourceClip) addCopy(sourceClip, clip); }} disabled={!sources[clip.sourceIndex] || copies.length >= 200}>Duplicate</button>
      <button type="button" aria-label={`Remove ${clip.name}`} onClick={() => { onChange({ ...snapshot, animation: { ...snapshot.animation, embeddedClips: copies.filter((item) => item.id !== clip.id) } }); if (selectedKey === clip.id) onSelect(`source-${clip.sourceIndex}`); }}>Remove</button>
    </li>)}</ul>
    {selectedImported ? <section aria-label="Selected imported clip" className="animation-selected"><h3>Imported clip: {selectedImported.name}</h3><p>Source {selectedImported.sourceFileName} · {selectedImported.mapping.length} mapped targets</p><label><input type="checkbox" checked={selectedImported.enabled} onChange={(event) => onChange({ ...snapshot, animation: { ...snapshot.animation, importedClips: imported.map((clip) => clip.id === selectedImported.id ? { ...clip, enabled: event.target.checked } : clip) } })} /> Enabled</label><div className="animation-transport"><button type="button" disabled={!selectedImported.enabled} onClick={() => onPlaying(!playing)}>{playing ? "Pause" : "Play"}</button><button type="button" onClick={onRestart}>Restart</button><label>Scrub<input aria-label="Scrub clip" type="range" min={0} max={1} step={0.001} value={progress} onChange={(event) => onProgress(Number(event.target.value))} /></label><output>{(selectedImported.trimStart + progress * (selectedImported.trimEnd - selectedImported.trimStart)).toFixed(2)} s</output></div></section> : null}
    {selectedImported ? <section aria-label="Imported clip timing" className="animation-selected">
      <label>Imported clip name<input aria-label="Imported clip name" value={selectedImported.name} maxLength={120} onChange={(event) => { if (event.target.value.trim()) changeImported({ ...selectedImported, name: event.target.value }); }} /></label>
      <label>Imported trim start (s)<input aria-label="Imported trim start" type="number" min={0} max={selectedImported.trimEnd - 0.001} step={0.01} value={selectedImported.trimStart} onChange={(event) => { const value = Number(event.target.value); if (value >= 0 && value < selectedImported.trimEnd) changeImported({ ...selectedImported, trimStart: value }); }} /></label>
      <label>Imported trim end (s)<input aria-label="Imported trim end" type="number" min={selectedImported.trimStart + 0.001} max={selectedImported.durationSeconds} step={0.01} value={selectedImported.trimEnd} onChange={(event) => { const value = Number(event.target.value); if (value > selectedImported.trimStart && value <= selectedImported.durationSeconds) changeImported({ ...selectedImported, trimEnd: value }); }} /></label>
      <label>Imported speed<input aria-label="Imported speed" type="number" min={0.05} max={8} step={0.05} value={selectedImported.speed} onChange={(event) => { const value = Number(event.target.value); if (value >= 0.05 && value <= 8) changeImported({ ...selectedImported, speed: value }); }} /></label>
      <label>Imported loop<select aria-label="Imported loop" value={selectedImported.loop} onChange={(event) => changeImported({ ...selectedImported, loop: event.target.value as ImportedClipAttachment["loop"] })}><option value="once">Once</option><option value="repeat">Repeat</option><option value="pingpong">Ping pong</option></select></label>
    </section> : null}
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
