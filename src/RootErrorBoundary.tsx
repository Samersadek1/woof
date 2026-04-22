import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { error: Error | null };

/** Catches render errors so a white screen becomes a visible message + console stack. */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RootErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const message = this.state.error.message;
      return (
        <div
          style={{
            minHeight: "100vh",
            padding: 24,
            fontFamily: "system-ui, sans-serif",
            background: "#fafafa",
            color: "#111",
          }}
        >
          <h1 style={{ fontSize: 18, marginBottom: 12 }}>App failed to render</h1>
          <pre
            style={{
              padding: 12,
              background: "#fff",
              border: "1px solid #e5e5e5",
              borderRadius: 8,
              overflow: "auto",
              fontSize: 13,
              whiteSpace: "pre-wrap",
            }}
          >
            {message}
          </pre>
          <p style={{ marginTop: 16, color: "#666", fontSize: 14 }}>
            Check the browser console (F12 → Console) for the full stack. Common causes: missing{" "}
            <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code>.env</code>.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
