import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { cleanupTestData } from "./helpers/cleanup";
import { makeScopePrefix } from "./helpers/supabaseAdmin";

test.describe("new-client-wizard", () => {
  const scopePrefix = makeScopePrefix("new_client_wizard");

  test.afterEach(async () => {
    await cleanupTestData(scopePrefix);
  });

  test("creates owner + pet from wizard", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/customers");

    const ownerFirst = `${scopePrefix}_First`;
    const ownerLast = "Client";
    const phone = `${scopePrefix}_Phone`;
    const petName = `${scopePrefix}_Pet`;

    await page.getByTestId("customers-add-client-btn").click();
    await page.getByTestId("owner-form-first-name").fill(ownerFirst);
    await page.getByTestId("owner-form-last-name").fill(ownerLast);
    await page.getByTestId("owner-form-phone").fill(phone);
    await page.getByTestId("owner-form-submit").click();

    await page.getByTestId("pet-form-name").first().fill(petName);
    await page.getByTestId("pet-form-submit").click();

    await expect(page.getByText("New client onboarding completed.")).toBeVisible();
    await expect(page.getByText(`${ownerFirst} ${ownerLast}`)).toBeVisible();
  });
});
