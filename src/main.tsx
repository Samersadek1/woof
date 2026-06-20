import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { RootErrorBoundary } from "./RootErrorBoundary.tsx";
import { isChunkLoadError, reloadForStaleChunk } from "@/lib/lazyWithRetry";

// Stale JS chunks after a Vercel deploy (tab left open across releases).
window.addEventListener("vite:preloadError", () => {
  reloadForStaleChunk();
});

window.addEventListener("unhandledrejection", (event) => {
  if (!isChunkLoadError(event.reason)) return;
  const reloadCount = Number(sessionStorage.getItem("woof:chunk-reload") ?? "0");
  if (reloadCount >= 2) return;
  event.preventDefault();
  sessionStorage.setItem("woof:chunk-reload", String(reloadCount + 1));
  reloadForStaleChunk();
});

const el = document.getElementById("root");
if (!el) {
  throw new Error('Missing #root element in index.html');
}

createRoot(el).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>,
);
