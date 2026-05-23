import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { cleanupTestData } from "./helpers/cleanup";
import { seedDaycareCredit, seedOwner, seedPet } from "./helpers/seed";
import { getSupabaseAdminClient, makeScopePrefix } from "./helpers/supabaseAdmin";

test.describe("daycare-credit-consumption", () => {
  const scopePrefix = makeScopePrefix("daycare_credit");

  test.afterEach(async () => {
    await cleanupTestData(scopePrefix);
  });

  test("consumes daycare credit and invoices zero-priced covered line", async ({ page }) => {
    const testStartIso = new Date().toISOString();
    const owner = await seedOwner(scopePrefix);
    const pet = await seedPet(owner.id, `${scopePrefix}_DaycarePet`);
    const credit = await seedDaycareCredit(pet.id, null, 5);

    await loginAsAdmin(page);
    await page.goto("/daycare");

    await page.getByTestId("daycare-pet-search").fill(owner.first_name);
    await page.getByTestId(`daycare-owner-option-${owner.id}`).first().click();

    await page.getByLabel(pet.name).check();
    await page.getByTestId(`daycare-use-credit-toggle-${pet.id}`).click();
    await page.getByRole("option", { name: /Single day \(invoice now\)/i }).first().click();
    await page.getByTestId(`daycare-use-credit-toggle-${pet.id}`).click();
    await page.getByRole("option", { name: /Use credit/i }).first().click();

    await page.getByTestId("daycare-create-session-btn").click();
    await page.waitForLoadState("networkidle");

    const supabase = getSupabaseAdminClient();
    let invoiceId: string | null = null;
    await expect
      .poll(async () => {
        const { data, error } = await supabase
          .from("invoices")
          .select("id")
          .eq("owner_id", owner.id)
          .eq("service_type", "daycare")
          .gte("created_at", testStartIso)
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw error;
        invoiceId = data?.[0]?.id ?? null;
        return !!invoiceId;
      }, { timeout: 10000 })
      .toBe(true);
    expect(invoiceId).toBeTruthy();

    await expect
      .poll(async () => {
        const { data, error } = await supabase
          .from("invoice_line_items")
          .select("unit_price, description")
          .eq("invoice_id", invoiceId!)
          .eq("unit_price", 0);
        if (error) throw error;
        return (data ?? []).some((line) => (line.description ?? "").includes("(covered by"));
      }, { timeout: 10000 })
      .toBe(true);

    await expect
      .poll(async () => {
        const { data, error } = await supabase
          .from("service_credits")
          .select("units_consumed")
          .eq("pet_id", pet.id);
        if (error) throw error;
        return (data ?? []).reduce((max, row) => Math.max(max, row.units_consumed), 0);
      }, { timeout: 15000 })
      .toBe(1);
  });
});
