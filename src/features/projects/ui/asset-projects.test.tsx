import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssetProjects } from "./asset-projects";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
afterEach(() => { vi.unstubAllGlobals(); push.mockClear(); });

it("opens an existing project and creates a new one from an owned asset", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST"
    ? Response.json({ project: { id: "new-project" } }, { status: 201 })
    : Response.json({ projects: [{ id: "existing", name: "Existing", activeStep: "Scene", updatedAt: "2026-09-25T00:00:00.000Z" }] })));
  render(<AssetProjects assetId="asset" />);
  expect(await screen.findByRole("link", { name: /Existing/ })).toHaveAttribute("href", "/projects/existing");
  await userEvent.click(screen.getByRole("button", { name: "Create project" }));
  expect(push).toHaveBeenCalledWith("/projects/new-project");
});

it("keeps a failed creation retryable", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST"
    ? Response.json({ message: "Storage unavailable" }, { status: 503 })
    : Response.json({ projects: [] })));
  render(<AssetProjects assetId="asset" />);
  await screen.findByText("No projects yet.");
  await userEvent.click(screen.getByRole("button", { name: "Create project" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Storage unavailable");
  expect(screen.getByRole("button", { name: "Create project" })).toBeEnabled();
});
