import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defaultProjectSnapshot } from "../domain/project-state";
import { InteractionControls } from "./interaction-controls";
import type { PartSummary } from "./scene-parts";

const part: PartSummary = { id: "0:Mesh:Wing", name: "Wing", type: "Mesh", visible: true, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };

it("adds a safe annotation and keeps missing targets visible as warnings", async () => {
  const onChange = vi.fn();
  render(<InteractionControls snapshot={{ ...defaultProjectSnapshot(), interactions: [{ id: "old", targetNodeId: "gone", trigger: "hover", action: { type: "toggle-visibility" } }] }} parts={[part]} previewing={false} onPreview={vi.fn()} onChange={onChange} />);
  expect(screen.getByRole("alert")).toHaveTextContent("missing part");
  await userEvent.selectOptions(screen.getByLabelText("Interaction target"), part.id);
  await userEvent.selectOptions(screen.getByLabelText("Interaction action"), "show-annotation");
  await userEvent.type(screen.getByLabelText("Annotation text"), "Hello wing");
  await userEvent.click(screen.getByRole("button", { name: "Add interaction" }));
  expect(onChange.mock.calls.at(-1)?.[0].interactions.at(-1)).toMatchObject({ targetNodeId: part.id, trigger: "click", action: { type: "show-annotation", annotation: "Hello wing" } });
});
