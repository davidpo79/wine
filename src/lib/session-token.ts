// Admin session cookie: signed token (admin id + session version + expiry). No next/* imports, so the
// middleware can verify it too.
import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE = "wp_admin";
export const MAX_AGE = 60 * 60 * 12; // 12h


function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Session token: admin id + session version (bumped on disable / password change to log out everywhere) + expiry. */
export function makeToken(adminId: number, now = Date.now(), version = 1) {
  const payload = Buffer.from(JSON.stringify({ a: adminId, v: version, e: now + MAX_AGE * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSession(token: string | undefined, now = Date.now()): { a: number; v: number } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const { a, v, e } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof a !== "number" || typeof e !== "number" || e < now) return null;
    return { a, v: typeof v === "number" ? v : 1 };
  } catch {
    return null;
  }
}

