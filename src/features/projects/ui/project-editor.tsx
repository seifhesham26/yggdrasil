"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ModelCanvasLoader } from "@/features/viewer/model-canvas-loader";
import type { ViewerFile } from "@/features/viewer/model-canvas";
import type { ProjectState } from "../application/project-history";
import { projectStepNames, type ProjectSnapshot, type ProjectStepName } from "../domain/project-state";
import { AppearanceControls } from "./appearance-controls";
import type { PartSummary } from "./scene-parts";
import { SceneControls, type PreviewSize } from "./scene-controls";
import { InteractionControls } from "./interaction-controls";

type Model = { modelUrl: string; primaryRelativePath: string; files: ViewerFile[] };
type SaveStatus = "saved" | "unsaved" | "saving" | "error";

export function ProjectEditor({ initialState, assetName, model }: { initialState: ProjectState; assetName: string; model: Model }) {
  const [serverState, setServerState] = useState(initialState);
  const [snapshot, setSnapshot] = useState<ProjectSnapshot>(initialState.project.snapshot);
  const [activeStep, setActiveStep] = useState<ProjectStepName>(initialState.project.activeStep);
  const [undoStack, setUndoStack] = useState<ProjectSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<ProjectSnapshot[]>([]);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [message, setMessage] = useState<string | null>(null);
  const [pendingStep, setPendingStep] = useState<ProjectStepName | null>(null);
  const [parts, setParts] = useState<PartSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionOrigin, setSelectionOrigin] = useState<"hierarchy" | "viewport" | null>(null);
  const [missingParts, setMissingParts] = useState<string[]>([]);
  const [previewSize, setPreviewSize] = useState<PreviewSize>("desktop");
  const [previewingInteractions, setPreviewingInteractions] = useState(false);
  const onParts = useCallback((next: PartSummary[]) => { setParts(next); setSelectedId((current) => current ?? next[0]?.id ?? null); }, []);
  const onMissingParts = useCallback((ids: string[]) => setMissingParts(ids), []);
  const selectFromViewport = useCallback((id: string) => { setSelectedId(id); setSelectionOrigin("viewport"); }, []);
  const selectFromHierarchy = useCallback((id: string) => { setSelectedId(id); setSelectionOrigin("hierarchy"); }, []);
  const busy = status === "saving";
  const dirty = JSON.stringify(snapshot) !== JSON.stringify(serverState.project.snapshot);
  const endpoint = `/api/projects/${serverState.project.id}`;

  function edit(next: ProjectSnapshot) {
    setUndoStack((stack) => [...stack, snapshot]);
    setRedoStack([]);
    setSnapshot(next);
    setStatus("unsaved");
    setMessage(null);
  }

  const request = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch(endpoint, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(response.status === 409 ? "Project changed elsewhere. Retry save to apply your local edits to the latest revision." : details.message ?? `Project request failed (${response.status}).`);
    }
    return response.json() as Promise<ProjectState>;
  }, [endpoint]);

  async function save(nextStep: ProjectStepName = activeStep) {
    if (busy) return;
    setStatus("saving");
    setMessage(null);
    try {
      let expectedRevision = serverState.project.revision;
      if (message?.includes("changed elsewhere")) {
        const latest = await fetch(endpoint);
        if (!latest.ok) throw new Error("Could not reload the latest revision. Retry when the connection returns.");
        expectedRevision = ((await latest.json()) as ProjectState).project.revision;
      }
      const state = await request({ action: "save", expectedRevision, snapshot, activeStep: nextStep });
      setServerState(state);
      setSnapshot(state.project.snapshot);
      setActiveStep(state.project.activeStep);
      if (state.project.activeStep !== "Interactions") setPreviewingInteractions(false);
      setUndoStack([]);
      setRedoStack([]);
      setPendingStep(null);
      setStatus("saved");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Save failed. Retry when the connection returns.");
      setPendingStep(nextStep === activeStep ? null : nextStep);
    }
  }

  async function navigate(step: ProjectStepName) {
    if (step === activeStep || busy) return;
    if (dirty || status === "error") { await save(step); return; }
    setStatus("saving");
    try {
      const state = await request({ action: "step", activeStep: step });
      setServerState(state);
      setActiveStep(state.project.activeStep);
      if (state.project.activeStep !== "Interactions") setPreviewingInteractions(false);
      setStatus("saved");
      setMessage(null);
    } catch (error) {
      setStatus("error");
      setPendingStep(step);
      setMessage(error instanceof Error ? error.message : "Step change failed. Retry.");
    }
  }

  async function historyAction(action: "undo" | "redo") {
    if (busy) return;
    if (action === "undo" && undoStack.length) {
      const previous = undoStack.at(-1)!;
      setUndoStack(undoStack.slice(0, -1));
      setRedoStack((stack) => [...stack, snapshot]);
      setSnapshot(previous);
      setStatus(JSON.stringify(previous) === JSON.stringify(serverState.project.snapshot) ? "saved" : "unsaved");
      setMessage(null);
      return;
    }
    if (action === "redo" && redoStack.length) {
      const next = redoStack.at(-1)!;
      setRedoStack(redoStack.slice(0, -1));
      setUndoStack((stack) => [...stack, snapshot]);
      setSnapshot(next);
      setStatus(JSON.stringify(next) === JSON.stringify(serverState.project.snapshot) ? "saved" : "unsaved");
      setMessage(null);
      return;
    }
    if (dirty) return;
    setStatus("saving");
    try {
      const state = await request({ action });
      setServerState(state);
      setSnapshot(state.project.snapshot);
      setStatus("saved");
      setMessage(null);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "History operation failed. Retry.");
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "s") { event.preventDefault(); void save(); }
      if (key === "z" || key === "y") { event.preventDefault(); void historyAction(key === "y" || event.shiftKey ? "redo" : "undo"); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const canUndo = undoStack.length > 0 || (!dirty && Boolean(serverState.project.currentRevisionId));
  const canRedo = redoStack.length > 0 || (!dirty && serverState.revisions.some((revision) => revision.parentRevisionId === serverState.project.currentRevisionId));
  return <main className="project-editor">
    <div className="project-editor-header">
      <div><Link href={`/assets/${serverState.project.assetId}`}>← {assetName}</Link><p className="section-kicker">Project editor</p><h1>{serverState.project.name}</h1></div>
      <div className="project-editor-actions"><span role="status" aria-live="polite" className={`save-state save-state-${status}`}>{busy ? "Saving…" : status === "saved" ? "Saved" : "Unsaved changes"}</span><button type="button" onClick={() => void historyAction("undo")} disabled={busy || !canUndo}>Undo</button><button type="button" onClick={() => void historyAction("redo")} disabled={busy || !canRedo}>Redo</button><button type="button" className="primary-button" onClick={() => void save()} disabled={busy || !dirty}>Save project</button></div>
    </div>
    {message ? <div role="alert" className="project-save-error"><span>{message}</span><button type="button" onClick={() => void save(pendingStep ?? activeStep)}>Retry save</button></div> : null}
    <nav className="project-step-nav" aria-label="Project steps"><ol>{projectStepNames.map((step, index) => { const record = serverState.steps.find((item) => item.name === step); return <li key={step}><button type="button" aria-label={`${step} step`} aria-current={activeStep === step ? "step" : undefined} onClick={() => void navigate(step)} disabled={busy}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong><small>{activeStep === step && (dirty || status === "error") ? "Unsaved" : record?.status ?? "not-started"}</small></button></li>; })}</ol></nav>
    <div className="project-editor-grid">
      <section className="project-editor-preview" aria-label="Project preview" data-preview-size={previewSize}><ModelCanvasLoader key={previewingInteractions && activeStep === "Interactions" ? "preview" : "edit"} {...model} presentation={{ snapshot, onParts, onSelectPart: selectFromViewport, onMissingParts, previewInteractions: previewingInteractions && activeStep === "Interactions" }} /></section>
      <section className="project-editor-panel" aria-label={`${activeStep} controls`}>
        <p className="section-kicker">Step {projectStepNames.indexOf(activeStep) + 1} of 8</p><h2>{activeStep}</h2>
        <fieldset disabled={busy}>
          {activeStep === "Appearance" ? <AppearanceControls snapshot={snapshot} parts={parts} selectedId={selectedId} selectionOrigin={selectionOrigin} onSelect={selectFromHierarchy} onChange={edit} missing={missingParts} /> : activeStep === "Scene" ? <SceneControls key={snapshot.scene.camera.fov} snapshot={snapshot} onChange={edit} previewSize={previewSize} onPreviewSize={setPreviewSize} /> : activeStep === "Interactions" ? <InteractionControls snapshot={snapshot} parts={parts} previewing={previewingInteractions} onPreview={setPreviewingInteractions} onChange={edit} /> : <p>This step is available for navigation. Its editing controls follow in the roadmap.</p>}
        </fieldset>
      </section>
    </div>
  </main>;
}
