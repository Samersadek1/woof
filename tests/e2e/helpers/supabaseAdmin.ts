import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AnyObject = Record<string, unknown>;

let cachedClient: SupabaseClient<AnyObject> | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function getSupabaseAdminClient(): SupabaseClient<AnyObject> {
  if (cachedClient) return cachedClient;
  const url = requireEnv("VITE_SUPABASE_URL").replace(/\/+$/, "");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  cachedClient = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export function makeScopePrefix(label: string): string {
  const safe = label.replace(/[^a-z0-9]+/gi, "_").toUpperCase();
  return `TEST_${safe}_${Date.now().toString(36)}`;
}
