import { expect, test } from "@playwright/test";

test.describe("billing grooming v2 pricing", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("grooming v2 tab and grid load on billing pricing", async ({ page }) => {
    await page.goto("/billing");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("billing-tab-pricing").click();
    await expect(page.getByTestId("billing-pricing-tabs")).toBeVisible();

    await page.getByTestId("billing-pricing-tab-grooming-v2").click();
    await expect(page.getByTestId("billing-grooming-v2-grid")).toBeVisible();

    const firstPriceInput = page.locator('[data-testid="billing-grooming-v2-grid"] input[type="number"]').first();
    await expect(firstPriceInput).toBeVisible();
  });
});
