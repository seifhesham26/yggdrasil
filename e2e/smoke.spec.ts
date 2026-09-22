import { expect, test } from "@playwright/test";

test("shows the Yggdrasil entry screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Yggdrasil" })).toBeVisible();
  await expect(page.getByText("Prepare 3D assets for the web")).toBeVisible();
});
