// Per-tenant daily token cap circuit breaker. Reads agent_turns sums for the
// active day and pauses agent traffic for the tenant if the cap is exceeded.
// The check is cached briefly to keep the hot path cheap.

const CACHE_TTL_MS = Number(process.env.AGENT_COST_CACHE_TTL_MS ?? 30_000);
const cache = new Map();

function todayUtcStartIso() {
  const now = new Date();
  const start = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0,
  ));
  return start.toISOString();
}

export async function evaluateTenantBudget(supabase, tenant) {
  if (!tenant?.id || !tenant?.daily_token_cap) {
    return { exceeded: false, used: 0, cap: null };
  }

  const cached = cache.get(tenant.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const since = todayUtcStartIso();
  let used = 0;
  try {
    const { data, error } = await supabase
      .from("agent_turns")
      .select("input_tokens, output_tokens")
      .eq("tenant_id", tenant.id)
      .gte("started_at", since);
    if (error) throw new Error(error.message);
    used = (data ?? []).reduce(
      (acc, row) => acc + (row?.input_tokens ?? 0) + (row?.output_tokens ?? 0),
      0,
    );
  } catch (err) {
    console.error("evaluateTenantBudget failed:", err?.message ?? err);
    const safeValue = { exceeded: false, used: 0, cap: tenant.daily_token_cap };
    cache.set(tenant.id, { value: safeValue, expiresAt: Date.now() + 5_000 });
    return safeValue;
  }

  const exceeded = used >= tenant.daily_token_cap;
  const value = { exceeded, used, cap: tenant.daily_token_cap };
  cache.set(tenant.id, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function invalidateBudgetCache(tenantId) {
  if (!tenantId) return;
  cache.delete(tenantId);
}
