import { useCallback, useEffect, useRef, useState } from "react";
import { PawPrint, Send, Loader2, Bot, User, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type SessionSummary = {
  id: string;
  title: string;
  updated_at: string;
};

type SessionRecord = {
  id: string;
  title: string;
  history: Array<{ role: string; content: string }>;
};

type AgentReply = {
  text?: string;
  session_id?: string | null;
  title?: string;
  meta?: {
    progress_stage?: "analyzing" | "querying_data" | "finalizing";
    total_ms?: number;
    claude_rounds?: number;
    tool_rounds?: number;
    used_snapshot?: boolean;
  };
};

type LoadingStage = "analyzing" | "querying_data" | "finalizing";

const AgentPage = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState("New conversation");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>("analyzing");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) return;
    setLoadingStage("analyzing");
    const stages: LoadingStage[] = ["analyzing", "querying_data", "finalizing"];
    let index = 0;
    const timer = window.setInterval(() => {
      index = Math.min(index + 1, stages.length - 1);
      setLoadingStage(stages[index]);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [loading]);

  const loadSessionList = useCallback(async () => {
    // staff_sessions is managed in DB; cast until generated types include it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("staff_sessions")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(25);
    if (data) setSessions(data as SessionSummary[]);
  }, []);

  useEffect(() => {
    void loadSessionList();
  }, [loadSessionList]);

  const openSession = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("staff_sessions")
      .select("id, title, history")
      .eq("id", id)
      .single();
    if (!data) return;

    const record = data as SessionRecord;
    setSessionId(record.id);
    setSessionTitle(record.title ?? "Conversation");
    const msgs: ChatMessage[] = (record.history ?? []).map((m) => ({
      id: crypto.randomUUID(),
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content ?? "",
    }));
    setMessages(msgs);
    setShowHistory(false);
    setError(null);
  };

  const newConversation = () => {
    setSessionId(null);
    setSessionTitle("New conversation");
    setMessages([]);
    setError(null);
    setShowHistory(false);
  };

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
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("agent-chat", {
        body: { session_id: sessionId, message: text },
      });
      if (invokeError) throw new Error(invokeError.message);

      const payload = (data ?? {}) as AgentReply;
      if (payload.meta?.progress_stage) {
        setLoadingStage(payload.meta.progress_stage);
      }
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: payload.text ?? "No response.",
      };
      setMessages((prev) => [...prev, assistantMsg]);
      if (payload.session_id) setSessionId(payload.session_id);
      if (payload.title) setSessionTitle(payload.title);
      await loadSessionList();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
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
    <div className="relative flex flex-1 flex-col min-h-0 h-full overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <PawPrint className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold tracking-tight truncate max-w-[200px]">
            {sessionTitle}
          </h1>
          <p className="text-xs text-muted-foreground">AI Assistant</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            onClick={newConversation}
          >
            New
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            onClick={() => setShowHistory((h) => !h)}
          >
            History
          </Button>
        </div>
      </header>

      {showHistory && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowHistory(false)}
          />
          <div className="absolute right-4 top-14 z-50 w-80 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-medium">Recent conversations</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={newConversation}
              >
                + New
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {sessions.length === 0 ? (
                <p className="px-4 py-6 text-sm text-center text-muted-foreground">
                  No past conversations
                </p>
              ) : (
                sessions.map((sess) => (
                  <button
                    key={sess.id}
                    onClick={() => void openSession(sess.id)}
                    className={`w-full text-left px-4 py-3 text-sm hover:bg-muted border-b border-border last:border-0 flex flex-col gap-0.5 transition-colors ${sess.id === sessionId ? "bg-muted" : ""}`}
                  >
                    <span className="font-medium truncate leading-snug">
                      {sess.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(sess.updated_at).toLocaleDateString("en-AE", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

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
                {loadingStage === "analyzing" && "Analyzing…"}
                {loadingStage === "querying_data" && "Querying data…"}
                {loadingStage === "finalizing" && "Finalizing answer…"}
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
