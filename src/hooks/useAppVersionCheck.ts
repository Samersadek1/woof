import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  APP_VERSION_POLL_MS,
  fetchRemoteBuildId,
  getClientBuildId,
} from "@/lib/appVersion";
import { reloadForStaleChunk } from "@/lib/lazyWithRetry";

const VERSION_TOAST_ID = "app-version-update";
const VERSION_RELOAD_KEY = "woof:version-reload";

function showVersionUpdateToast() {
  toast("New version available", {
    id: VERSION_TOAST_ID,
    description: "Refreshing to load the latest woof release…",
    duration: 4000,
  });
}

/**
 * Polls `/version.json` and reloads after a new Vercel deploy.
 * Skipped in dev (no stable build id).
 */
export function useAppVersionCheck() {
  const reloadScheduledRef = useRef(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;

    const clientBuildId = getClientBuildId();
    let cancelled = false;

    const check = async () => {
      if (cancelled || reloadScheduledRef.current) return;
      const remoteBuildId = await fetchRemoteBuildId();
      if (cancelled || !remoteBuildId || remoteBuildId === clientBuildId) return;
      reloadScheduledRef.current = true;
      sessionStorage.removeItem("woof:chunk-reload");
      const alreadyReloaded = sessionStorage.getItem(VERSION_RELOAD_KEY) === "1";
      if (!alreadyReloaded) {
        sessionStorage.setItem(VERSION_RELOAD_KEY, "1");
        showVersionUpdateToast();
        window.setTimeout(() => reloadForStaleChunk(), 1200);
        return;
      }
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
