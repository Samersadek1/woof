import { createClient } from "@supabase/supabase-js";

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function findAuthUserByEmail(adminClient, email) {
  let page = 1;
  const perPage = 200;
  for (let i = 0; i < 10; i += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return json(res, 500, { error: "Missing Supabase server env vars" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return json(res, 401, { error: "Missing bearer token" });

  const client = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser(token);
  if (userErr || !user?.email) return json(res, 401, { error: "Invalid session" });

  const { data: actor } = await admin
    .from("staff")
    .select("role, active, email")
    .ilike("email", user.email)
    .maybeSingle();
  if (!actor || !actor.active || !["admin", "management"].includes(actor.role)) {
    return json(res, 403, { error: "Insufficient permissions" });
  }

  const { id, firstName, lastName, email, phone, role, active } = req.body || {};
  if (!id || !firstName || !lastName || !email || !role) {
    return json(res, 400, { error: "Missing required fields" });
  }

  const { data: existing, error: existingErr } = await admin
    .from("staff")
    .select("*")
    .eq("id", id)
    .single();
  if (existingErr) return json(res, 400, { error: existingErr.message });

  const newEmail = String(email).trim();
  const oldEmail = existing.email ? String(existing.email).trim() : null;

  if (oldEmail && oldEmail.toLowerCase() !== newEmail.toLowerCase()) {
    const authUser = await findAuthUserByEmail(admin, oldEmail);
    if (authUser?.id) {
      const { error: authUpdateErr } = await admin.auth.admin.updateUserById(authUser.id, {
        email: newEmail,
        user_metadata: {
          ...(authUser.user_metadata || {}),
          first_name: String(firstName).trim(),
          last_name: String(lastName).trim(),
        },
      });
      if (authUpdateErr) return json(res, 400, { error: authUpdateErr.message });
    }
  }

  const { data: updated, error: updateErr } = await admin
    .from("staff")
    .update({
      first_name: String(firstName).trim(),
      last_name: String(lastName).trim(),
      email: newEmail,
      phone: phone ? String(phone).trim() : null,
      role,
      active: Boolean(active),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (updateErr) return json(res, 400, { error: updateErr.message });

  return json(res, 200, { ok: true, staff: updated });
}
