import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AssetSummary } from "../infrastructure/asset-repository";
import { AssetCard } from "./asset-card";

const asset: AssetSummary = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Animated Triangle",
  status: "ready",
  createdAt: new Date("2026-09-23T00:00:00Z"),
  updatedAt: new Date("2026-09-23T00:00:00Z"),
  byteSize: 1024,
  format: "glTF",
  counts: { meshes: 1, triangles: 1, animations: 1 },
};

describe("AssetCard", () => {
  it("shows singular technical counts for a one-mesh animated model", () => {
    render(<AssetCard asset={asset} />);
    expect(screen.getByText("1 mesh")).toBeInTheDocument();
    expect(screen.getByText("1 animation")).toBeInTheDocument();
  });
});
