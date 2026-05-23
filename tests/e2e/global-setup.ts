import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config({ path: ".env.test" });

const TEST_ADMIN_EMAIL = "e2e-admin@woof.test";
const TEST_ADMIN_PASSWORD = "E2EAdminPass_DoNotUseInProd_2026!";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export default async function globalSetup() {
  const admin = createClient(
    requireEnv("VITE_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const createRes = await admin.auth.admin.createUser({
    email: TEST_ADMIN_EMAIL,
    password: TEST_ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "admin", source: "e2e_test" },
  });
  if (
    createRes.error &&
    !/already.*registered|exists|already.*exists/i.test(createRes.error.message)
  ) {
    throw createRes.error;
  }

  const usersRes = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersRes.error) throw usersRes.error;
  const authUser = (usersRes.data.users ?? []).find(
    (u) => u.email?.toLowerCase() === TEST_ADMIN_EMAIL.toLowerCase(),
  );

  // Optional mirror table used by app-level staff pages.
  if (authUser?.id) {
    const { data: staffTable } = await admin
      .from("staff")
      .select("id")
      .limit(1);
    if (Array.isArray(staffTable)) {
      const { error: staffErr } = await admin.from("staff").upsert(
        {
          id: authUser.id,
          first_name: "E2E",
          last_name: "Admin",
          role: "admin",
          email: TEST_ADMIN_EMAIL,
          active: true,
        },
        { onConflict: "id" },
      );
      if (staffErr) throw staffErr;
    }
  }

  const authClient = createClient(
    requireEnv("VITE_SUPABASE_URL"),
    process.env.VITE_SUPABASE_ANON_KEY ?? requireEnv("VITE_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: signIn, error: signInErr } = await authClient.auth.signInWithPassword({
    email: TEST_ADMIN_EMAIL,
    password: TEST_ADMIN_PASSWORD,
  });
  if (signInErr || !signIn.session) {
    throw new Error(`E2E admin sign-in failed: ${signInErr?.message ?? "no session"}`);
  }

  const projectRef = "wineliuwejkxwsdbrthb";
  const storageKey = `sb-${projectRef}-auth-token`;
  const sessionPayload = JSON.stringify({
    access_token: signIn.session.access_token,
    refresh_token: signIn.session.refresh_token,
    expires_at: signIn.session.expires_at,
    expires_in: signIn.session.expires_in,
    token_type: signIn.session.token_type,
    user: signIn.session.user,
  });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("http://localhost:8080");
  await page.evaluate(
    ({ k, v }) => {
      localStorage.setItem(k, v);
    },
    { k: storageKey, v: sessionPayload },
  );

  const stateDir = path.join(process.cwd(), "tests/e2e/.auth");
  fs.mkdirSync(stateDir, { recursive: true });
  const storageStatePath = path.join(stateDir, "admin.json");
  await context.storageState({ path: storageStatePath });
  await browser.close();

  process.env.E2E_ADMIN_EMAIL = TEST_ADMIN_EMAIL;
  process.env.E2E_ADMIN_PASSWORD = TEST_ADMIN_PASSWORD;
  process.env.E2E_STORAGE_STATE = storageStatePath;
}
