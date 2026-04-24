import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, PawPrint } from "lucide-react";
import type { EmailOtpType, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

const SetupPasswordPage = () => {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [inviteSession, setInviteSession] = useState<Session | null>(null);
  const [resolvingInvite, setResolvingInvite] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return password.length >= 8 && password === confirmPassword;
  }, [password, confirmPassword]);

  useEffect(() => {
    let cancelled = false;

    const resolveInviteSession = async () => {
      if (session) {
        if (!cancelled) {
          setInviteSession(session);
          setResolvingInvite(false);
        }
        return;
      }

      try {
        const url = new URL(window.location.href);
        const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
        const searchParams = url.searchParams;
        // #region agent log
        fetch('http://127.0.0.1:7457/ingest/81f7289a-c4d7-40b8-b59b-bfc104f84409',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53391a'},body:JSON.stringify({sessionId:'53391a',runId:'qa-baseline',hypothesisId:'H4',location:'src/pages/SetupPasswordPage.tsx:resolveInviteSession:payloadShape',message:'invite payload shape detected',data:{hasCode:!!(searchParams.get('code')||hashParams.get('code')),hasTokenHash:!!(searchParams.get('token_hash')||hashParams.get('token_hash')),hasAccessToken:!!(searchParams.get('access_token')||hashParams.get('access_token')),hasRefreshToken:!!(searchParams.get('refresh_token')||hashParams.get('refresh_token')),type:(searchParams.get('type')||hashParams.get('type'))??null},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        const code = searchParams.get("code") || hashParams.get("code");
        if (code) {
          const { data, error: codeError } = await supabase.auth.exchangeCodeForSession(code);
          if (codeError) throw codeError;
          if (!cancelled) setInviteSession(data.session ?? null);
        } else {
          const accessToken = searchParams.get("access_token") || hashParams.get("access_token");
          const refreshToken = searchParams.get("refresh_token") || hashParams.get("refresh_token");
          if (accessToken && refreshToken) {
            const { data, error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionError) throw sessionError;
            if (!cancelled) setInviteSession(data.session ?? null);
            return;
          }
          const tokenHash = searchParams.get("token_hash") || hashParams.get("token_hash");
          const type = (searchParams.get("type") || hashParams.get("type")) as EmailOtpType | null;
          if (tokenHash && type) {
            const { data, error: otpError } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type,
            });
            if (otpError) throw otpError;
            if (!cancelled) setInviteSession(data.session ?? null);
          }
        }
      } catch (err: any) {
        // #region agent log
        fetch('http://127.0.0.1:7457/ingest/81f7289a-c4d7-40b8-b59b-bfc104f84409',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53391a'},body:JSON.stringify({sessionId:'53391a',runId:'qa-baseline',hypothesisId:'H4',location:'src/pages/SetupPasswordPage.tsx:resolveInviteSession:catch',message:'invite resolution failed',data:{errorMessage:err?.message??'unknown'},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (!cancelled) {
          setError(err?.message || "Could not verify invite link.");
        }
      } finally {
        if (!cancelled) {
          setResolvingInvite(false);
        }
      }
    };

    resolveInviteSession();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const activeSession = session ?? inviteSession;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!activeSession) {
      setError("Invite session is missing. Please open the invite link again.");
      return;
    }
    if (!canSubmit) {
      setError("Passwords must match and be at least 8 characters.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage("Password set successfully. Redirecting...");
    setTimeout(() => navigate("/", { replace: true }), 600);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center gap-2">
            <PawPrint className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Set your password</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Complete account setup to sign in normally.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm"
        >
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm_password">Confirm password</Label>
            <Input
              id="confirm_password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {(loading || resolvingInvite) && (
            <p className="text-sm text-muted-foreground">Verifying invite session...</p>
          )}
          {!loading && !resolvingInvite && !activeSession && (
            <p className="text-sm text-destructive">
              No active invite session found. Open the invite link from your email.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-emerald-700">{message}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={saving || loading || resolvingInvite || !activeSession}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Set password"
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Already set? <Link className="underline" to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default SetupPasswordPage;
