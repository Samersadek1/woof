import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("owner-search-focus", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/boarding");
    await page.getByTestId("boarding-new-booking-btn").first().click();
    await expect(page.getByTestId("boarding-owner-search")).toBeVisible();
  });

  test("boarding owner search keeps focus and dropdown after each keystroke", async ({ page }) => {
    const input = page.getByTestId("boarding-owner-search");
    await input.click();

    await input.pressSequentially("sa", { delay: 80 });
    await page.waitForTimeout(400);
    await expect(input).toBeFocused();
    const dropdown = page
      .locator("div.relative")
      .filter({ has: page.getByTestId("boarding-owner-search") })
      .locator("ul");
    await expect(dropdown).toBeVisible();
  });

  test("hub booking search keeps focus while typing", async ({ page }) => {
    await page.keyboard.press("Escape");
    const input = page.getByTestId("boarding-booking-search");
    await input.click();
    await input.pressSequentially("woof", { delay: 60 });
    await page.waitForTimeout(400);
    await expect(input).toBeFocused();
  });
});
