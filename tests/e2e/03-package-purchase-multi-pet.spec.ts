import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { cleanupTestData } from "./helpers/cleanup";
import { seedOwner, seedPet } from "./helpers/seed";
import { getSupabaseAdminClient, makeScopePrefix } from "./helpers/supabaseAdmin";

test.describe("package-purchase-multi-pet", () => {
  const scopePrefix = makeScopePrefix("package_multi_pet");

  test.afterEach(async () => {
    await cleanupTestData(scopePrefix);
  });

  test("purchases six full service package with two pets", async ({ page }) => {
    const owner = await seedOwner(scopePrefix);
    const petA = await seedPet(owner.id, `${scopePrefix}_GroomA`);
    const petB = await seedPet(owner.id, `${scopePrefix}_GroomB`);

    await loginAsAdmin(page);
    await page.goto(`/customers/${owner.id}`);

    await page.getByTestId("owner-profile-purchase-package-btn").click();
    await page.getByTestId("purchase-pkg-definition-six_full_service").click();

    await page.getByTestId(`purchase-pkg-pet-checkbox-${petA.id}`).check();
    await page.getByTestId(`purchase-pkg-pet-checkbox-${petB.id}`).check();

    await expect(page.getByTestId("purchase-pkg-subtotal")).toContainText("AED 2362.50");
    await expect(page.getByTestId("purchase-pkg-discount")).toContainText("- AED 236.25");
    await expect(page.getByTestId("purchase-pkg-total")).toContainText("AED 2126.25");

    await page.getByTestId("purchase-pkg-confirm-btn").click();
    await page.waitForLoadState("networkidle");

    const supabase = getSupabaseAdminClient();
    await expect
      .poll(async () => {
        const { data, error } = await supabase
          .from("service_credits")
          .select("id, pet_id, source_type, units_total")
          .in("pet_id", [petA.id, petB.id])
          .eq("source_type", "package_purchase");
        if (error) throw error;
        return (data ?? []).filter((row) => row.units_total >= 1).length;
      }, { timeout: 10000 })
      .toBe(2);

    await page.goto(`/customers/${owner.id}/pets/${petA.id}`);
    await expect(page.getByText("Active Packages")).toBeVisible();
    await expect(page.getByText("6 Full Service", { exact: true })).toBeVisible();
    await expect(page.getByText("6 full service grooming remaining")).toBeVisible();
  });
});
