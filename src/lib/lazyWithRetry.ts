import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const CHUNK_RELOAD_KEY = "woof:chunk-reload";

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("dynamically imported module")
  );
}

/** Hard navigation so the browser picks up a fresh index.html + asset hashes after deploy. */
export function reloadForStaleChunk(): void {
  const url = new URL(window.location.href);
  url.searchParams.set("_chunk", String(Date.now()));
  window.location.replace(url.toString());
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

    const reloadCount = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? "0");
    if (reloadCount < 2) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(reloadCount + 1));
      reloadForStaleChunk();
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
