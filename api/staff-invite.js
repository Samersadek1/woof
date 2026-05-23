import { createClient } from "@supabase/supabase-js";

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function resolveActor(serviceClient, user) {
  if (!user) return null;
  if (user.email) {
    const { data } = await serviceClient
      .from("staff")
      .select("id, role, active, email")
      .ilike("email", user.email)
      .maybeSingle();
    if (data) return data;
  }
  if (user.id) {
    const { data } = await serviceClient
      .from("staff")
      .select("id, role, active, email")
      .eq("id", user.id)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

function hasPrivilegedRoleFromMetadata(user) {
  const role = user?.app_metadata?.role;
  return role === "admin" || role === "management";
}

function resolveBaseUrl(req) {
  const envBase =
    process.env.APP_BASE_URL ||
    process.env.SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;
  if (envBase) {
    const withProtocol = envBase.startsWith("http")
      ? envBase
      : `https://${envBase}`;
    return withProtocol.replace(/\/+$/, "");
  }
  const host = req.headers.host;
  if (!host) return "https://woof.vercel.app";
  return `${host.includes("localhost") ? "http" : "https"}://${host}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

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

  const supabaseAuth = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabaseAuth.auth.getUser(token);
  if (userErr || !user?.email) {
    return json(res, 401, { error: "Invalid session" });
  }

  const actor = await resolveActor(service, user);
  const metadataPrivileged = hasPrivilegedRoleFromMetadata(user);
  const actorPrivileged =
    !!actor && actor.active && ["admin", "management"].includes(actor.role);
  if (!actorPrivileged && !metadataPrivileged) {
    return json(res, 403, { error: "Insufficient permissions" });
  }

  const { firstName, lastName, email, phone, role, active } = req.body || {};
  if (!firstName || !lastName || !email || !role) {
    return json(res, 400, { error: "Missing required fields" });
  }

  // 1) Send Supabase Auth invite email so the user can set password.
  const baseUrl = resolveBaseUrl(req);
  const invite = await service.auth.admin.inviteUserByEmail(String(email).trim(), {
    redirectTo: `${baseUrl}/auth/setup-password`,
    data: {
      first_name: String(firstName).trim(),
      last_name: String(lastName).trim(),
      role,
    },
  });
  if (invite.error) {
    return json(res, 400, { error: invite.error.message });
  }

  // 2) Ensure staff profile exists/updated for app role + active status.
  const trimmedEmail = String(email).trim();
  const { data: existing } = await service
    .from("staff")
    .select("id")
    .eq("email", trimmedEmail)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await service
      .from("staff")
      .update({
        first_name: String(firstName).trim(),
        last_name: String(lastName).trim(),
        phone: phone ? String(phone).trim() : null,
        role,
        active: Boolean(active),
      })
      .eq("id", existing.id);
    if (error) return json(res, 500, { error: error.message });
  } else {
    const { error } = await service.from("staff").insert({
      first_name: String(firstName).trim(),
      last_name: String(lastName).trim(),
      email: trimmedEmail,
      phone: phone ? String(phone).trim() : null,
      role,
      active: Boolean(active),
    });
    if (error) return json(res, 500, { error: error.message });
  }

  return json(res, 200, { ok: true, invitedEmail: trimmedEmail });
}
