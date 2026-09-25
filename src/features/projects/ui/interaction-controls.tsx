"use client";

import { useState } from "react";
import type { ProjectSnapshot } from "../domain/project-state";
import { interactionWarnings } from "./interaction-runtime";
import type { PartSummary } from "./scene-parts";

type Interaction = ProjectSnapshot["interactions"][number];

export function InteractionControls({ snapshot, parts, previewing, onPreview, onChange }: { snapshot: ProjectSnapshot; parts: PartSummary[]; previewing: boolean; onPreview: (enabled: boolean) => void; onChange: (snapshot: ProjectSnapshot) => void }) {
  const [targetId, setTargetId] = useState("");
  const [trigger, setTrigger] = useState<Interaction["trigger"]>("click");
  const [actionType, setActionType] = useState<Interaction["action"]["type"]>("toggle-visibility");
  const [annotation, setAnnotation] = useState("");
  const [cameraTargetId, setCameraTargetId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const warnings = interactionWarnings(snapshot.interactions, parts);

  function add() {
    if (!parts.some((part) => part.id === targetId)) { setError("Choose a valid model part."); return; }
    let action: Interaction["action"];
    if (actionType === "show-annotation") {
      if (!annotation.trim() || annotation.length > 2000) { setError("Annotation text must contain 1 to 2000 characters."); return; }
      action = { type: "show-annotation", annotation: annotation.trim() };
    } else if (actionType === "focus-camera") {
      if (!parts.some((part) => part.id === cameraTargetId)) { setError("Choose a valid camera target."); return; }
      action = { type: "focus-camera", cameraTargetId };
    } else action = { type: "toggle-visibility" };
    const interaction: Interaction = { id: globalThis.crypto?.randomUUID?.() ?? `action-${Date.now()}`, targetNodeId: targetId, trigger, action };
    onChange({ ...snapshot, interactions: [...snapshot.interactions, interaction] });
    setError(null);
    setAnnotation("");
  }

  return <div className="interaction-controls"><p>Add an allowlisted response to a model part. Preview mode runs actions; editing mode only selects parts.</p>
    <button type="button" className="interaction-preview-toggle" aria-pressed={previewing} onClick={() => onPreview(!previewing)}>{previewing ? "Exit preview" : "Preview interactions"}</button>
    <label>Interaction target<select value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Choose part</option>{parts.map((part) => <option key={part.id} value={part.id}>{part.name} · {part.id}</option>)}</select></label>
    <label>Trigger<select value={trigger} onChange={(event) => setTrigger(event.target.value as Interaction["trigger"])}><option value="click">Click</option><option value="hover">Hover</option><option value="hotspot">Hotspot</option></select></label>
    <label>Interaction action<select value={actionType} onChange={(event) => setActionType(event.target.value as typeof actionType)}><option value="toggle-visibility">Toggle visibility</option><option value="show-annotation">Show annotation</option><option value="focus-camera">Focus camera</option></select></label>
    {actionType === "show-annotation" ? <label>Annotation text<textarea value={annotation} onChange={(event) => setAnnotation(event.target.value)} maxLength={2000} /></label> : null}
    {actionType === "focus-camera" ? <label>Camera target<select value={cameraTargetId} onChange={(event) => setCameraTargetId(event.target.value)}><option value="">Choose target</option>{parts.map((part) => <option key={part.id} value={part.id}>{part.name} · {part.id}</option>)}</select></label> : null}
    <button type="button" onClick={add} disabled={snapshot.interactions.length >= 200}>Add interaction</button>
    {error ? <p role="alert">{error}</p> : null}
    {warnings.length ? <div role="alert" className="interaction-warnings">{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
    <ul aria-label="Saved interactions">{snapshot.interactions.map((interaction) => <li key={interaction.id}><div><strong>{interaction.trigger} · {interaction.action.type}</strong><small>{interaction.targetNodeId}</small></div><button type="button" aria-label={`Remove interaction ${interaction.id}`} onClick={() => onChange({ ...snapshot, interactions: snapshot.interactions.filter((item) => item.id !== interaction.id) })}>Remove</button></li>)}</ul>
  </div>;
}
