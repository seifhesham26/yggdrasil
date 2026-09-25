"use client";

import { useState } from "react";
import type { ProjectSnapshot } from "../domain/project-state";
import { resetAppearanceProperty, type PartSummary } from "./scene-parts";

type Override = ProjectSnapshot["appearance"]["nodes"][string];
type OverrideKey = keyof Override;

export function AppearanceControls({ snapshot, parts, selectedId, selectionOrigin, onSelect, onChange, missing }: {
  snapshot: ProjectSnapshot;
  parts: PartSummary[];
  selectedId: string | null;
  selectionOrigin?: "hierarchy" | "viewport" | null;
  onSelect: (id: string) => void;
  onChange: (snapshot: ProjectSnapshot) => void;
  missing?: string[];
}) {
  const [search, setSearch] = useState("");
  const selected = parts.find((part) => part.id === selectedId);
  const override = selectedId ? snapshot.appearance.nodes[selectedId] ?? {} : {};
  function replaceOverride(next: Override) {
    if (!selectedId) return;
    const nodes = { ...snapshot.appearance.nodes };
    if (Object.keys(next).length) nodes[selectedId] = next;
    else delete nodes[selectedId];
    onChange({ ...snapshot, appearance: { nodes } });
  }
  function setProperty<Key extends OverrideKey>(key: Key, value: Override[Key]) { replaceOverride({ ...override, [key]: value }); }
  function reset(key: OverrideKey) { replaceOverride(resetAppearanceProperty(override, key)); }
  function vectorControl(key: "position" | "rotation" | "scale", label: string) {
    if (!selected) return null;
    const value = override[key] ?? selected[key];
    return <div className="appearance-property"><div className="appearance-property-head"><strong>{label}</strong><button type="button" aria-label={`Reset ${label.toLowerCase()}`} onClick={() => reset(key)} disabled={override[key] === undefined}>Reset</button></div><div className="appearance-vector">{(["X", "Y", "Z"] as const).map((axis, index) => <label key={axis}>{axis}<input type="number" step="0.01" aria-label={`${label} ${axis}`} value={value[index]} onChange={(event) => { const number = Number(event.target.value); if (!Number.isFinite(number)) return; const next: [number, number, number] = [...value]; next[index] = number; setProperty(key, next); }} /></label>)}</div></div>;
  }
  function scalarControl(key: "opacity" | "roughness" | "metalness", label: string) {
    if (!selected || selected[key] === undefined) return null;
    return <div className="appearance-property"><label>{label}<input type="number" step="0.05" min="0" max="1" value={override[key] ?? selected[key]} onChange={(event) => { const number = Number(event.target.value); if (Number.isFinite(number) && number >= 0 && number <= 1) setProperty(key, number); }} /></label><button type="button" aria-label={`Reset ${label.toLowerCase()}`} onClick={() => reset(key)} disabled={override[key] === undefined}>Reset</button></div>;
  }

  return <div className="appearance-controls"><p>Select a model part in the hierarchy or viewport. Overrides leave the source package untouched.</p>
    <label className="appearance-search">Find a part<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search hierarchy" /></label>
    <div className="appearance-part-list" role="list" aria-label="Model hierarchy">{parts.filter((part) => `${part.name} ${part.id}`.toLowerCase().includes(search.toLowerCase())).map((part) => <div role="listitem" key={part.id}><button type="button" aria-label={`${part.name} ${part.id}`} aria-pressed={part.id === selectedId} onClick={() => onSelect(part.id)}><span>{part.name}</span><small>{part.id}</small></button></div>)}</div>
    {missing?.length ? <p role="alert">{missing.length} saved part {missing.length === 1 ? "reference is" : "references are"} missing or incompatible in this model version. Overrides were skipped.</p> : null}
    {selected ? <div className="appearance-selected"><div className="appearance-selected-head"><div><strong>{selected.name}</strong><small>{selected.id}</small>{selectionOrigin ? <small>Selected in {selectionOrigin}</small> : null}</div><button type="button" onClick={() => replaceOverride({})} disabled={!Object.keys(override).length}>Reset part</button></div>
      <div className="appearance-property"><label>Visible<input type="checkbox" checked={override.visible ?? selected.visible} onChange={(event) => setProperty("visible", event.target.checked)} /></label><button type="button" aria-label="Reset visibility" onClick={() => reset("visible")} disabled={override.visible === undefined}>Reset</button></div>
      {vectorControl("position", "Position")}{vectorControl("rotation", "Rotation")}{vectorControl("scale", "Scale")}
      {selected.color ? <div className="appearance-property"><label>Part color<input type="color" value={override.color ?? selected.color} onChange={(event) => setProperty("color", event.target.value)} /></label><button type="button" aria-label="Reset color" onClick={() => reset("color")} disabled={override.color === undefined}>Reset</button></div> : null}
      {scalarControl("opacity", "Opacity")}{scalarControl("roughness", "Roughness")}{scalarControl("metalness", "Metalness")}
      {selected.materialName ? <div className="appearance-property"><label>Material choice<select value={override.materialSourceNodeId ?? ""} onChange={(event) => event.target.value ? setProperty("materialSourceNodeId", event.target.value) : reset("materialSourceNodeId")}><option value="">Original material</option>{parts.filter((part) => part.materialName).map((part) => <option key={part.id} value={part.id}>{part.materialName} · {part.name} · {part.id}</option>)}</select></label><button type="button" aria-label="Reset material" onClick={() => reset("materialSourceNodeId")} disabled={override.materialSourceNodeId === undefined}>Reset</button></div> : null}
      {selected.hasUv ? <div className="appearance-property"><label>Texture choice<select value={override.textureSourceNodeId === null ? "none" : override.textureSourceNodeId ?? ""} onChange={(event) => event.target.value === "none" ? setProperty("textureSourceNodeId", null) : event.target.value ? setProperty("textureSourceNodeId", event.target.value) : reset("textureSourceNodeId")}><option value="">Original texture</option><option value="none">No texture</option>{parts.filter((part) => part.textureName).map((part) => <option key={part.id} value={part.id}>{part.textureName} · {part.name} · {part.id}</option>)}</select></label><button type="button" aria-label="Reset texture" onClick={() => reset("textureSourceNodeId")} disabled={override.textureSourceNodeId === undefined}>Reset</button></div> : <p>Texture choice is unavailable: this part has no UV coordinates.</p>}
    </div> : <p>{parts.length ? "Choose a part to edit its appearance." : "Loading model hierarchy…"}</p>}
  </div>;
}
