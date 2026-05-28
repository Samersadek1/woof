import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

let overrideClient: SupabaseClient<Database> | null = null;
let lazyDefaultClient: SupabaseClient<Database> | null = null;

function loadDefaultClient(): SupabaseClient<Database> {
  if (lazyDefaultClient) return lazyDefaultClient;

  const url = readEnv("VITE_SUPABASE_URL")?.replace(/\/+$/, "");
  const key =
    readEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ?? readEnv("VITE_SUPABASE_ANON_KEY");

  if (url && key) {
    lazyDefaultClient = createClient<Database>(url, key, {
      auth: {
        persistSession: typeof window !== "undefined",
        autoRefreshToken: typeof window !== "undefined",
      },
    });
    return lazyDefaultClient;
  }

  throw new Error(
    "Supabase client not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, or call setSupabaseClient() first.",
  );
}

function readEnv(name: string): string | undefined {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    const fromVite = (import.meta.env as Record<string, string | undefined>)[name];
    if (fromVite) return fromVite;
  }
  if (typeof process !== "undefined" && process.env?.[name]) {
    return process.env[name];
  }
  return undefined;
}

/** Supabase client for app and scripts (override via {@link setSupabaseClient} for service-role batch jobs). */
export function getSupabase(): SupabaseClient<Database> {
  return overrideClient ?? loadDefaultClient();
}

export function setSupabaseClient(client: SupabaseClient<Database>): void {
  overrideClient = client;
}

export function resetSupabaseClient(): void {
  overrideClient = null;
  lazyDefaultClient = null;
}
