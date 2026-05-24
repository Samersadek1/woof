import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { RootErrorBoundary } from "./RootErrorBoundary.tsx";

// Stale JS chunks after a Vercel deploy (tab left open across releases).
window.addEventListener("vite:preloadError", () => {
  window.location.reload();
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
