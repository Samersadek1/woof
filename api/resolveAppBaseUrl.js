/** Production default when env/request host cannot be resolved (see Vercel aliases). */
export const DEFAULT_PRODUCTION_URL = "https://woof-neon.vercel.app";

export function normalizeBaseUrl(value) {
  if (!value) return null;
  const withProtocol = value.startsWith("http") ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, "");
}

export function isLocalhostUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

/**
 * Base URL for auth redirects (staff invites, etc.).
 * Prefers APP_BASE_URL; never returns localhost on Vercel.
 */
export function resolveAppBaseUrl(req) {
  const envCandidates = [
    process.env.APP_BASE_URL,
    process.env.SITE_URL,
    process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  ]
    .map(normalizeBaseUrl)
    .filter(Boolean);

  for (const url of envCandidates) {
    if (!isLocalhostUrl(url)) return url;
  }

  const host = req?.headers?.host;
  if (host && !host.includes("localhost") && !host.startsWith("127.0.0.1")) {
    return `https://${host}`;
  }

  if (process.env.VERCEL) {
    return DEFAULT_PRODUCTION_URL;
  }

  return host ? `http://${host}` : DEFAULT_PRODUCTION_URL;
}
