import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, PawPrint } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

const SetupPasswordPage = () => {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return password.length >= 8 && password === confirmPassword;
  }, [password, confirmPassword]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!session) {
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

          {loading && (
            <p className="text-sm text-muted-foreground">Verifying invite session...</p>
          )}
          {!loading && !session && (
            <p className="text-sm text-destructive">
              No active invite session found. Open the invite link from your email.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-emerald-700">{message}</p>}

          <Button type="submit" className="w-full" disabled={saving || loading || !session}>
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
