import type { Database } from "@/integrations/supabase/types";
import { getServiceRoleClient } from "./supabaseTestClient";
import { createTestScope } from "./testScope";

type Scope = ReturnType<typeof createTestScope>;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function createTestOwner(
  scope: Scope,
  overrides: Partial<Database["public"]["Tables"]["owners"]["Insert"]> = {},
) {
  const supabase = getServiceRoleClient();
  const payload: Database["public"]["Tables"]["owners"]["Insert"] = {
    first_name: `${scope.scopeId}_Owner`,
    last_name: "Test",
    phone: `${scope.scopeId}_Phone`,
    ...overrides,
  };

  const { data, error } = await supabase.from("owners").insert(payload).select("*").single();
  if (error) throw error;
  scope.registerResource("owners", data.id);
  return data;
}

export async function createTestPet(
  scope: Scope,
  ownerId: string,
  overrides: Partial<Database["public"]["Tables"]["pets"]["Insert"]> = {},
) {
  const supabase = getServiceRoleClient();
  const payload: Database["public"]["Tables"]["pets"]["Insert"] = {
    owner_id: ownerId,
    name: `${scope.scopeId}_Pet`,
    species: "dog",
    size: "medium",
    coat_type: "short",
    assessment_status: "passed",
    ...overrides,
  };

  const { data, error } = await supabase.from("pets").insert(payload).select("*").single();
  if (error) throw error;
  scope.registerResource("pets", data.id);
  return data;
}

export async function createTestRoom(
  scope: Scope,
  overrides: Partial<Database["public"]["Tables"]["rooms"]["Insert"]> = {},
) {
  const supabase = getServiceRoleClient();
  const payload: Database["public"]["Tables"]["rooms"]["Insert"] = {
    display_name: `${scope.scopeId}_Room`,
    room_number: `${scope.scopeId.slice(-6)}`,
    room_type: "kennels",
    wing: "back_kennels",
    capacity_type: "single",
    max_pets: 2,
    is_active: true,
    ...overrides,
  };

  const { data, error } = await supabase.from("rooms").insert(payload).select("*").single();
  if (error) throw error;
  scope.registerResource("rooms", data.id);
  return data;
}

export async function createTestInvoice(
  scope: Scope,
  ownerId: string,
  lines: Array<{ description: string; quantity: number; unitPrice: number; serviceType?: string | null }>,
  overrides: Partial<Database["public"]["Tables"]["invoices"]["Insert"]> = {},
) {
  const supabase = getServiceRoleClient();
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const invoicePayload: Database["public"]["Tables"]["invoices"]["Insert"] = {
    owner_id: ownerId,
    issue_date: todayIso(),
    status: "issued",
    subtotal,
    total: subtotal,
    ...overrides,
  };

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert(invoicePayload)
    .select("*")
    .single();
  if (invoiceError) throw invoiceError;
  scope.registerResource("invoices", invoice.id);

  for (const [index, line] of lines.entries()) {
    const totalPrice = line.quantity * line.unitPrice;
    const { data: createdLine, error: lineError } = await supabase
      .from("invoice_line_items")
      .insert({
        invoice_id: invoice.id,
        description: `${scope.scopeId}_${line.description}`,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        total_price: totalPrice,
        line_total: totalPrice,
        sort_order: index + 1,
        service_type: line.serviceType ?? null,
      })
      .select("*")
      .single();
    if (lineError) throw lineError;
    scope.registerResource("invoice_line_items", createdLine.id);
  }

  return invoice;
}

export async function createTestBoardingBooking(
  scope: Scope,
  ownerId: string,
  roomId: string,
  petIds: string[],
  dates: { checkInDate: string; checkOutDate: string },
) {
  const supabase = getServiceRoleClient();
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .insert({
      owner_id: ownerId,
      room_id: roomId,
      booking_type: "boarding",
      status: "confirmed",
      check_in_date: dates.checkInDate,
      check_out_date: dates.checkOutDate,
      notes: `${scope.scopeId}_boarding_booking`,
    })
    .select("*")
    .single();
  if (bookingError) throw bookingError;
  scope.registerResource("bookings", booking.id);

  for (const petId of petIds) {
    const { data: row, error } = await supabase
      .from("booking_pets")
      .insert({ booking_id: booking.id, pet_id: petId })
      .select("*")
      .single();
    if (error) throw error;
    scope.registerResource("booking_pets", row.id);
  }

  const oneNight = 100;
  const nights = Math.max(
    1,
    Math.ceil(
      (new Date(`${dates.checkOutDate}T00:00:00Z`).getTime() -
        new Date(`${dates.checkInDate}T00:00:00Z`).getTime()) /
        (1000 * 60 * 60 * 24),
    ),
  );
  const subtotal = oneNight * nights;

  const invoice = await createTestInvoice(
    scope,
    ownerId,
    [
      {
        description: "Boarding line",
        quantity: nights,
        unitPrice: oneNight,
        serviceType: "boarding",
      },
    ],
    {
      booking_id: booking.id,
      service_type: "boarding",
      subtotal,
      total: subtotal,
    },
  );

  return {
    booking,
    invoice,
  };
}

export async function createTestServiceCredit(
  scope: Scope,
  petId: string,
  overrides: Partial<Database["public"]["Tables"]["service_credits"]["Insert"]> = {},
) {
  const supabase = getServiceRoleClient();
  const payload: Database["public"]["Tables"]["service_credits"]["Insert"] = {
    pet_id: petId,
    service_code: "daycare_full_day",
    units_total: 5,
    units_consumed: 0,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    source_type: overrides.source_type ?? "promotional",
    ...overrides,
  };

  const { data, error } = await supabase
    .from("service_credits")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  scope.registerResource("service_credits", data.id);
  return data;
}
