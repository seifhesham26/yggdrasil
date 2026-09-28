import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { defaultProjectSnapshot, parseProjectSnapshot, type ProjectSnapshot } from "../domain/project-state";
import { TimelineControls } from "./timeline-controls";

const part = { id: "0:Mesh:Face", name: "Face", type: "Mesh", visible: true, position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number], materialName: "Skin", morphTargets: ["Smile"] };

describe("timeline controls", () => {
  it("adds and edits tracks, trigger, keyframes, order, and deletion with a valid saved snapshot", () => {
    let current = defaultProjectSnapshot();
    function Harness() {
      const [snapshot, setSnapshot] = useState(current);
      const [selectedId, setSelectedId] = useState<string | null>(null);
      return <TimelineControls snapshot={snapshot} parts={[part]} selectedId={selectedId} progress={0} playing={false} warnings={[]}
        onSelect={setSelectedId} onProgress={() => {}} onPlaying={() => {}} onChange={(next: ProjectSnapshot) => { current = next; setSnapshot(next); }} />;
    }
    render(<Harness />);
    const panel = within(screen.getByRole("region", { name: "Visual timelines" }));
    fireEvent.click(panel.getByRole("button", { name: "Add timeline" }));
    fireEvent.change(panel.getByLabelText("Timeline name"), { target: { value: "Smile" } });
    fireEvent.change(panel.getByLabelText("Timeline target class"), { target: { value: "morph" } });
    fireEvent.click(panel.getByRole("button", { name: "Add track" }));
    fireEvent.change(panel.getByLabelText("Track 1 keyframe 2 value"), { target: { value: "0.8" } });
    fireEvent.change(panel.getByLabelText("Timeline trigger", { exact: true }), { target: { value: "hover" } });
    expect(current.animation.timelines[0]).toMatchObject({ name: "Smile", trigger: { type: "hover", targetId: part.id }, tracks: [{ target: "morph", targetId: `${part.id}:0`, property: "influence", keyframes: [{ at: 0, value: 0 }, { at: 2, value: 0.8 }] }] });
    expect(parseProjectSnapshot(current).animation.timelines).toEqual(current.animation.timelines);
    fireEvent.click(panel.getByRole("button", { name: "Add timeline" }));
    fireEvent.click(panel.getByRole("button", { name: "Move timeline 2 earlier" }));
    expect(current.animation.timelines[1].name).toBe("Smile");
    fireEvent.click(panel.getByRole("button", { name: "Remove timeline 1" }));
    expect(current.animation.timelines).toHaveLength(1);
  });

  it("warns when a saved trigger part is no longer available", () => {
    const snapshot = defaultProjectSnapshot();
    const timelineId = crypto.randomUUID();
    snapshot.animation.timelines = [{ id: timelineId, name: "Missing", enabled: true, durationSeconds: 2, trigger: { type: "click", targetId: "gone" }, tracks: [] }];
    render(<TimelineControls snapshot={snapshot} parts={[part]} selectedId={timelineId} progress={0} playing={false} warnings={[]} onSelect={() => {}} onProgress={() => {}} onPlaying={() => {}} onChange={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Timeline trigger part gone is unavailable.");
  });
});
