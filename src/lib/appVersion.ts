export type AppVersionPayload = { buildId: string };

/** Build baked into this JS bundle at compile time. */
export function getClientBuildId(): string {
  return import.meta.env.VITE_APP_BUILD_ID ?? "unknown";
}

/** Latest deploy id from the server (`/version.json`). */
export async function fetchRemoteBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?ts=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AppVersionPayload;
    return typeof data.buildId === "string" && data.buildId.length > 0 ? data.buildId : null;
  } catch {
    return null;
  }
}

export const APP_VERSION_POLL_MS = 5 * 60 * 1000;
