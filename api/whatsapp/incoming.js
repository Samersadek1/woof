function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function normalizeSecret(value) {
  return typeof value === "string" ? value.trim() : "";
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const expectedSecret = normalizeSecret(process.env.WHATSAPP_BRIDGE_SECRET);
  const providedSecret = normalizeSecret(req.headers["x-bridge-secret"]);
  if (!expectedSecret) {
    return json(res, 500, { error: "Missing WHATSAPP_BRIDGE_SECRET on server" });
  }

  if (!providedSecret || providedSecret !== expectedSecret) {
    return json(res, 401, { error: "Unauthorized" });
  }

  const body = req.body ?? {};
  const from = typeof body.from === "string" ? body.from : "";
  const text = typeof body.body === "string" ? body.body : "";
  const brandPhoneNumber =
    typeof body.brandPhoneNumber === "string" ? body.brandPhoneNumber : "";
  const messageType = typeof body.messageType === "string" ? body.messageType : "text";

  if (!from || !text || !brandPhoneNumber) {
    return json(res, 400, {
      error: "Missing required fields: from, body, brandPhoneNumber",
    });
  }

  const bridgeTargetUrl = process.env.WHATSAPP_BRIDGE_TARGET_URL;
  if (!bridgeTargetUrl) {
    return json(res, 200, {
      ok: true,
      responseText: null,
      note: "Bridge endpoint is live. Set WHATSAPP_BRIDGE_TARGET_URL to enable replies.",
      received: { from, brandPhoneNumber, messageType },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const downstreamHeaders = {
      "Content-Type": "application/json",
    };
    const downstreamSecret = normalizeSecret(process.env.WHATSAPP_BRIDGE_TARGET_SECRET);
    if (downstreamSecret) downstreamHeaders["x-bridge-secret"] = downstreamSecret;

    const downstreamRes = await fetch(bridgeTargetUrl, {
      method: "POST",
      headers: downstreamHeaders,
      body: JSON.stringify({
        from,
        body: text,
        brandPhoneNumber,
        messageType,
      }),
      signal: controller.signal,
    });

    const payload = await downstreamRes.json().catch(() => ({}));
    if (!downstreamRes.ok) {
      return json(res, 502, {
        error: "Downstream bridge call failed",
        status: downstreamRes.status,
        details: payload,
      });
    }

    return json(res, 200, {
      ok: true,
      responseText:
        typeof payload?.responseText === "string" ? payload.responseText : null,
      downstream: payload,
    });
  } catch (err) {
    const message = err?.name === "AbortError" ? "Bridge timeout" : err?.message;
    return json(res, 504, { error: message || "Bridge request failed" });
  } finally {
    clearTimeout(timeout);
  }
}
