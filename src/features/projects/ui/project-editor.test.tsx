import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InMemoryProjectRepository, ProjectHistory } from "../application/project-history";
import { ProjectEditor } from "./project-editor";

vi.mock("@/features/viewer/model-canvas-loader", () => ({ ModelCanvasLoader: () => <div>Model preview</div> }));
afterEach(() => vi.unstubAllGlobals());

it("keeps failed edits unsaved, retries the save, and navigates only after persistence", async () => {
  const history = new ProjectHistory(new InMemoryProjectRepository({ asset: "version" }));
  const created = await history.create({ ownerId: "owner", assetId: "asset" });
  const initial = await history.setStep("owner", created.project.id, "Scene");
  let attempts = 0;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    attempts++;
    if (attempts === 1) throw new Error("Connection lost");
    return Response.json(await history.save({ ownerId: "owner", projectId: initial.project.id, expectedRevision: body.expectedRevision, snapshot: body.snapshot, activeStep: body.activeStep }));
  }));
  render(<ProjectEditor initialState={initial} assetName="Triangle" model={{ modelUrl: "/model", primaryRelativePath: "triangle.gltf", files: [] }} />);
  fireEvent.change(screen.getByLabelText("Background color"), { target: { value: "#123456" } });
  expect(screen.getByRole("status")).toHaveTextContent("Unsaved");
  await userEvent.click(screen.getByRole("button", { name: /Interactions step/ }));
  expect(await screen.findByText("Connection lost")).toBeInTheDocument();
  expect(screen.getByLabelText("Background color")).toHaveValue("#123456");
  expect(screen.getByRole("status")).toHaveTextContent("Unsaved");
  await userEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"));
  expect(screen.getByRole("button", { name: /Interactions step/ })).toHaveAttribute("aria-current", "step");
  expect((await history.load("owner", initial.project.id))?.project.snapshot.scene.background).toBe("#123456");
});

it("undoes and redoes unsaved edits without a server request", async () => {
  const history = new ProjectHistory(new InMemoryProjectRepository({ asset: "version" }));
  const created = await history.create({ ownerId: "owner", assetId: "asset" });
  const initial = await history.setStep("owner", created.project.id, "Scene");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<ProjectEditor initialState={initial} assetName="Triangle" model={{ modelUrl: "/model", primaryRelativePath: "triangle.gltf", files: [] }} />);
  fireEvent.change(screen.getByLabelText("Background color"), { target: { value: "#123456" } });
  await userEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.getByLabelText("Background color")).toHaveValue("#111417");
  await userEvent.click(screen.getByRole("button", { name: "Redo" }));
  expect(screen.getByLabelText("Background color")).toHaveValue("#123456");
  expect(fetch).not.toHaveBeenCalled();
});
