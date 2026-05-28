/** Marker in invoice.notes for legacy 30-day tickets shared across multiple dogs. */
export const SHARED_POOL_INVOICE_MARKER = "shared_pool_30_combined";

export function parseSharedPoolFromInvoiceNotes(notes: string | null | undefined): {
  isSharedPool: boolean;
  petNames: string[] | null;
} {
  if (!notes?.trim()) {
    return { isSharedPool: false, petNames: null };
  }
  const isSharedPool = notes.includes(SHARED_POOL_INVOICE_MARKER);
  const petsMatch = notes.match(/pets=([^|]+)/i);
  const petNames = petsMatch
    ? petsMatch[1]
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
    : null;
  return { isSharedPool, petNames: petNames?.length ? petNames : null };
}

export function isSharedHouseholdDaycarePool(args: {
  invoiceNotes?: string | null;
  purchasePetCount?: number | null;
}): boolean {
  const parsed = parseSharedPoolFromInvoiceNotes(args.invoiceNotes ?? null);
  if (parsed.isSharedPool) return true;
  return (args.purchasePetCount ?? 1) >= 2;
}

export function sharedPoolPetLabel(petNames: string[] | null | undefined): string | null {
  if (!petNames?.length) return null;
  return petNames.join(", ");
}

/** Primary pet label for package cards and planner (not the DB anchor pet alone). */
export function daycarePackagePetDisplayTitle(pkg: {
  is_shared_pool?: boolean;
  shared_pool_pets_label?: string | null;
  anchor_pet_name?: string | null;
  pet_name?: string | null;
}): string {
  if (pkg.is_shared_pool) {
    return pkg.shared_pool_pets_label
      ? `Shared — ${pkg.shared_pool_pets_label}`
      : "Shared household package";
  }
  return pkg.pet_name ?? pkg.anchor_pet_name ?? "Pet";
}
