// Tenant config loader. Reads the active tenant + active prompt + enabled tools
// from Supabase based on TENANT_SLUG. Used at startup so woof (and any future
// business) is just a row in the tenants table.

export async function loadTenant(supabase, slug) {
  const tenantSlug = (slug ?? "").trim();
  if (!tenantSlug) {
    throw new Error(
      "Missing TENANT_SLUG env. Set TENANT_SLUG to the tenants.slug for this deployment (e.g. 'woof')."
    );
  }

  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("*")
    .eq("slug", tenantSlug)
    .maybeSingle();

  if (tenantErr) {
    throw new Error(`Failed to load tenant '${tenantSlug}': ${tenantErr.message}`);
  }
  if (!tenant) {
    throw new Error(
      `Tenant '${tenantSlug}' not found. Insert a row into public.tenants (slug='${tenantSlug}', display_name=...).`
    );
  }

  const { data: prompt, error: promptErr } = await supabase
    .from("tenant_prompts")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (promptErr) {
    throw new Error(
      `Failed to load active prompt for tenant '${tenantSlug}': ${promptErr.message}`
    );
  }
  if (!prompt) {
    throw new Error(
      `No active tenant_prompts row for tenant '${tenantSlug}'. Insert a prompt and set is_active=true.`
    );
  }

  const { data: tools, error: toolsErr } = await supabase
    .from("tenant_tools")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("enabled", true);

  if (toolsErr) {
    throw new Error(
      `Failed to load tenant tools for '${tenantSlug}': ${toolsErr.message}`
    );
  }

  let businessRules = "";
  try {
    const { data: ruleRow } = await supabase
      .from("system_context")
      .select("content")
      .eq("tenant_id", tenant.id)
      .eq("key", "business_rules")
      .maybeSingle();
    businessRules = ruleRow?.content ?? "";
    if (!businessRules) {
      const { data: legacyRow } = await supabase
        .from("system_context")
        .select("content")
        .eq("key", "business_rules")
        .maybeSingle();
      businessRules = legacyRow?.content ?? "";
    }
  } catch {
    businessRules = "";
  }

  return {
    tenant,
    prompt,
    tools: tools ?? [],
    businessRules,
  };
}

export function getFallbackString(prompt, key, fallback) {
  const fb = prompt?.fallback_strings ?? {};
  if (fb && typeof fb === "object" && typeof fb[key] === "string") {
    return fb[key];
  }
  return fallback;
}
