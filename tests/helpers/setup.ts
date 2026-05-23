import { config } from "dotenv";

config({ path: ".env.test", override: false });

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return false;
  return value.includes("REPLACE_WITH_");
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY || isPlaceholder(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is required for DB integration tests (provide a real key, not placeholder text).",
  );
}

if (!process.env.VITE_SUPABASE_URL) {
  throw new Error("VITE_SUPABASE_URL is required for tests.");
}

if (!process.env.VITE_SUPABASE_ANON_KEY && !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("VITE_SUPABASE_ANON_KEY (or publishable key) is required for tests.");
}
