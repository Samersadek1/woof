import { addDays, format } from "date-fns";
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { cleanupTestData } from "./helpers/cleanup";
import { seedOwner, seedPet, seedRoom } from "./helpers/seed";
import { getSupabaseAdminClient, makeScopePrefix } from "./helpers/supabaseAdmin";

test.describe("boarding-double-occupancy", () => {
  const scopePrefix = makeScopePrefix("boarding_double");

  test.afterEach(async () => {
    await cleanupTestData(scopePrefix);
  });

  test("applies 15% adjustment for two-pet boarding", async ({ page }) => {
    const testStartIso = new Date().toISOString();
    const owner = await seedOwner(scopePrefix);
    const petA = await seedPet(owner.id, `${scopePrefix}_DogA`);
    const petB = await seedPet(owner.id, `${scopePrefix}_DogB`);
    const room = await seedRoom(scopePrefix);

    const checkIn = format(addDays(new Date(), 2), "yyyy-MM-dd");
    const checkOut = format(addDays(new Date(), 5), "yyyy-MM-dd");

    await loginAsAdmin(page);
    await page.goto("/boarding");
    await page.getByTestId("boarding-new-booking-btn").first().click();

    await page.getByTestId("boarding-owner-search").fill(owner.first_name);
    await page.getByTestId(`boarding-owner-option-${owner.id}`).first().click();

    await page.getByTestId(`boarding-pet-checkbox-${petA.id}`).check();
    await page.getByTestId(`boarding-pet-checkbox-${petB.id}`).check();

    await page.getByTestId("boarding-room-select").click();
    const roomSearch = page.getByPlaceholder("Search room name, number, or wing...");
    await roomSearch.fill(room.room_number);
    await roomSearch.press("Enter");
    await expect(page.getByTestId("boarding-room-select")).toContainText(room.room_number);

    await page.getByTestId("boarding-checkin-date").fill(checkIn);
    await page.getByTestId("boarding-checkout-date").fill(checkOut);

    await expect(page.getByText("Double occupancy 15% discount")).toBeVisible();
    await page.getByTestId("boarding-save-booking-btn").click();
    await page.waitForLoadState("networkidle");

    const supabase = getSupabaseAdminClient();
    let bookingId: string | null = null;
    await expect
      .poll(async () => {
        const { data, error } = await supabase
          .from("bookings")
          .select("id, check_in_date, check_out_date")
          .eq("owner_id", owner.id)
          .eq("booking_type", "boarding")
          .eq("check_in_date", checkIn)
          .eq("check_out_date", checkOut)
          .gte("created_at", testStartIso)
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw error;
        bookingId = data?.[0]?.id ?? null;
        return !!bookingId;
      }, { timeout: 10000 })
      .toBe(true);
    expect(bookingId).toBeTruthy();

    const { count: petCount, error: petCountErr } = await supabase
      .from("booking_pets")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", bookingId!);
    if (petCountErr) throw petCountErr;
    expect(petCount).toBe(2);

    const { data: invoice, error: invoiceErr } = await supabase
      .from("invoices")
      .select("id")
      .eq("booking_id", bookingId!)
      .single();
    if (invoiceErr) throw invoiceErr;

    let adjustmentId: string | null = null;
    await expect
      .poll(async () => {
        const { data, error } = await supabase
          .from("billing_adjustments")
          .select("id, adjustment_type")
          .eq("invoice_id", invoice.id)
          .eq("adjustment_type", "double_occupancy_discount")
          .maybeSingle();
        if (error) throw error;
        adjustmentId = data?.id ?? null;
        return !!adjustmentId;
      }, { timeout: 10000 })
      .toBe(true);
    expect(adjustmentId).toBeTruthy();
  });
});
