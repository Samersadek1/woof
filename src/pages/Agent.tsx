import { useCallback, useEffect, useRef, useState } from "react";
import { PawPrint, Send, Loader2, Bot, User, AlertCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";

const MAX_HISTORY = 20;
const QUERY_LIMIT = 100;
const CHAT_STORAGE_KEY = "msh-agent-chat-v1";

const ALLOWED_TABLES = new Set([
  "bookings",
  "booking_pets",
  "pets",
  "owners",
  "rooms",
  "daycare_sessions",
  "daycare_packages",
  "park_bookings",
  "vaccinations",
]);

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type FilterScalar = string | number | boolean | null;
type MessageParam = { role: "user" | "assistant"; content: string };
type ClaudeResponse = {
  content?: Array<{ type: string; text?: string }>;
};

/** Per-column comparisons (PostgREST / Supabase client). */
type FilterCompare = {
  eq?: FilterScalar;
  neq?: FilterScalar;
  lt?: string;
  lte?: string;
  gt?: string;
  gte?: string;
};

type FilterValue = FilterScalar | string[] | FilterCompare;

type QueryAction = {
  action: "query";
  table: string;
  select?: string;
  filter?: Record<string, FilterValue>;
  /** @deprecated Prefer nesting inside "select" (PostgREST). If set, appended after select columns. */
  join?: string;
};

function buildInitialSystemPrompt(todayISO: string): string {
  return `You are an AI assistant for MySecondHome (MSH), a premium pet boarding facility in Dubai. You help staff query the system using plain English.

You have access to a Supabase (PostgREST) database. When you need data, respond with ONLY a JSON object on a single line with NO other text before or after it:
{"action":"query","table":"TABLE_NAME","select":"COLUMNS","filter":{...}}

Available tables and their key columns:
- bookings: id, booking_ref, owner_id, room_id, check_in_date, check_out_date, status, actual_check_in_at, actual_check_out_at
- booking_pets: booking_id, pet_id (junction: links bookings to pets — always reach pets through bookings: booking_pets(...pets(...)))
- pets: id, name, species, breed, owner_id  (species is usually "dog" or "cat")
- owners: id, first_name, last_name, phone, member_type, wallet_balance
- rooms: id, display_name, wing, room_type  (wing "cattery" = cat boarding rooms; all other wings = dog boarding)
- daycare_sessions: id, pet_id, owner_id, package_id, session_date, checked_in, pickup_used, dropoff_used
- daycare_packages: id, pet_id, owner_id, total_days, days_used
- park_bookings: id, visit_date, slot_start, size_lane, pet_id, owner_id
- vaccinations: id, pet_id, vaccine_name, expiry_date

Today's date is: ${todayISO}

Nested data (PostgREST): put foreign-table expansions inside "select" using parentheses, e.g.
bookings with room + pets:
{"action":"query","table":"bookings","select":"id,booking_ref,check_in_date,check_out_date,status,room_id,rooms(wing,display_name),booking_pets(pet_id,pets(id,name,species))","filter":{...}}

Filters:
- Equality: "filter":{"status":"checked_in"}
- Several allowed values: "filter":{"status":["confirmed","checked_in"]}
- Comparisons on one column (object value): use lte, lt, gte, gt, neq, eq (ISO date strings for dates).
- A booking occupies overnight dates from check_in_date (inclusive) through the day before check_out_date (check_out_date is the departure day, not counted as an occupied night). So for "who is in house on DATE": check_in_date <= DATE AND check_out_date > DATE.

Example — all boarding on 2026-04-10, excluding cancelled:
{"action":"query","table":"bookings","select":"id,booking_ref,check_in_date,check_out_date,status,rooms(wing,display_name),booking_pets(pet_id,pets(name,species))","filter":{"check_in_date":{"lte":"2026-04-10"},"check_out_date":{"gt":"2026-04-10"},"status":{"neq":"cancelled"}}}
Use rooms.wing to distinguish dog rooms vs cat rooms (wing "cattery" = cat rooms).

For who is checked in right now: "filter":{"status":"checked_in"} on bookings (add nested selects if names are needed).

For check-ins on a calendar day: check_in_date equals that day (eq) and status in ["confirmed","checked_in"].
For check-outs on a calendar day: check_out_date equals that day.

When you have the data, answer in plain conversational English. Be concise. Never show JSON to the user.

Omit "select" to use "*". Omit "filter" if not needed.`;
}

const SUMMARIZE_SYSTEM_PROMPT = `You are an AI assistant for MySecondHome (MSH). A database query already ran for the staff member.

The last user message starts with "Query result:" and contains JSON from Supabase (or an error object).

Answer their question in plain conversational English only. Be concise.

If the payload has an "error" field, explain briefly what went wrong (e.g. bad filter) — do not claim the database schema or relationships are broken unless the error text clearly says so.

Never output JSON, code fences, or query syntax. Never ask for another query.`;

function extractAssistantText(response: ClaudeResponse): string {
  const blocks = response.content;
  if (!blocks?.length) return "";
  return blocks
    .filter((b): b is { type: "text"; text: string } => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function sliceBalancedObject(text: string, start: number): string | null {
  if (text[start] !== "{") return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function tryParseAction(raw: string): QueryAction | null {
  try {
    const o = JSON.parse(raw.trim()) as QueryAction;
    if (o?.action === "query" && typeof o.table === "string") return o;
  } catch {
    /* ignore */
  }
  return null;
}

function parseQueryAction(text: string): QueryAction | null {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  const direct = tryParseAction(stripped);
  if (direct) return direct;

  const simpleMatch = stripped.match(/\{[^{}]*"action"[^{}]*\}/);
  if (simpleMatch) {
    const a = tryParseAction(simpleMatch[0]);
    if (a) return a;
  }

  let searchFrom = 0;
  while (searchFrom < stripped.length) {
    const open = stripped.indexOf("{", searchFrom);
    if (open === -1) break;
    const chunk = sliceBalancedObject(stripped, open);
    if (chunk && chunk.includes('"action"') && chunk.includes("query")) {
      const a = tryParseAction(chunk);
      if (a) return a;
    }
    searchFrom = open + 1;
  }

  return null;
}

function buildSelectClause(action: QueryAction): string {
  const raw = (action.select?.trim() || "*").replace(/\s+/g, "");
  const join = action.join?.trim().replace(/\s+/g, "");
  if (!join) return raw;
  if (raw === "*") return `*,${join}`;
  return `${raw},${join}`;
}

function isCompareObject(val: unknown): val is FilterCompare {
  if (val === null || typeof val !== "object" || Array.isArray(val)) return false;
  return (
    "eq" in val ||
    "neq" in val ||
    "lt" in val ||
    "lte" in val ||
    "gt" in val ||
    "gte" in val
  );
}

async function runSupabaseQuery(action: QueryAction): Promise<unknown> {
  if (!ALLOWED_TABLES.has(action.table)) {
    return { error: `Table "${action.table}" is not allowed.` };
  }

  const sel = buildSelectClause(action);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any).from(action.table).select(sel).limit(QUERY_LIMIT);

  const filter = action.filter ?? {};
  for (const [key, val] of Object.entries(filter)) {
    if (val === undefined) continue;
    if (Array.isArray(val)) {
      q = q.in(key, val);
    } else if (isCompareObject(val)) {
      if (val.eq !== undefined) q = q.eq(key, val.eq);
      if (val.neq !== undefined) q = q.neq(key, val.neq);
      if (val.lt !== undefined) q = q.lt(key, val.lt);
      if (val.lte !== undefined) q = q.lte(key, val.lte);
      if (val.gt !== undefined) q = q.gt(key, val.gt);
      if (val.gte !== undefined) q = q.gte(key, val.gte);
    } else {
      q = q.eq(key, val);
    }
  }

  const { data, error } = await q;
  if (error) return { error: error.message, details: error };
  return data;
}

function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_HISTORY) return messages;
  return messages.slice(-MAX_HISTORY);
}

function isChatMessage(x: unknown): x is ChatMessage {
  if (x === null || typeof x !== "object") return false;
  const m = x as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    (m.role === "user" || m.role === "assistant") &&
    typeof m.content === "string"
  );
}

function loadStoredMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChatMessage);
  } catch {
    return [];
  }
}

function persistMessages(messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    if (messages.length === 0) {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    } else {
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    }
  } catch {
    /* quota or private mode */
  }
}

function sanitizeNonActionAssistantText(text: string): string {
  const t = text.trim();
  if (t.startsWith("{") && t.endsWith("}") && parseQueryAction(t)) {
    return "I couldn't run that request. Please try rephrasing your question.";
  }
  return text;
}

const AgentPage = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(loadStoredMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    persistMessages(messages);
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const callClaude = useCallback(
    async (
      systemPrompt: string,
      msgs: MessageParam[]
    ): Promise<string> => {
      const { data, error } = await supabase.functions.invoke("agent-chat", {
        body: { messages: msgs, systemPrompt },
      });
      if (error) throw new Error(error.message);

      return extractAssistantText(data as ClaudeResponse);
    },
    []
  );

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setError(null);
    setInput("");

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    const nextHistory = trimHistory([...messages, userMsg]);
    setMessages(nextHistory);
    setLoading(true);

    try {
      const anthropicMessages: MessageParam[] = nextHistory.map(
        (m) => ({
          role: m.role,
          content: m.content,
        })
      );

      const todayISO = new Date().toISOString().split("T")[0];
      const firstText = await callClaude(
        buildInitialSystemPrompt(todayISO),
        anthropicMessages
      );

      const action = parseQueryAction(firstText);

      let assistantContent: string;

      if (action) {
        const data = await runSupabaseQuery(action);
        const secondMsgs: MessageParam[] = [
          ...anthropicMessages,
          { role: "assistant", content: firstText },
          {
            role: "user",
            content: `Query result: ${JSON.stringify(data)}`,
          },
        ];

        assistantContent =
          (await callClaude(SUMMARIZE_SYSTEM_PROMPT, secondMsgs)).trim() ||
          "I could not summarize the result.";
      } else {
        assistantContent =
          sanitizeNonActionAssistantText(firstText) || "No response.";
      }

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: assistantContent,
      };

      setMessages(trimHistory([...nextHistory, assistantMsg]));
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Something went wrong. Try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 h-full overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <PawPrint className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold tracking-tight">
            MySecondHome
          </h1>
          <p className="text-xs text-muted-foreground">AI Assistant</p>
        </div>
        {messages.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            onClick={() => {
              setMessages([]);
              setError(null);
            }}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Clear chat
          </Button>
        )}
      </header>

      {error && (
        <div className="shrink-0 px-6 pt-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
          {messages.length === 0 && !loading && (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
              <Bot className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p className="font-medium text-foreground">
                Ask about bookings, customers, daycare, rooms, or wallet
                balances.
              </p>
              <p className="mt-2">
                {`Example: "Who is checked in today?" or "Bookings checking in on ${new Date().toISOString().split("T")[0]}?"`}
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {m.role === "user" ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border text-foreground"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking…
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border bg-card p-4">
        <div className="mx-auto flex max-w-3xl gap-2">
          <Textarea
            placeholder="Message MSH AI…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            disabled={loading}
            className="min-h-[72px] resize-none"
          />
          <Button
            type="button"
            size="icon"
            className="h-[72px] w-12 shrink-0"
            onClick={() => void handleSend()}
            disabled={loading || !input.trim()}
            aria-label="Send"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AgentPage;
