/** Pure owner-list search helpers (Customers & Pets / useOwners). */

export type OwnerSearchPet = { name?: string | null };
export type OwnerSearchFields = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  pets?: OwnerSearchPet[] | null;
};

/** Split on whitespace and `/` so "Elin/Maria" and "Elin Maria" behave the same. */
export function ownerSearchTokens(term: string): string[] {
  return term
    .trim()
    .toLowerCase()
    .split(/[\s/]+/)
    .map((t) => t.replace(/[%_,.()]/g, ""))
    .filter((t) => t.length > 0);
}

/** Normalized blob for case-insensitive partial matching (slashes → spaces). */
export function ownerSearchHaystack(owner: OwnerSearchFields): string {
  const parts = [
    owner.first_name ?? "",
    owner.last_name ?? "",
    owner.phone ?? "",
    ...(owner.pets ?? []).map((p) => p.name ?? ""),
  ];
  return parts.join(" ").toLowerCase().replace(/\//g, " ").replace(/\s+/g, " ").trim();
}

/** Every token must appear somewhere in the haystack (order-independent). */
export function ownerMatchesSearch(owner: OwnerSearchFields, term: string): boolean {
  const tokens = ownerSearchTokens(term);
  if (tokens.length === 0) return true;
  const haystack = ownerSearchHaystack(owner);
  return tokens.every((t) => haystack.includes(t));
}

export function ownerSearchScore(owner: OwnerSearchFields, term: string): number {
  const lowered = term.trim().toLowerCase();
  const tokens = ownerSearchTokens(term);
  const first = (owner.first_name ?? "").toLowerCase();
  const last = (owner.last_name ?? "").toLowerCase();
  const fullRaw = `${first} ${last}`.trim();
  const fullNorm = fullRaw.replace(/\//g, " ").replace(/\s+/g, " ").trim();
  const phone = (owner.phone ?? "").toLowerCase();
  const petNames = (owner.pets ?? []).map((p) => (p.name ?? "").toLowerCase());
  const joinedPets = petNames.join(" ");

  if (fullRaw.startsWith(lowered) || fullNorm.startsWith(lowered.replace(/\//g, " "))) return 0;
  if (tokens.length > 0 && tokens.every((t) => fullNorm.includes(t))) return 0;
  if (petNames.some((name) => name.startsWith(lowered))) return 1;
  if (tokens.length > 0 && tokens.every((t) => joinedPets.includes(t))) return 1;
  if (first.startsWith(lowered) || last.startsWith(lowered)) return 2;
  if (tokens.some((t) => first.startsWith(t) || last.startsWith(t))) return 2;
  if (phone.startsWith(lowered)) return 3;
  if (fullNorm.includes(lowered)) return 4;
  if (joinedPets.includes(lowered)) return 5;
  if (phone.includes(lowered)) return 6;
  return 9;
}

/** PostgREST `.or()` filter: each token against first_name, last_name, phone. */
export function buildOwnerColumnOrFilter(tokens: string[]): string {
  return tokens
    .flatMap((t) => {
      const p = `%${t}%`;
      return [`first_name.ilike.${p}`, `last_name.ilike.${p}`, `phone.ilike.${p}`];
    })
    .join(",");
}

export function buildPetNameOrFilter(tokens: string[]): string {
  return tokens.map((t) => `name.ilike.%${t}%`).join(",");
}
