import { expect, it } from "vitest";
import { canCreateOwner } from "./owner-policy";

it("allows only the configured first owner", () => {
  expect(canCreateOwner(0, "owner@example.test", "owner@example.test")).toBe(true);
  expect(canCreateOwner(0, "other@example.test", "owner@example.test")).toBe(false);
  expect(canCreateOwner(1, "owner@example.test", "owner@example.test")).toBe(false);
});
