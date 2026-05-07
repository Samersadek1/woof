import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type MessageParam = { role: "user" | "assistant"; content: string };
type RequestBody = {
  session_id: string | null;
  message: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { session_id, message } = (await req.json()) as RequestBody;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error(
        "Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY",
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const user = userData.user;

    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Load or create session
    let currentSessionId: string = session_id ?? "";
    let history: MessageParam[] = [];
    let isNew = false;

    if (currentSessionId) {
      const { data: sess } = await serviceClient
        .from("staff_sessions")
        .select("history")
        .eq("id", currentSessionId)
        .eq("staff_id", user.id)
        .single();

      if (sess) {
        history = (sess.history as MessageParam[] | null) ?? [];
      } else {
        currentSessionId = "";
      }
    }

    if (!currentSessionId) {
      const { data: newSession, error } = await serviceClient
        .from("staff_sessions")
        .insert({
          staff_id: user.id,
          title: "New conversation",
          history: [],
        })
        .select("id")
        .single();

      if (error || !newSession) {
        return new Response(
          JSON.stringify({ error: "Failed to create session" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      currentSessionId = newSession.id;
      isNew = true;
    }

    const userMessage: MessageParam = { role: "user", content: message };
    const claudeMessages = [...history, userMessage];

    const anthropic = new Anthropic({
      apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: claudeMessages,
    });

    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const assistantMessage: MessageParam = { role: "assistant", content: text };
    const updatedHistory = [...claudeMessages, assistantMessage];

    const autoTitle = isNew
      ? message.slice(0, 60).trim() + (message.length > 60 ? "…" : "")
      : null;

    await serviceClient
      .from("staff_sessions")
      .update({
        history: updatedHistory,
        ...(autoTitle ? { title: autoTitle } : {}),
      })
      .eq("id", currentSessionId);

    return new Response(
      JSON.stringify({
        text,
        session_id: currentSessionId,
        title: autoTitle ?? undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
