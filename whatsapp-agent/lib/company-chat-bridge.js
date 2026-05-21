// HTTP bridge to company-chat Mastra orchestration (inbound) and validation for
// outbound sends initiated by company-chat.

import { timingSafeEqual } from "node:crypto";
import { normalizeDigits } from "./identity.js";

const BRIDGE_SECRET_HEADER = "whatsapp-bridge-secret";
const BRIDGE_TIMEOUT_MS = Number(process.env.COMPANY_CHAT_BRIDGE_TIMEOUT_MS ?? 55_000);

/** E.164-style +digits for company-chat brand/sender lookup. */
export function formatE164Phone(value) {
  if (!value || typeof value !== "string") return null;
  if (value.endsWith("@lid")) return null;
  const digits = normalizeDigits(value.replace(/@(c\.us|lid)$/i, ""));
  return digits ? `+${digits}` : null;
}

export function getConnectedBusinessPhone(client) {
  const fromEnv = process.env.WHATSAPP_BRAND_PHONE?.trim();
  if (fromEnv) return fromEnv;

  const wid = client?.info?.wid;
  const user =
    (typeof wid?.user === "string" && wid.user) ||
    (typeof wid?._serialized === "string" ? wid._serialized.split("@")[0] : "");
  return formatE164Phone(user);
}

/**
 * POST to company-chat /api/whatsapp/incoming. Never throws — returns null on
 * skip, failure, or empty responseText.
 */
export async function fetchCompanyChatReply({
  from,
  body,
  brandPhoneNumber,
  messageType = "text",
}) {
  const baseUrl = process.env.COMPANY_CHAT_URL?.trim().replace(/\/$/, "");
  const secret = process.env.WHATSAPP_BRIDGE_SECRET?.trim();
  if (!baseUrl || !secret) return null;

  const sender = formatE164Phone(from);
  const brand = formatE164Phone(brandPhoneNumber) ?? brandPhoneNumber?.trim();
  if (!sender || !brand || !body?.trim()) return null;

  try {
    const res = await fetch(`${baseUrl}/api/whatsapp/incoming`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [BRIDGE_SECRET_HEADER]: secret,
      },
      body: JSON.stringify({
        from: sender,
        body: body.trim(),
        brandPhoneNumber: brand,
        messageType,
      }),
      signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn("company-chat bridge non-OK:", res.status, await res.text().catch(() => ""));
      return null;
    }

    const data = await res.json().catch(() => null);
    const text =
      typeof data?.responseText === "string" ? data.responseText.trim() : null;
    return text || null;
  } catch (err) {
    console.warn("company-chat bridge failed:", err?.message ?? err);
    return null;
  }
}

export function verifyBridgeTargetSecret(header) {
  const expected = process.env.WHATSAPP_BRIDGE_TARGET_SECRET?.trim();
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export { BRIDGE_SECRET_HEADER };
