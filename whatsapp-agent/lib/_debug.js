// TEMPORARY DEBUG INSTRUMENTATION. Remove once root cause is confirmed.
// Sends each event to (a) console.log so Railway captures it and
// (b) the local debug ingest endpoint when running locally.

const ENDPOINT =
  process.env.DEBUG_INGEST_URL ||
  "http://127.0.0.1:7457/ingest/81f7289a-c4d7-40b8-b59b-bfc104f84409";
const SESSION = process.env.DEBUG_SESSION_ID || "299bd9";

export function dbg(location, message, data, hypothesisId) {
  const payload = {
    sessionId: SESSION,
    location,
    message,
    hypothesisId: hypothesisId ?? null,
    data,
    timestamp: Date.now(),
  };
  try {
    console.log("[DBG]", JSON.stringify(payload));
  } catch {
    console.log("[DBG]", location, message);
  }
  try {
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": SESSION },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

export function clip(value, max = 4000) {
  if (value == null) return value;
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…[+${s.length - max} chars]` : s;
}
