import { addDays, format } from "date-fns";
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";
import { cleanupTestData } from "./helpers/cleanup";
import { seedOwner, seedPet } from "./helpers/seed";
import { getSupabaseAdminClient, makeScopePrefix } from "./helpers/supabaseAdmin";

async function createUnassignedBoardingBooking(
  page: import("@playwright/test").Page,
  opts: {
    ownerId: string;
    ownerFirstName: string;
    petId: string;
    checkIn: string;
    checkOut: string;
  },
) {
  await page.getByTestId("boarding-new-booking-btn").first().click();
  await page.getByTestId("boarding-owner-search").fill(opts.ownerFirstName);
  await page.getByTestId(`boarding-owner-option-${opts.ownerId}`).first().click();
  await page.getByTestId(`boarding-pet-checkbox-${opts.petId}`).check();
  await page.getByTestId("boarding-checkin-date").fill(opts.checkIn);
  await page.getByTestId("boarding-checkout-date").fill(opts.checkOut);
  await expect(page.getByText("Estimated total (this booking)")).toBeVisible();
  await expect(page.getByText("Double occupancy")).toHaveCount(0);
  await page.getByTestId("boarding-save-booking-btn").click();
  await page.waitForLoadState("networkidle");
}

test.describe("boarding-unassigned", () => {
  const scopePrefix = makeScopePrefix("boarding_unassigned");

  test.afterEach(async () => {
    await cleanupTestData(scopePrefix);
  });

  test("creates two unassigned bookings for the same owner without double-occupancy UI", async ({
    page,
  }) => {
    const testStartIso = new Date().toISOString();
    const owner = await seedOwner(scopePrefix);
    const petA = await seedPet(owner.id, `${scopePrefix}_DogA`);
    const petB = await seedPet(owner.id, `${scopePrefix}_DogB`);

    const checkIn = format(addDays(new Date(), 3), "yyyy-MM-dd");
    const checkOut = format(addDays(new Date(), 6), "yyyy-MM-dd");

    await loginAsAdmin(page);
    await page.goto("/boarding");

    await createUnassignedBoardingBooking(page, {
      ownerId: owner.id,
      ownerFirstName: owner.first_name,
      petId: petA.id,
      checkIn,
      checkOut,
    });

    await createUnassignedBoardingBooking(page, {
      ownerId: owner.id,
      ownerFirstName: owner.first_name,
      petId: petB.id,
      checkIn,
      checkOut,
    });

    const supabase = getSupabaseAdminClient();
    await expect
      .poll(async () => {
        const { data, error } = await supabase
          .from("bookings")
          .select("id, room_id")
          .eq("owner_id", owner.id)
          .eq("booking_type", "boarding")
          .eq("check_in_date", checkIn)
          .eq("check_out_date", checkOut)
          .is("room_id", null)
          .gte("created_at", testStartIso);
        if (error) throw error;
        return data?.length ?? 0;
      }, { timeout: 15000 })
      .toBe(2);

    const { data: bookings, error: bookingsErr } = await supabase
      .from("bookings")
      .select("id")
      .eq("owner_id", owner.id)
      .eq("booking_type", "boarding")
      .eq("check_in_date", checkIn)
      .eq("check_out_date", checkOut)
      .is("room_id", null)
      .gte("created_at", testStartIso);
    if (bookingsErr) throw bookingsErr;
    expect(bookings?.length).toBe(2);

    for (const row of bookings ?? []) {
      const { data: invoice, error: invoiceErr } = await supabase
        .from("invoices")
        .select("id")
        .eq("booking_id", row.id)
        .maybeSingle();
      if (invoiceErr) throw invoiceErr;
      if (!invoice) continue;

      const { count, error: adjErr } = await supabase
        .from("billing_adjustments")
        .select("id", { count: "exact", head: true })
        .eq("invoice_id", invoice.id)
        .eq("adjustment_type", "double_occupancy_discount");
      if (adjErr) throw adjErr;
      expect(count ?? 0).toBe(0);
    }

    await expect(page.getByText("Unassigned").first()).toBeVisible();
  });

  test("multi-pet booking shows standard boarding total without occupancy discount", async ({
    page,
  }) => {
    const testStartIso = new Date().toISOString();
    const owner = await seedOwner(scopePrefix);
    const petA = await seedPet(owner.id, `${scopePrefix}_DogA`);
    const petB = await seedPet(owner.id, `${scopePrefix}_DogB`);

    const checkIn = format(addDays(new Date(), 4), "yyyy-MM-dd");
    const checkOut = format(addDays(new Date(), 7), "yyyy-MM-dd");

    await loginAsAdmin(page);
    await page.goto("/boarding");
    await page.getByTestId("boarding-new-booking-btn").first().click();

    await page.getByTestId("boarding-owner-search").fill(owner.first_name);
    await page.getByTestId(`boarding-owner-option-${owner.id}`).first().click();
    await page.getByTestId(`boarding-pet-checkbox-${petA.id}`).check();
    await page.getByTestId(`boarding-pet-checkbox-${petB.id}`).check();
    await page.getByTestId("boarding-checkin-date").fill(checkIn);
    await page.getByTestId("boarding-checkout-date").fill(checkOut);

    await expect(page.getByText("Estimated total (this booking)")).toBeVisible();
    await expect(page.getByText(/double.?occupancy/i)).toHaveCount(0);

    await page.getByTestId("boarding-save-booking-btn").click();
    await page.waitForLoadState("networkidle");

    const supabase = getSupabaseAdminClient();
    let bookingId: string | null = null;
    await expect
      .poll(async () => {
        const { data, error } = await supabase
          .from("bookings")
          .select("id")
          .eq("owner_id", owner.id)
          .eq("booking_type", "boarding")
          .eq("check_in_date", checkIn)
          .gte("created_at", testStartIso)
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw error;
        bookingId = data?.[0]?.id ?? null;
        return !!bookingId;
      }, { timeout: 10000 })
      .toBe(true);

    const { count: petCount, error: petCountErr } = await supabase
      .from("booking_pets")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", bookingId!);
    if (petCountErr) throw petCountErr;
    expect(petCount).toBe(2);
  });
});
