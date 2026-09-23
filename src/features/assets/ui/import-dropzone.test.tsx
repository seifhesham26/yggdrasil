import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ImportDropzone } from "./import-dropzone";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("ImportDropzone", () => {
  it("submits selected relative paths and reports completion", async () => {
    const user = userEvent.setup();
    const upload = vi.fn().mockResolvedValue({ assetId: "asset-1", status: "ready" });
    render(<ImportDropzone upload={upload} />);
    const input = screen.getByLabelText("Choose model files");
    const file = new File(["{}"], "model.gltf", { type: "model/gltf+json" });
    Object.defineProperty(file, "webkitRelativePath", { value: "creature/model.gltf" });
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: "Import asset" }));
    expect(upload).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ relativePath: "creature/model.gltf", bytes: expect.any(Uint8Array) }),
    ]));
    expect(await screen.findByText("Import complete")).toBeVisible();
  });

  it("offers FBX and OBJ packages in the model picker", () => {
    render(<ImportDropzone upload={vi.fn()} />);
    expect(screen.getByLabelText("Choose model files")).toHaveAttribute("accept", expect.stringContaining(".fbx"));
    expect(screen.getByLabelText("Choose model files")).toHaveAttribute("accept", expect.stringContaining(".obj"));
  });

  it("does not submit an empty selection", async () => {
    const upload = vi.fn();
    render(<ImportDropzone upload={upload} />);
    expect(screen.getByRole("button", { name: "Import asset" })).toBeDisabled();
    expect(screen.getByText(/Choose a model, folder, or ZIP/)).toBeVisible();
    expect(upload).not.toHaveBeenCalled();
  });

  it("renders a stable server error code as useful guidance", async () => {
    const user = userEvent.setup();
    const upload = vi.fn().mockRejectedValue(Object.assign(new Error("failed"), { code: "AMBIGUOUS_PRIMARY_MODEL" }));
    render(<ImportDropzone upload={upload} />);
    await user.upload(screen.getByLabelText("Choose model files"), new File(["{}"], "model.gltf"));
    await user.click(screen.getByRole("button", { name: "Import asset" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/more than one model/i);
  });

  it("disables controls while an upload is pending", async () => {
    const user = userEvent.setup();
    let resolveUpload!: (value: { assetId: string; status: string }) => void;
    const upload = vi.fn(() => new Promise<{ assetId: string; status: string }>((resolve) => { resolveUpload = resolve; }));
    render(<ImportDropzone upload={upload} />);
    await user.upload(screen.getByLabelText("Choose model files"), new File(["{}"], "model.gltf"));
    await user.click(screen.getByRole("button", { name: "Import asset" }));
    expect(screen.getByRole("button", { name: "Importing…" })).toBeDisabled();
    expect(screen.getByLabelText("Choose model files")).toBeDisabled();
    resolveUpload({ assetId: "asset-1", status: "ready" });
    expect(await screen.findByText("Import complete")).toBeVisible();
  });

  it("opens the file picker from the keyboard-accessible drop target", async () => {
    const user = userEvent.setup();
    render(<ImportDropzone upload={vi.fn()} />);
    const input = screen.getByLabelText("Choose model files") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    const target = screen.getByRole("button", { name: /Drop model files here/ });
    target.focus();
    await user.keyboard("{Enter}");
    expect(click).toHaveBeenCalled();
  });
});
