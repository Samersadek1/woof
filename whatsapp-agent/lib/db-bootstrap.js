// Startup-time guarantees on the agent_conversations schema and the session
// storage bucket. Runs once at boot. Failures here are fatal because routing
// depends on these columns existing.

export async function ensureSessionBucketAccess(supabase, sessionBucket) {
  const { error } = await supabase.storage.from(sessionBucket).list("", { limit: 1 });
  if (error) {
    throw new Error(
      `Cannot access Supabase storage bucket '${sessionBucket}': ${error.message}`,
    );
  }
}

async function tryAddColumn(supabase, sql) {
  try {
    await supabase.rpc("execute_sql", { query: sql });
  } catch {
    // Best-effort. The column may already exist or the RPC may be locked
    // down; we will error cleanly in assertAgentConversationColumns below.
  }
}

export async function ensureAgentConversationColumns(supabase) {
  await tryAddColumn(
    supabase,
    `ALTER TABLE agent_conversations ADD COLUMN IF NOT EXISTS owner_profile TEXT;`,
  );
  await tryAddColumn(
    supabase,
    `ALTER TABLE agent_conversations
       ADD COLUMN IF NOT EXISTS facts JSONB NOT NULL DEFAULT '{}'::jsonb;`,
  );
}

export async function assertAgentConversationColumns(supabase) {
  const { error: factsErr } = await supabase
    .from("agent_conversations")
    .select("facts")
    .limit(1);
  if (factsErr) {
    throw new Error(
      `agent_conversations.facts is required for alias routing: ${factsErr.message}`,
    );
  }

  const { error: profileErr } = await supabase
    .from("agent_conversations")
    .select("owner_profile")
    .limit(1);
  if (profileErr) {
    throw new Error(
      `agent_conversations.owner_profile is required for stable owner context: ${profileErr.message}`,
    );
  }
}

export async function bootstrapAgentSchema(supabase, { sessionBucket }) {
  await ensureSessionBucketAccess(supabase, sessionBucket);
  await ensureAgentConversationColumns(supabase);
  await assertAgentConversationColumns(supabase);
}
