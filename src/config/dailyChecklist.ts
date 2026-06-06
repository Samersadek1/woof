export type ChecklistItem = {
  id: string;
  label: string;
  optional?: boolean;
  note?: { label: string };
  children?: ChecklistItem[];
};

export type ChecklistSection = { id: string; title: string; hint?: string; items: ChecklistItem[] };

export const DAILY_CHECKLIST: ChecklistSection[] = [
  {
    id: "daycare",
    title: "Daycare",
    hint: "All of today's daycare activity is reflected in the system.",
    items: [
      { id: "dc_bookings_entered", label: "All daycare bookings entered on the system" },
      { id: "dc_checked_in", label: "All daycare dogs checked in" },
      { id: "dc_checked_out", label: "All daycare dogs checked out (end of day)" },
      { id: "dc_packages_sold", label: "Packages sold and recorded", optional: true },
      { id: "dc_invoiced", label: "Clients invoiced and payments processed where required" },
      {
        id: "dc_payments_collected",
        label: "All payments collected and recorded",
        note: { label: "Payments not collected — who and why" },
      },
    ],
  },
  {
    id: "boarding_checkins",
    title: "Boarding — Check-ins",
    items: [
      { id: "bi_added", label: "All arriving dogs added to the system with correct booking dates" },
      {
        id: "bi_details",
        label: "All details updated and correct",
        children: [
          { id: "bi_details_client", label: "Client details" },
          { id: "bi_details_pet", label: "Pet details" },
          { id: "bi_details_vax", label: "Vaccination records" },
          { id: "bi_details_feeding", label: "Feeding details" },
          { id: "bi_details_notes", label: "Client notes" },
        ],
      },
    ],
  },
  {
    id: "boarding_checkouts",
    title: "Boarding — Check-outs",
    items: [
      { id: "bo_checked_out", label: "All departing dogs checked out" },
      { id: "bo_invoiced", label: "All check-out invoices processed" },
      {
        id: "bo_payments_collected",
        label: "All payments collected and recorded",
        note: { label: "Payments not collected — who and why" },
      },
    ],
  },
  {
    id: "boarding_adjustments",
    title: "Boarding — New bookings & adjustments",
    items: [
      { id: "ba_adjustments_entered", label: "All booking adjustments from today entered on the system" },
      {
        id: "ba_details",
        label: "All details updated and correct",
        children: [
          { id: "ba_details_client", label: "Client details" },
          { id: "ba_details_pet", label: "Pet details" },
          { id: "ba_details_vax", label: "Vaccination records" },
          { id: "ba_details_feeding", label: "Feeding details" },
          { id: "ba_details_notes", label: "Client notes" },
        ],
      },
      { id: "ba_owner_updates", label: "All owner-requested updates actioned directly on the system" },
    ],
  },
];

/** Shift staff who sign off before leaving (matched to staff.first_name). */
export const SHIFT_SIGNOFF_STAFF = [
  { id: "lourdes", label: "Lourdes" },
  { id: "flo", label: "Flo" },
  { id: "jem", label: "Jem" },
  { id: "jess", label: "Jess" },
] as const;

export type ShiftSignoffSlot = (typeof SHIFT_SIGNOFF_STAFF)[number];

export function staffMatchesShiftSignoff(
  staff: { first_name?: string | null },
  slot: Pick<ShiftSignoffSlot, "label">,
): boolean {
  return (staff.first_name ?? "").trim().toLowerCase() === slot.label.toLowerCase();
}

export function allShiftStaffSigned(signOffs: Record<string, { signed_at?: string }>): boolean {
  return SHIFT_SIGNOFF_STAFF.every((slot) => !!signOffs[slot.id]?.signed_at);
}

function collectLeafItems(items: ChecklistItem[]): ChecklistItem[] {
  const leaves: ChecklistItem[] = [];
  for (const item of items) {
    if (item.children?.length) {
      leaves.push(...collectLeafItems(item.children));
    } else {
      leaves.push(item);
    }
  }
  return leaves;
}

/** Non-optional leaf checkboxes used for the progress count. */
export function dailyChecklistRequiredLeaves(): ChecklistItem[] {
  return DAILY_CHECKLIST.flatMap((section) => collectLeafItems(section.items)).filter((item) => !item.optional);
}
