import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const CHUNK_RELOAD_KEY = "woof:chunk-reload";

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("error loading dynamically imported module")
  );
}

/**
 * Runs a dynamic import; on stale-chunk errors reloads once, then rethrows.
 */
export async function importWithChunkReload<T>(
  importFn: () => Promise<T>,
): Promise<T> {
  try {
    const mod = await importFn();
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    return mod;
  } catch (error) {
    if (!isChunkLoadError(error)) throw error;

    const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
    if (!alreadyReloaded) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
      const url = new URL(window.location.href);
      url.searchParams.set("_chunk", String(Date.now()));
      window.location.replace(url.toString());
      throw error;
    }

    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    throw error;
  }
}

/**
 * Wraps React.lazy so a stale chunk after deploy triggers one full reload
 * (new index.html + asset hashes) instead of a broken route until manual refresh.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => importWithChunkReload(importFn));
}
