import { expect, it } from "vitest";
import { Vector3 } from "three";
import { projectFramePosition } from "./project-framing";

it("frames a far-away model along the saved view direction", () => {
  const center = new Vector3(50000, 50000, 0);
  const position = projectFramePosition(center, 150000, [3, 2, 5], [0, 0, 0]);
  const direction = position.clone().sub(center).normalize();
  expect(direction.z).toBeGreaterThan(0.7);
  expect(position.distanceTo(center)).toBeCloseTo(150000);
});
