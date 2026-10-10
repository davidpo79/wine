import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gte, sql } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { db, schema } from "@/db";

const COOKIE = "wp_admin";
const MAX_AGE = 60 * 60 * 12; // 12h

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

function readSession(token: string | undefined, now = Date.now()): { a: number; v: number } | null {
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

export function readToken(token: string | undefined, now = Date.now()): number | null {
  return readSession(token, now)?.a ?? null;
}

export type Role = "admin" | "fulfilment";
export type AdminSession = { id: number; email: string; role: Role; mustChangePassword: boolean };

export async function hashPassword(pw: string) {
  return hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

/** The signed-in team member, checked against the database on every request (disabled = logged out at once). */
export async function getAdmin(): Promise<AdminSession | null> {
  const jar = await cookies();
  const s = readSession(jar.get(COOKIE)?.value);
  if (!s) return null;
  const [u] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, s.a)).limit(1);
  if (!u || u.disabledAt || u.sessionVersion !== s.v) return null;
  return { id: u.id, email: u.email, role: u.role === "fulfilment" ? "fulfilment" : "admin", mustChangePassword: u.mustChangePassword };
}

/**
 * Pages and actions call this. `role: "admin"` keeps Fulfilment users out (they land on Orders).
 * A user with a temporary password is sent to /admin/password first.
 */
export async function requireAdmin(opts: { role?: Role; allowPasswordChange?: boolean } = {}): Promise<AdminSession> {
  const a = await getAdmin();
  if (!a) redirect("/admin/login");
  if (a.mustChangePassword && !opts.allowPasswordChange) redirect("/admin/password");
  if (opts.role === "admin" && a.role !== "admin") redirect("/admin/orders");
  return a;
}

export async function setSessionCookie(id: number, version: number) {
  const jar = await cookies();
  jar.set(COOKIE, makeToken(id, Date.now(), version), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

const WINDOW_MIN = 15;
const MAX_FAILS = 5;

async function recentFailures(key: string) {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.loginAttempts)
    .where(and(eq(schema.loginAttempts.key, key), eq(schema.loginAttempts.success, false), gte(schema.loginAttempts.createdAt, since)));
  return r?.n ?? 0;
}

export async function login(email: string, password: string, ip: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const e = email.trim().toLowerCase();
  const keys = [`ip:${ip}`, `email:${e}`];
  for (const k of keys) {
    if ((await recentFailures(k)) >= MAX_FAILS) return { ok: false, error: `Too many attempts. Try again in ${WINDOW_MIN} minutes.` };
  }
  const [u] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.email, e)).limit(1);
  const ok = u && !u.disabledAt ? await verify(u.passwordHash, password).catch(() => false) : false;
  await db.insert(schema.loginAttempts).values(keys.map((key) => ({ key, success: ok })));
  if (!ok || !u) return { ok: false, error: "Wrong email or password." };
  await db.update(schema.adminUsers).set({ lastLoginAt: new Date() }).where(eq(schema.adminUsers.id, u.id));
  await setSessionCookie(u.id, u.sessionVersion);
  return { ok: true };
}

export async function logout() {
  (await cookies()).delete(COOKIE);
}
