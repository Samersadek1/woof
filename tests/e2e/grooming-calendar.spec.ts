import { expect, test } from "@playwright/test";

test.describe("grooming calendar", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("station block button is visible on calendar day view", async ({ page }) => {
    await page.goto("/grooming");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("grooming-station-block-btn-1")).toBeVisible();
  });

  test("new appointment sheet starts with booking search", async ({ page }) => {
    await page.goto("/grooming");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /new appointment/i }).click();
    await expect(page.getByTestId("grooming-booking-search")).toBeVisible();
    await expect(page.getByTestId("grooming-walk-in-link")).toBeVisible();
  });
});
