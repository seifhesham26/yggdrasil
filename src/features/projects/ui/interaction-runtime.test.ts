import { expect, it } from "vitest";
import { defaultProjectSnapshot } from "../domain/project-state";
import { matchingInteractions, interactionWarnings } from "./interaction-runtime";

it("matches only the selected allowlisted trigger and warns about missing targets", () => {
  const interactions = [
    { id: "open", targetNodeId: "part-1", trigger: "click" as const, action: { type: "show-annotation" as const, annotation: "Wing" } },
    { id: "missing", targetNodeId: "gone", trigger: "hover" as const, action: { type: "focus-camera" as const, cameraTargetId: "also-gone" } },
  ];
  expect(matchingInteractions(interactions, "part-1", "click").map((item) => item.id)).toEqual(["open"]);
  expect(matchingInteractions(interactions, "part-1", "hover")).toEqual([]);
  expect(interactionWarnings(interactions, [{ id: "part-1", name: "Part" }])).toEqual([
    "Interaction missing targets a missing part: gone.",
    "Interaction missing has a missing camera target: also-gone.",
  ]);
  expect(defaultProjectSnapshot().interactions).toEqual([]);
});
