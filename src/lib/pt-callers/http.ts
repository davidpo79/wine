// Portugal HR callers: request checks for the API routes.

/**
 * A POST from another site is refused even though the session cookie is
 * SameSite=Lax. The Origin is compared with the host the browser addressed
 * (behind Railway's proxy, the request URL carries the internal host).
 */
export function sameSite(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  let host: string;
  try { host = new URL(origin).host; } catch { return false; }
  const addressed = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim();
  const site = (() => { try { return new URL(process.env.SITE_URL ?? "").host; } catch { return ""; } })();
  return host === addressed || (site !== "" && host === site);
}
