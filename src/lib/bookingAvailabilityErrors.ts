type ErrorLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Read a user-visible message from Supabase/PostgREST or other thrown values. */
export function extractErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (typeof error === "string") {
    const trimmed = error.trim();
    return trimmed || fallback;
  }
  if (error instanceof Error) {
    const trimmed = error.message.trim();
    return trimmed || fallback;
  }
  if (error && typeof error === "object") {
    const e = error as ErrorLike;
    const message = toText(e.message);
    if (message) return message;
    const details = toText(e.details);
    if (details) return details;
    const hint = toText(e.hint);
    if (hint) return hint;
  }
  return fallback;
}

export const BOOKING_ROOM_OVERLAP_TOKEN = "ROOM_OVERLAP_CONFLICT";

export function isBookingRoomOverlapError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const e = error as ErrorLike;
  const message = toText(e.message);
  const details = toText(e.details);
  const hint = toText(e.hint);

  return (
    message.includes(BOOKING_ROOM_OVERLAP_TOKEN) ||
    details.includes(BOOKING_ROOM_OVERLAP_TOKEN) ||
    hint.includes(BOOKING_ROOM_OVERLAP_TOKEN)
  );
}

export function getBookingRoomOverlapErrorMessage(error: unknown): string | null {
  if (!isBookingRoomOverlapError(error)) return null;
  return "This room is already booked for these dates by another owner. Choose another room or adjust dates.";
}
