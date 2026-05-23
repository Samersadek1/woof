import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { cleanupTestData } from "./helpers/cleanup";
import { seedOwner, seedPet } from "./helpers/seed";
import { getSupabaseAdminClient, makeScopePrefix } from "./helpers/supabaseAdmin";

test.describe("owner-aggregate-credits", () => {
  const scopePrefix = makeScopePrefix("owner_aggregate");

  test.afterEach(async () => {
    await cleanupTestData(scopePrefix);
  });

  test("shows aggregate and per-pet active package balances", async ({ page }) => {
    const owner = await seedOwner(scopePrefix);
    const petA = await seedPet(owner.id, `${scopePrefix}_LuckyPet`);
    const petB = await seedPet(owner.id, `${scopePrefix}_FullPet`);

    const supabase = getSupabaseAdminClient();
    const purchaseA = await supabase.rpc("purchase_package", {
      p_owner_id: owner.id,
      p_package_code: "lucky_7",
      p_pet_ids: [petA.id],
      p_payment_method: "card",
    });
    if (purchaseA.error) throw purchaseA.error;
    const purchaseB = await supabase.rpc("purchase_package", {
      p_owner_id: owner.id,
      p_package_code: "six_full_service",
      p_pet_ids: [petB.id],
      p_payment_method: "card",
    });
    if (purchaseB.error) throw purchaseB.error;

    await loginAsAdmin(page);
    await page.goto(`/customers/${owner.id}`);

    const activePackages = page.getByTestId("owner-profile-active-packages-section");
    await expect(activePackages).toBeVisible();
    await expect(activePackages).toContainText(/daycare days/i);
    await expect(activePackages).toContainText(/grooming full service sessions/i);

    await page.getByText("Per-pet details").click();
    await expect(page.getByTestId(`owner-profile-pet-credits-${petA.id}`)).toContainText(petA.name);
    await expect(page.getByTestId(`owner-profile-pet-credits-${petB.id}`)).toContainText(petB.name);
    await expect(page.getByTestId(`owner-profile-pet-credits-${petA.id}`)).toContainText(/Lucky 7/i);
    await expect(page.getByTestId(`owner-profile-pet-credits-${petB.id}`)).toContainText(/6 Full Service/i);
  });
});
