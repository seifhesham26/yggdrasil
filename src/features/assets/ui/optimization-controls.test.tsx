import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OptimizationControls } from "./optimization-controls";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/features/viewer/model-canvas-loader", () => ({ ModelCanvasLoader: () => null }));
afterEach(() => { vi.unstubAllGlobals(); refresh.mockClear(); });
const analysis = { format: "glb", counts: { triangles: 1, materials: 1, textures: 0, animations: 1 }, warnings: [] };
const original = { id: "original", operation: "original", byteSize: 1200, storageKey: "assets/a/source/triangle.gltf", analysis };
const derived = { id: "derived", operation: "normalize", byteSize: 900, storageKey: "assets/a/versions/derived/model.glb", analysis };
const history = { currentVersionId: "derived", versions: [original, derived], attempts: [], report: { findings: [{ id: "normalize", operation: "normalize", supported: true, qualityRisk: "low", evidence: "Preserves material appearance.", estimatedGain: { label: "estimate", percent: 5 } }] } };

it("shows saved current version, measured comparison, and approval risks", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(history)));
  render(<OptimizationControls assetId="a" />);
  const list = await screen.findByRole("list", { name: "Optimization version history" });
  expect(within(list).getByText(/normalize/).closest("li")).toHaveAttribute("aria-current", "true");
  expect(screen.getByText(/quality risk: low/i)).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText("Compare with"), "original");
  const comparison = screen.getByRole("table", { name: "Version comparison" });
  expect(within(comparison).getByText("1,200")).toBeInTheDocument();
  expect(within(comparison).getByText("900")).toBeInTheDocument();
});

it("disables normalization and displays compatibility warnings before approval", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...history, report: { findings: [{ ...history.report.findings[0], supported: false, warning: "Material fidelity is not verified for VENDOR_extension." }] } })));
  render(<OptimizationControls assetId="a" />);
  expect(await screen.findByText(/Material fidelity/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /normalization/i })).toBeDisabled();
});

it.each(["network", "http"])("recovers controls after %s revert failure without claiming success", async (failure) => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "PATCH") {
      if (failure === "network") throw new Error("Connection lost");
      return Response.json({ error: "Selection could not be saved" }, { status: 422 });
    }
    return Response.json(history);
  }));
  render(<OptimizationControls assetId="a" />);
  const controls = await screen.findAllByRole("button", { name: "Use this version" });
  await userEvent.click(controls[0]);
  expect(await screen.findByRole("status")).toHaveTextContent(failure === "network" ? "Connection lost" : "Selection could not be saved");
  await waitFor(() => expect(screen.getByRole("button", { name: /normalization/i })).toBeEnabled());
  expect(refresh).not.toHaveBeenCalled();
});

it("refreshes the saved history and server preview after applying", async () => {
  let applied = false;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "POST") { applied = true; return Response.json(derived); }
    return Response.json(applied ? history : { ...history, currentVersionId: "original", versions: [original] });
  }));
  render(<OptimizationControls assetId="a" />);
  await screen.findByText(/Quality risk: low/i);
  await userEvent.click(screen.getByRole("button", { name: /normalization/i }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(screen.getByText(/normalize ·/).closest("li")).toHaveAttribute("aria-current", "true");
});
