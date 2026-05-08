// Pure phone / WhatsApp JID utilities. No I/O, no DB, no client. Used by every
// routing layer (inbound, activation, owner lookup) so they share the exact
// same notion of "what is the same number".

const STAFF_ROUTE_MARKER_RE = /\[#route\s+phone=([^\]\s]+)(?:\s+[^\]]*)?\]/i;

export function normalizeDigits(value) {
  return (value ?? "").toString().replace(/\D/g, "");
}

// Returns every plausible variant of a phone number's digits we should try
// when matching against owner phone fields (which can be stored as
// 0XXXXXXXX, 971XXXXXXXX, +971XXXXXXXX, 00971XXXXXXXX...).
export function phoneDigitsCandidates(phone) {
  const digits = normalizeDigits((phone ?? "").toString().replace(/@(c\.us|lid)$/i, ""));
  const out = new Set();
  if (!digits) return out;

  out.add(digits);

  if (digits.startsWith("00") && digits.length > 2) {
    out.add(digits.slice(2));
  }
  if (digits.startsWith("971") && digits.length > 3) {
    out.add(`0${digits.slice(3)}`);
  }
  if (digits.startsWith("0") && digits.length > 1) {
    out.add(`971${digits.slice(1)}`);
  }

  return out;
}

// Canonical conversation key. We keep @lid IDs as-is (they are not phone
// numbers) but normalize @c.us and bare strings into the digits@c.us form.
export function canonicalConversationPhone(value) {
  const raw = (value ?? "").toString().trim();
  if (raw.endsWith("@lid")) return raw;
  const digits = normalizeDigits(raw.replace(/@(c\.us|lid)$/i, ""));
  if (digits) return `${digits}@c.us`;
  if (/@(c\.us|lid)$/i.test(raw)) return raw;
  return `${raw.replace(/\s/g, "")}@c.us`;
}

// Loose digit comparison. We accept exact match, suffix match (8-9 trailing
// digits), or symmetric prefix match. Tolerates inconsistent country-code
// prefixes between WhatsApp JIDs and stored owner phones.
export function phoneLikelyMatches(ownerDigits, candidateDigitsSet) {
  if (!ownerDigits) return false;
  for (const c of candidateDigitsSet) {
    if (!c) continue;
    if (ownerDigits === c) return true;
    if (ownerDigits.endsWith(c) || c.endsWith(ownerDigits)) return true;
    if (ownerDigits.length >= 9 && c.length >= 9 && ownerDigits.slice(-9) === c.slice(-9)) {
      return true;
    }
    if (ownerDigits.length >= 8 && c.length >= 8 && ownerDigits.slice(-8) === c.slice(-8)) {
      return true;
    }
  }
  return false;
}

export function extractName(text) {
  if (!text) return null;
  const match = text.match(/\b(?:my name is|i am|i'm|this is)\s+([A-Za-z][A-Za-z' -]{1,40})/i);
  return match?.[1]?.trim() ?? null;
}

// True for short confirmations ("yes", "ok", "go ahead"...). Used to skip
// affirmation-only messages when picking the latest substantive intent.
export function isAffirmationOnlyMessage(text) {
  const normalized = (text ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
  if (!normalized) return true;
  return /^(yes|yep|yeah|ok|okay|sure|go ahead|please proceed|do it|book it|confirmed?)$/.test(
    normalized,
  );
}

// Parses "[#route phone=<jid> state=<x>]" markers we put inside staff-group
// notifications so the bot can route a quoted reply back to the right chat.
export function extractStaffRoutePhone(text) {
  const match = (text ?? "").match(STAFF_ROUTE_MARKER_RE);
  return match?.[1]?.trim() ?? null;
}
