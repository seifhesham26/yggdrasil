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
    expect(upload.mock.calls[0][0]).toEqual([file]);
    expect(await screen.findByText("Import complete")).toBeVisible();
  });

  it("passes native files to the upload without reading them into browser memory", async () => {
    const user = userEvent.setup();
    const file = new File(["glTF"], "model.glb");
    const read = vi.spyOn(file, "arrayBuffer");
    const upload = vi.fn().mockResolvedValue({ assetId: "asset-1", status: "ready" });
    render(<ImportDropzone upload={upload} />);
    await user.upload(screen.getByLabelText("Choose model files"), file);
    await user.click(screen.getByRole("button", { name: "Import asset" }));
    expect(upload.mock.calls[0][0][0]).toBe(file);
    expect(read).not.toHaveBeenCalled();
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

  it("shows resources and uncertain attribution before confirming a staged variant", async () => {
    const user = userEvent.setup();
    const review = { candidates: [
      { modelPath: "low/model.gltf", resources: ["low/triangle.bin"], missingResources: [], problems: [], resourceInspection: "complete", attributionFiles: ["README.md"], attribution: "unknown", selected: false },
      { modelPath: "high/model.gltf", resources: [], missingResources: ["high/missing.bin"], problems: [], resourceInspection: "complete", attributionFiles: ["README.md"], attribution: "unknown", selected: false },
    ], attributionFiles: [{ relativePath: "README.md", text: "Terms unclear", truncated: false }] };
    const upload = vi.fn(async (_files: File[], _progress: unknown, _signal: AbortSignal, onJob?: (jobId: string) => void) => {
      onJob?.("job-1");
      throw Object.assign(new Error("Review required"), { code: "VARIANT_REVIEW_REQUIRED", review });
    });
    render(<ImportDropzone upload={upload} />);
    await user.upload(screen.getByLabelText("Choose model files"), new File(["{}"], "model.gltf"));
    await user.click(screen.getByRole("button", { name: "Import asset" }));
    expect(await screen.findByLabelText("Model variants")).toHaveTextContent("low/triangle.bin");
    expect(screen.getByLabelText("Model variants")).toHaveTextContent("high/missing.bin");
    expect(screen.getByLabelText("Model variants")).toHaveTextContent("Attribution unknown");
    expect(screen.getByText("Terms unclear")).toBeVisible();
    expect(screen.getByRole("button", { name: "Use high/model.gltf" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use low/model.gltf" })).toBeEnabled();
  });

  it("cancels an unconfirmed staged job and returns to the selected files", async () => {
    const user = userEvent.setup();
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ phase: "cancelled" }), { status: 200 }));
    const upload = vi.fn(async (_files: File[], _progress: unknown, _signal: AbortSignal, onJob?: (jobId: string) => void) => {
      onJob?.("job-1");
      throw Object.assign(new Error("Review required"), { code: "VARIANT_REVIEW_REQUIRED", review: { candidates: [{ modelPath: "model.gltf", resources: [], missingResources: [], problems: [], resourceInspection: "complete", attributionFiles: [], attribution: "unknown", selected: false }], attributionFiles: [] } });
    });
    render(<ImportDropzone upload={upload} />);
    await user.upload(screen.getByLabelText("Choose model files"), new File(["{}"], "model.gltf"));
    await user.click(screen.getByRole("button", { name: "Import asset" }));
    await screen.findByLabelText("Model variants");
    await user.click(screen.getByRole("button", { name: "Cancel staged import" }));
    expect(fetch).toHaveBeenCalledWith("/api/assets/import/jobs/job-1", expect.objectContaining({ method: "PATCH" }));
    expect(await screen.findByRole("button", { name: "Import asset" })).toBeEnabled();
    expect(screen.queryByLabelText("Model variants")).not.toBeInTheDocument();
    fetch.mockRestore();
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

  it("can abort an active upload and keep the selected files for retry", async () => {
    const user = userEvent.setup();
    const upload = vi.fn((_files: File[], _progress: (sent: number, total: number) => void, signal: AbortSignal) => new Promise<never>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Upload cancelled", "AbortError")), { once: true });
    }));
    render(<ImportDropzone upload={upload} />);
    await user.upload(screen.getByLabelText("Choose model files"), new File(["glTF"], "model.glb"));
    await user.click(screen.getByRole("button", { name: "Import asset" }));
    await user.click(screen.getByRole("button", { name: "Cancel upload" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload cancelled.");
    expect(screen.getByRole("button", { name: "Import asset" })).toBeEnabled();
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
