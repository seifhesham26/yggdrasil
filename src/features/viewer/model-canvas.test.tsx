import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelCanvas } from "./model-canvas";

const state = vi.hoisted(() => ({ mode: "loading" as "loading" | "ready" | "error", autoPlay: true }));

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children, camera, ...props }: { children: React.ReactNode; camera: unknown; "aria-label"?: string }) => <div data-testid="mock-canvas" data-camera={JSON.stringify(camera)} aria-label={props["aria-label"]}>{children}</div>,
}));

vi.mock("@react-three/drei", () => ({
  Bounds: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  OrbitControls: () => null,
  Grid: () => null,
}));

vi.mock("./model-scene", () => ({
  ModelScene: ({ onReady, autoPlay }: { onReady: () => void; autoPlay: boolean }) => {
    state.autoPlay = autoPlay;
    if (state.mode === "error") throw new Error("loader failed");
    if (state.mode === "ready") queueMicrotask(onReady);
    return <div data-testid="mock-scene" />;
  },
}));

const props = { modelUrl: "/api/assets/id/file?key=model.glb", primaryRelativePath: "model.glb", files: [] };

beforeEach(() => {
  state.mode = "loading";
  state.autoPlay = true;
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});

describe("ModelCanvas", () => {
  it("configures a camera and an accessible preview label", () => {
    render(<ModelCanvas {...props} />);
    expect(screen.getByTestId("mock-canvas")).toHaveAttribute("aria-label", "3D model preview");
    expect(screen.getByTestId("mock-canvas").getAttribute("data-camera")).toMatch(/position/);
  });

  it("shows loading progress while the scene is unresolved", () => {
    render(<ModelCanvas {...props} />);
    expect(screen.getByRole("progressbar", { name: "Loading model" })).toBeVisible();
  });

  it("recovers from a loader error with a retry action", async () => {
    const user = userEvent.setup();
    state.mode = "error";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ModelCanvas {...props} />);
    expect(screen.getByText("The model could not be displayed")).toBeVisible();
    state.mode = "ready";
    await user.click(screen.getByRole("button", { name: "Retry preview" }));
    await waitFor(() => expect(screen.queryByText("The model could not be displayed")).toBeNull());
    consoleError.mockRestore();
  });

  it("does not auto-play animations when reduced motion is preferred", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(<ModelCanvas {...props} />);
    await waitFor(() => expect(state.autoPlay).toBe(false));
  });
});
