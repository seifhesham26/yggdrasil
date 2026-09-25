import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { defaultProjectSnapshot } from "../domain/project-state";
import { SceneControls } from "./scene-controls";

it("rejects invalid camera values with field feedback and persists valid changes", async () => {
  const onChange = vi.fn();
  render(<SceneControls snapshot={defaultProjectSnapshot()} onChange={onChange} previewSize="desktop" onPreviewSize={() => {}} />);
  fireEvent.change(screen.getByLabelText("Camera FOV"), { target: { value: "180" } });
  expect(screen.getByRole("alert")).toHaveTextContent("Camera FOV must be between 1 and 170");
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Camera FOV"), { target: { value: "60" } });
  expect(onChange.mock.calls.at(-1)?.[0].scene.camera.fov).toBe(60);
});
