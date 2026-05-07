type ErrorLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

export const BOOKING_ROOM_OVERLAP_TOKEN = "ROOM_OVERLAP_CONFLICT";

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

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
