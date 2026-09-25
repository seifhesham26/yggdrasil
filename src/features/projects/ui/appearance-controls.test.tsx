import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defaultProjectSnapshot } from "../domain/project-state";
import { AppearanceControls } from "./appearance-controls";
import type { PartSummary } from "./scene-parts";

const part = (id: string): PartSummary => ({ id, name: "Wing", type: "Mesh", visible: true, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], materialName: "Paint", textureName: "Albedo", hasUv: true, color: "#ffffff", opacity: 1, roughness: 0.5, metalness: 0 });

it("selects duplicate named parts by stable ID and resets only the selected property", async () => {
  const snapshot = { ...defaultProjectSnapshot(), appearance: { nodes: { "0:Mesh:Wing": { visible: false, color: "#123456" } } } };
  const onChange = vi.fn();
  const onSelect = vi.fn();
  render(<AppearanceControls snapshot={snapshot} parts={[part("0:Mesh:Wing"), part("1:Mesh:Wing")]} selectedId="0:Mesh:Wing" onSelect={onSelect} onChange={onChange} />);
  expect(screen.getAllByRole("button", { name: /Wing/ })).toHaveLength(2);
  await userEvent.click(screen.getByRole("button", { name: "Reset color" }));
  expect(onChange.mock.calls.at(-1)?.[0].appearance.nodes).toEqual({ "0:Mesh:Wing": { visible: false } });
  await userEvent.selectOptions(screen.getByLabelText("Material choice"), "1:Mesh:Wing");
  expect(onChange.mock.calls.at(-1)?.[0].appearance.nodes["0:Mesh:Wing"].materialSourceNodeId).toBe("1:Mesh:Wing");
  await userEvent.selectOptions(screen.getByLabelText("Texture choice"), "1:Mesh:Wing");
  expect(onChange.mock.calls.at(-1)?.[0].appearance.nodes["0:Mesh:Wing"].textureSourceNodeId).toBe("1:Mesh:Wing");
  await userEvent.click(screen.getByRole("button", { name: /Wing.*1:Mesh:Wing/ }));
  expect(onSelect).toHaveBeenCalledWith("1:Mesh:Wing");
});
