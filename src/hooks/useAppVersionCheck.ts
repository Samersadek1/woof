import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  APP_VERSION_POLL_MS,
  fetchRemoteBuildId,
  getClientBuildId,
} from "@/lib/appVersion";

const VERSION_TOAST_ID = "app-version-update";

function showVersionUpdateToast() {
  toast("New version available", {
    id: VERSION_TOAST_ID,
    description: "Refresh to load the latest woof release.",
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Refresh",
      onClick: () => window.location.reload(),
    },
  });
}

/**
 * Polls `/version.json` and prompts staff to refresh after a new Vercel deploy.
 * Skipped in dev (no stable build id).
 */
export function useAppVersionCheck() {
  const toastShownRef = useRef(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;

    const clientBuildId = getClientBuildId();
    let cancelled = false;

    const check = async () => {
      if (cancelled || toastShownRef.current) return;
      const remoteBuildId = await fetchRemoteBuildId();
      if (cancelled || !remoteBuildId || remoteBuildId === clientBuildId) return;
      toastShownRef.current = true;
      showVersionUpdateToast();
    };

    const intervalId = window.setInterval(() => void check(), APP_VERSION_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };

    document.addEventListener("visibilitychange", onVisibility);
    void check();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}
