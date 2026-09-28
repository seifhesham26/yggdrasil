import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultProjectSnapshot } from "../domain/project-state";
import { AnimationControls } from "./animation-controls";

const sources = [
  { sourceIndex: 0, name: "Z Rise", durationSeconds: 1, targets: ["Triangle"], usesSkeleton: false, usesMorph: false, missingTargets: [] },
  { sourceIndex: 1, name: "A Face", durationSeconds: 2, targets: ["Gone"], usesSkeleton: false, usesMorph: true, missingTargets: ["Gone"] },
];

describe("animation controls", () => {
  it("lists multiple clips in source order with durations and target warnings", () => {
    render(<AnimationControls snapshot={defaultProjectSnapshot()} sources={sources} selectedKey="source-1" progress={0} playing={false} onSelect={vi.fn()} onProgress={vi.fn()} onPlaying={vi.fn()} onRestart={vi.fn()} onChange={vi.fn()} />);
    const list = within(screen.getByRole("list", { name: "Source clips" }));
    expect(list.getAllByRole("button", { name: /Rise|Face/ }).map((button) => button.textContent)).toEqual(["Z Rise", "A Face"]);
    expect(list.getByText("2.00 s · 1 targets")).toBeTruthy();
    expect(screen.getByText(/Missing target: Gone/)).toBeTruthy();
    expect(screen.getByText(/Targets: Gone/)).toBeTruthy();
  });

  it("adds project metadata without editing source clips", () => {
    const onChange = vi.fn();
    const snapshot = defaultProjectSnapshot();
    render(<AnimationControls snapshot={snapshot} sources={sources} selectedKey="source-0" progress={0} playing={false} onSelect={vi.fn()} onProgress={vi.fn()} onPlaying={vi.fn()} onRestart={vi.fn()} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Add project copy" })[0]);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0].animation.embeddedClips).toMatchObject([{ sourceIndex: 0, name: "Z Rise", enabled: true, trimStart: 0, trimEnd: 1, speed: 1, loop: "repeat" }]);
    expect(snapshot.animation.embeddedClips).toEqual([]);
    expect(sources[0].name).toBe("Z Rise");
  });

  it("requires exact target mapping before an imported animation can attach", async () => {
    const onImport = vi.fn().mockResolvedValue(undefined);
    const part = { id: "0:Bone:Arm", name: "Arm", type: "Bone", visible: true, position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] };
    render(<AnimationControls snapshot={defaultProjectSnapshot()} sources={[]} parts={[part]} selectedKey={null} progress={0} playing={false} onSelect={vi.fn()} onProgress={vi.fn()} onPlaying={vi.fn()} onRestart={vi.fn()} onChange={vi.fn()} onImport={onImport} />);
    const text = JSON.stringify({ name: "Wave", tracks: [{ target: "Missing", path: "position", times: [0, 1], values: [0, 0, 0, 1, 0, 0] }] });
    const file = new File([text], "wave.json", { type: "application/json" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode(text).buffer });
    fireEvent.change(screen.getByLabelText("Import animation"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Attach imported clip" }).hasAttribute("disabled")).toBe(true));
    expect(screen.getByRole("combobox", { name: "Map Missing" })).toBeTruthy();
    expect(onImport).not.toHaveBeenCalled();
  });
});
