import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import LibraryError from "./error";

it("offers a retry without exposing database query details", async () => {
  const retry = vi.fn();
  render(<LibraryError error={new Error("Failed query: private SQL details")} retry={retry} />);
  expect(screen.getByRole("heading", { name: "Library unavailable" })).toBeInTheDocument();
  expect(screen.queryByText(/private SQL details/)).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
  expect(retry).toHaveBeenCalledOnce();
});
