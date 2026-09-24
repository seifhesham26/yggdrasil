import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VariantControls } from "./variant-controls";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("VariantControls", () => {
  it("switches the preview from a retained source and exposes credit files", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ versionId: "next" }), { status: 200 }));
    const user = userEvent.setup();
    render(<VariantControls assetId="asset-1" candidates={["low/model.gltf", "high/model.gltf"]} currentModelPath="low/model.gltf" attributionFiles={[{ relativePath: "LICENSE.txt", storageKey: "assets/asset-1/source/LICENSE.txt" }]} attribution="present" />);
    expect(screen.getByText("low/model.gltf")).toHaveTextContent("Current preview");
    expect(screen.getByRole("link", { name: "LICENSE.txt" })).toHaveAttribute("href", expect.stringContaining("source%2FLICENSE.txt"));
    await user.click(screen.getByRole("button", { name: "Use high/model.gltf" }));
    expect(fetch).toHaveBeenCalledWith("/api/assets/asset-1/variant", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ selectedModelPath: "high/model.gltf" }) }));
    expect(refresh).toHaveBeenCalled();
    fetch.mockRestore();
  });

  it("updates the current preview label when the selected version changes", () => {
    const props = { assetId: "asset-1", candidates: ["low/model.gltf", "high/model.gltf"], attributionFiles: [], attribution: "unknown" as const };
    const view = render(<VariantControls {...props} currentModelPath="low/model.gltf" />);
    view.rerender(<VariantControls {...props} currentModelPath="high/model.gltf" />);
    expect(screen.getByText("high/model.gltf")).toHaveTextContent("Current preview");
    expect(screen.getByText("low/model.gltf")).not.toHaveTextContent("Current preview");
  });
});
